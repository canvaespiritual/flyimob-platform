import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { day, MarketingError, text } from "./policy";
import { marketingTransaction } from "./admin.server";

export const SYNC_ERROR_CODES = ["AUTHORIZATION_REQUIRED", "PROVIDER_UNAVAILABLE", "RATE_LIMITED", "INVALID_RESPONSE", "LEASE_EXPIRED"] as const;
type SafeErrorCode = typeof SYNC_ERROR_CODES[number];
export const LEASE_MS = 10 * 60 * 1000;
/** Trusted backend queue boundary, dispatched by worker.server and the OWNER sync endpoint. */
export async function enqueueSync(input: { tenantId: string; connectionId: string; accountId: string; idempotencyKey: string; from: string; to: string }, db = prisma) {
  const periodFrom = day(input.from), periodTo = day(input.to);
  if (periodFrom > periodTo) throw new MarketingError(400, "Período inválido.");
  const idempotencyKey = text(input.idempotencyKey, "Chave da tarefa", 200);
  return marketingTransaction(db, async tx => {
    const link = await tx.metaConnectionAccount.findUnique({ where: { tenantId_connectionId_accountId: { tenantId: input.tenantId, connectionId: input.connectionId, accountId: input.accountId } }, include: { connection: true, account: true } });
    if (!link?.selected || !link.accessible || link.connection.status !== "AUTHORIZED" || !link.connection.credentialCiphertext ||
        (link.connection.expiresAt && link.connection.expiresAt <= new Date()) || link.account.status !== "ACTIVE") throw new MarketingError(409, "Conexão real autorizada e conta selecionada são necessárias para sincronizar.");
    const where = { tenantId_accountId_idempotencyKey: { tenantId: input.tenantId, accountId: input.accountId, idempotencyKey } };
    const existing = await tx.marketingSyncRun.findUnique({ where });
    if (existing) {
      if (existing.connectionId !== input.connectionId || existing.periodFrom.getTime() !== periodFrom.getTime() || existing.periodTo.getTime() !== periodTo.getTime()) throw new MarketingError(409, "Chave de tarefa já utilizada para outro pedido.");
      return existing;
    }
    return tx.marketingSyncRun.create({ data: { tenantId: input.tenantId, connectionId: input.connectionId, accountId: input.accountId, idempotencyKey, periodFrom, periodTo } });
  });
}
export async function claimSync(tenantId: string, accountId: string, now = new Date(), db = prisma) {
  return marketingTransaction(db, async tx => {
    const stale = await tx.marketingSyncRun.findMany({ where: { tenantId, accountId, status: "RUNNING", claimedAt: { lt: new Date(now.getTime() - LEASE_MS) } }, select: { id: true, attempts: true, maxAttempts: true } });
    for (const run of stale) await tx.marketingSyncRun.updateMany({ where: { id: run.id, tenantId, status: "RUNNING", claimedAt: { lt: new Date(now.getTime() - LEASE_MS) } }, data: {
      status: run.attempts >= run.maxAttempts ? "FAILED" : "PENDING", leaseToken: null, claimedAt: null, nextAttemptAt: now, safeErrorCode: "LEASE_EXPIRED", finishedAt: run.attempts >= run.maxAttempts ? now : null,
    } });
    if (await tx.marketingSyncRun.count({ where: { tenantId, accountId, status: "RUNNING" } })) return null;
    const candidate = await tx.marketingSyncRun.findFirst({ where: { tenantId, accountId, status: "PENDING", nextAttemptAt: { lte: now },
      connection: { status: "AUTHORIZED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      account: { status: "ACTIVE", connections: { some: { tenantId, selected: true, accessible: true } } },
    }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }] });
    if (!candidate || candidate.attempts >= candidate.maxAttempts) return null;
    const exactLink = await tx.metaConnectionAccount.findUnique({ where: { tenantId_connectionId_accountId: { tenantId, connectionId: candidate.connectionId, accountId } } });
    if (!exactLink?.selected || !exactLink.accessible) return null;
    const leaseToken = randomUUID();
    const claim = await tx.marketingSyncRun.updateMany({ where: { id: candidate.id, tenantId, status: "PENDING", attempts: candidate.attempts }, data: {
      status: "RUNNING", leaseToken, claimedAt: now, startedAt: now, attempts: { increment: 1 }, safeErrorCode: null,
    } });
    return claim.count ? { ...candidate, leaseToken, claimedAt: now, attempts: candidate.attempts + 1 } : null;
  });
}
export async function finishSync(tenantId: string, id: string, leaseToken: string, errorCode: SafeErrorCode | null, now = new Date(), db = prisma) {
  if (errorCode !== null && !SYNC_ERROR_CODES.includes(errorCode)) throw new MarketingError(400, "Código de erro não permitido.");
  return marketingTransaction(db, async tx => {
    const run = await tx.marketingSyncRun.findFirst({ where: { id, tenantId, leaseToken, status: "RUNNING", claimedAt: { gte: new Date(now.getTime() - LEASE_MS) } } });
    if (!run) throw new MarketingError(409, "Execução expirada ou já concluída.");
    const retry = errorCode !== null && errorCode !== "AUTHORIZATION_REQUIRED" && run.attempts < run.maxAttempts;
    const result = await tx.marketingSyncRun.updateMany({ where: { id, tenantId, status: "RUNNING", leaseToken }, data: {
      status: errorCode === null ? "SUCCEEDED" : retry ? "PENDING" : "FAILED", leaseToken: null, claimedAt: null,
      safeErrorCode: errorCode, finishedAt: retry ? null : now, nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** Math.max(0, run.attempts - 1))),
    } });
    if (!result.count) throw new MarketingError(409, "Execução alterada por outro worker.");
    if (errorCode === null) {
      await tx.metaConnection.update({ where: { tenantId_id: { tenantId, id: run.connectionId } }, data: { lastSyncedAt: now, safeErrorCode: null } });
      await tx.metaAdAccount.update({ where: { tenantId_id: { tenantId, id: run.accountId } }, data: { lastSyncedAt: now } });
    }
    return { retry };
  });
}
