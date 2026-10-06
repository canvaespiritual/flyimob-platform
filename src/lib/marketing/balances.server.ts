import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { connectionClient } from "./connections.server";
import { identifier, MetaError, type MetaClient } from "./meta.server";
import { authorize, type MarketingViewer } from "./policy";

/** Conservative interpretation of the confirmed prepaid display; balance is never a fallback. */
export function parseAvailableBalance(display: unknown, currency: string): Prisma.Decimal | null {
  if (typeof display !== "string" || display.length > 1000 || !["BRL", "USD", "EUR", "GBP", "CAD", "AUD", "CHF"].includes(currency)) return null;
  const match = display.normalize("NFKC").trim().match(/^(?:Saldo disponível|Available (?:funds|balance))\s*\(\s*([^()]+?)\s+([A-Z]{3})\s*\)$/i);
  if (!match || match[2].toUpperCase() !== currency) return null;
  const prefixes: Record<string, RegExp> = { BRL: /^R\$/, USD: /^(?:US\$|\$)/, EUR: /^€/, GBP: /^£/, CAD: /^C\$/, AUD: /^A\$/, CHF: /^CHF/ };
  if (!prefixes[currency].test(match[1].trim())) return null;
  let money = match[1].replace(/^(?:R\$|US\$|C\$|A\$|CHF|[$€£])\s*/, "").replace(/\s/g, "");
  if (currency === "BRL" || currency === "EUR") {
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(money)) return null;
    money = money.replaceAll(".", "").replace(",", ".");
  } else {
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(money)) return null;
    money = money.replaceAll(",", "");
  }
  if (!/^\d{1,16}\.\d{2}$/.test(money)) return null;
  return new Prisma.Decimal(money);
}
export function balanceObservation(payload: Record<string, unknown>, expectedCurrency: string, externalId: string) {
  if (payload.id !== `act_${externalId}` || payload.currency !== expectedCurrency) throw new MetaError("INVALID_RESPONSE");
  const details = payload.funding_source_details && typeof payload.funding_source_details === "object" && !Array.isArray(payload.funding_source_details) ? payload.funding_source_details as Record<string, unknown> : {};
  const displayString = typeof details.display_string === "string" && details.display_string.length <= 1000 ? details.display_string : null;
  const fundingSourceId = typeof (details.id ?? payload.funding_source) === "string" && /^\d{1,120}$/.test(String(details.id ?? payload.funding_source)) ? String(details.id ?? payload.funding_source) : null;
  const fundingSourceType = Number.isSafeInteger(details.type) && Number(details.type) >= 0 && Number(details.type) <= 2147483647 ? Number(details.type) : null;
  const availableBalance = parseAvailableBalance(displayString, expectedCurrency);
  const safePayload: Record<string, Prisma.InputJsonValue | null> = { id: String(payload.id), currency: expectedCurrency, funding_source: fundingSourceId, funding_source_details: { display_string: displayString, id: fundingSourceId, type: fundingSourceType } };
  for (const field of ["account_status", "balance", "amount_spent", "spend_cap"] as const) if ((typeof payload[field] === "string" && String(payload[field]).length <= 100) || Number.isSafeInteger(payload[field])) safePayload[field] = payload[field] as string | number;
  return { availableBalance, state: availableBalance === null ? "UNSUPPORTED" : "AVAILABLE", displayString, fundingSourceId, fundingSourceType, payload: safePayload };
}
export async function syncAccountBalance(tenantId: string, accountId: string, connectionId: string, observationKey: string, db = prisma, supplied?: { client: MetaClient; credentialVersion: number }) {
  const existing = await db.marketingBalanceSnapshot.findUnique({ where: { tenantId_accountId_observationKey: { tenantId, accountId, observationKey } }, select: { state: true } });
  if (existing) return { accountId, state: existing.state };
  const account = await db.metaAdAccount.findFirst({ where: { tenantId, id: accountId }, select: { externalId: true, currency: true, status: true } });
  if (!account) return { accountId, state: "UNAVAILABLE" };
  const observedAt = new Date(); let credentialVersion: number | undefined; let authFailure: MetaError | undefined;
  let result: { availableBalance: Prisma.Decimal | null; state: string; displayString: string | null; fundingSourceId: string | null; fundingSourceType: number | null; payload: Prisma.InputJsonObject; safeErrorCode?: string };
  try {
    const auth = supplied ?? await connectionClient(tenantId, connectionId, db); credentialVersion = auth.credentialVersion;
    const payload = await auth.client.get(`act_${identifier(account.externalId)}`, { fields: "id,currency,account_status,balance,amount_spent,spend_cap,funding_source,funding_source_details" });
    result = balanceObservation(payload, account.currency, account.externalId);
  } catch (error) {
    if (error instanceof MetaError && error.safeCode === "AUTHORIZATION_REQUIRED") authFailure = error;
    const safeErrorCode = error instanceof MetaError ? error.safeCode : "PROVIDER_UNAVAILABLE";
    result = { availableBalance: null, state: "UNAVAILABLE", displayString: null, fundingSourceId: null, fundingSourceType: null, payload: {}, safeErrorCode };
  }
  let persisted=false;
  await db.$transaction(async tx => {
    const link = await tx.metaConnectionAccount.findFirst({ where: { tenantId, accountId, connectionId, selected: true, accessible: true, connection: { status: "AUTHORIZED", OR: [{expiresAt:null},{expiresAt:{gt:new Date()}}], ...(credentialVersion === undefined ? {} : { credentialVersion }) } }, select: { id: true } });
    if (!link) return;
    await tx.marketingBalanceSnapshot.upsert({ where: { tenantId_accountId_observationKey: { tenantId, accountId, observationKey } }, create: { tenantId, accountId, observationKey, observedAt, currency: account.currency, ...result }, update: {} });
    persisted=true;
    const accountStatus=result.payload.account_status;
    if (Number.isSafeInteger(accountStatus) && Number(accountStatus)>=0 && Number(accountStatus)<=2147483647 && !await tx.marketingBalanceSnapshot.findFirst({where:{tenantId,accountId,observedAt:{gt:observedAt}},select:{id:true}})) {
      await tx.metaAdAccount.updateMany({where:{tenantId,id:accountId},data:{sourceAccountStatus:Number(accountStatus)}});
    }
  });
  if (authFailure && credentialVersion !== undefined) {
    if (authFailure.connectionInvalid) await db.metaConnection.updateMany({ where: { tenantId, id: connectionId, credentialVersion }, data: { status: "REVOKED", revokedAt: new Date(), safeErrorCode: authFailure.safeCode } });
    else await db.metaConnectionAccount.updateMany({ where: { tenantId, accountId, connectionId, connection: { credentialVersion } }, data: { accessible: false } });
  }
  return { accountId, state: persisted ? result.state : "UNAVAILABLE" };
}
/** Bounded manual pass and scheduled pass share ten-minute keys; no aggressive polling. */
export async function syncSelectedBalances(viewer: MarketingViewer, db = prisma) {
  authorize(viewer, true);
  return syncBalancesForTenant(viewer.tenant.id, db);
}
export async function syncBalancesForTenant(tenantId: string, db = prisma) {
  const links = await db.metaConnectionAccount.findMany({ where: { tenantId, selected: true, accessible: true, connection: { status: "AUTHORIZED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }, select: { accountId: true, connectionId: true }, orderBy: { connectionId: "asc" }, take: 500 });
  const seen = new Set<string>(), results = [];
  for (const link of links) { if (seen.has(link.accountId)) continue; seen.add(link.accountId); results.push(await syncAccountBalance(tenantId, link.accountId, link.connectionId, `balance:${Math.floor(Date.now()/600000)}`, db)); }
  return { results };
}
