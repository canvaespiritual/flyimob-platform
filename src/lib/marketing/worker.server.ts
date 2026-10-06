import { syncAccountBalance } from "./balances.server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, bodyObject, civilToday, day, MarketingError, period, type MarketingViewer } from "./policy";
import { audit, marketingTransaction } from "./admin.server";
import { connectionClient } from "./connections.server";
import { identifier, insight, MetaError, object, providerText } from "./meta.server";
import { effectiveSpend } from "./metrics.server";
import { claimSync, enqueueSync, finishSync, LEASE_MS } from "./sync.server";

export function syncRange(timezone: string, first: boolean, now = new Date()) {
  const to = civilToday(timezone, now), today = day(to);
  const from = first ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)) : new Date(today.getTime() - 7 * 86400000);
  return { from: from.toISOString().slice(0, 10), to };
}
export async function syncSelected(viewer: MarketingViewer, value: unknown, db = prisma) {
  authorize(viewer, true); const body = bodyObject(value, ["from", "to"]), tenantId = viewer.tenant.id;
  let custom: { from: string; to: string } | undefined;
  if (body.from !== undefined || body.to !== undefined) {
    const range = period(new URLSearchParams({ period: "custom", from: String(body.from), to: String(body.to) })); custom = range;
  }
  const accounts = await db.metaAdAccount.findMany({ where: { tenantId, status: "ACTIVE", sourceAccountStatus: 1,
    connections: { some: { tenantId, selected: true, accessible: true, connection: { status: "AUTHORIZED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } },
    select: { id: true, timezone: true, lastSyncedAt: true, connections: { where: { selected: true, accessible: true, connection: { status: "AUTHORIZED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }, select: { connectionId: true }, orderBy: { connectionId: "asc" } } } });
  if (!accounts.length) throw new MarketingError(409, "Autorize uma conexão e selecione ao menos uma conta ativa antes de atualizar.");
  const results: { accountId: string; status: string; code?: string }[] = [];
  for (const account of accounts) {
    const range = custom ?? syncRange(account.timezone, !account.lastSyncedAt);
    const existing = await db.marketingSyncRun.findFirst({ where: { tenantId, accountId: account.id, status: { in: ["PENDING", "RUNNING"] } }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, periodFrom: true, periodTo: true } });
    if (custom && existing && (existing.periodFrom.getTime() !== day(custom.from).getTime() || existing.periodTo.getTime() !== day(custom.to).getTime())) throw new MarketingError(409, "Conclua a sincronização pendente antes de solicitar outro período.");
    if (existing?.status === "PENDING") await db.marketingSyncRun.updateMany({ where: { tenantId, id: existing.id, status: "PENDING" }, data: { connectionId: account.connections[0].connectionId } });
    const queued = existing ?? await enqueueSync({ tenantId, accountId: account.id, connectionId: account.connections[0].connectionId, idempotencyKey: randomUUID(), ...range }, db);
    await marketingTransaction(db, tx => audit(tx, viewer, "META_SYNC_REQUESTED", queued.id, {}));
    const run = await claimSync(tenantId, account.id, new Date(), db);
    if (!run) { results.push({ accountId: account.id, status: "PENDING" }); continue; }
    results.push(await executeSync(run, db));
  }
  return { results, updatedAt: new Date().toISOString() };
}

type Claimed = NonNullable<Awaited<ReturnType<typeof claimSync>>>;
export async function executeSync(run: Claimed, db = prisma) {
  const tenantId = run.tenantId, accountId = run.accountId;
  let credentialVersion: number | undefined;
  try {
    const authorization = await connectionClient(tenantId, run.connectionId, db); credentialVersion = authorization.credentialVersion;
    const client = authorization.client, account = await db.metaAdAccount.findFirst({ where: { tenantId, id: accountId } });
    if (!account || account.sourceAccountStatus !== 1) throw new MetaError("INVALID_RESPONSE");
    const observed = new Date(), path = `act_${identifier(account.externalId)}`;
    const campaignRows = await client.pages(`${path}/campaigns`, { fields: "id,name,status,effective_status,created_time" });
    const campaigns: { externalId: string; name: string; sourceStatus: string | null; effectiveStatus: string | null; sourceCreatedAt: Date | null }[] = campaignRows.map(row => ({ externalId: identifier(row.id), name: providerText(row.name), sourceStatus: providerText(row.status, 40), effectiveStatus: providerText(row.effective_status, 40),
      sourceCreatedAt: row.created_time ? new Date(providerText(row.created_time, 80)) : null }));
    if (campaigns.some(c => c.sourceCreatedAt && !Number.isFinite(c.sourceCreatedAt.getTime()))) throw new MetaError("INVALID_RESPONSE");
    const adRows = await client.pages(`${path}/ads`, { fields: "id,campaign_id,adset_id,creative{id}" });
    const ads = new Map(adRows.map(row => [identifier(row.id), { campaignId: identifier(row.campaign_id), adSetExternalId: identifier(row.adset_id),
      creativeExternalId: row.creative ? identifier(object(row.creative).id) : null }]));
    const params = { fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,date_start,date_stop", time_increment: "1",
      time_range: JSON.stringify({ since: run.periodFrom.toISOString().slice(0, 10), until: run.periodTo.toISOString().slice(0, 10) }) };
    const metricRows = await client.pages(`${path}/insights`, { ...params, level: "campaign" });
    const adMetricRows = await client.pages(`${path}/insights`, { ...params, fields: `${params.fields},ad_id,adset_id`, level: "ad" });
    const historicalNames = new Map<string, string>();
    for (const row of [...metricRows, ...adMetricRows]) if (row.campaign_name !== undefined) historicalNames.set(identifier(row.campaign_id), providerText(row.campaign_name));
    const metrics = metricRows.map(row => ({ campaignExternalId: identifier(row.campaign_id), ...insight(row) }));
    const adMetrics = adMetricRows.map(row => {
      const adExternalId = identifier(row.ad_id), identity = ads.get(adExternalId);
      // An unknown historic ad still retains stable source ad/adset IDs, without fabricating a creative.
      return { campaignExternalId: identifier(row.campaign_id), adExternalId, adSetExternalId: identifier(row.adset_id), creativeExternalId: identity?.creativeExternalId ?? null, ...insight(row) };
    });
    const seen = new Set<string>();
    for (const [kind, values] of [["campaign", metrics], ["ad", adMetrics]] as const) for (const row of values) {
      const date = day(row.date), key = `${kind}:${"adExternalId" in row ? row.adExternalId : row.campaignExternalId}:${row.date}`;
      if (date < run.periodFrom || date > run.periodTo || seen.has(key)) throw new MetaError("INVALID_RESPONSE"); seen.add(key);
    }
    // Complete responses are committed atomically. A page failure leaves the prior entire observation intact.
    await db.$transaction(async tx => {
      const now = new Date();
      const locked = await tx.marketingSyncRun.updateMany({ where: { id: run.id, tenantId, status: "RUNNING", leaseToken: run.leaseToken,
        claimedAt: { gte: new Date(now.getTime() - LEASE_MS) }, connection: { status: "AUTHORIZED", credentialVersion },
        account: { status: "ACTIVE", sourceAccountStatus: 1 }, }, data: { claimedAt: now } });
      if (!locked.count) throw new MarketingError(409, "Sincronização expirada ou autorização alterada.");
      const link = await tx.metaConnectionAccount.findUnique({ where: { tenantId_connectionId_accountId: { tenantId, connectionId: run.connectionId, accountId } } });
      if (!link?.selected || !link.accessible) throw new MarketingError(409, "Conta removida da seleção durante a sincronização.");
      const saved = new Map<string, string>();
      for (const data of campaigns) {
        const row = await tx.marketingCampaign.upsert({ where: { tenantId_accountId_externalId: { tenantId, accountId, externalId: data.externalId } },
          create: { tenantId, accountId, ...data, lastSyncedAt: now }, update: { ...data, lastSyncedAt: now, version: { increment: 1 } }, select: { id: true } });
        saved.set(data.externalId, row.id);
      }
      // Insights may contain archived campaigns that the campaigns edge omitted.
      const historical = await tx.marketingCampaign.findMany({ where: { tenantId, accountId }, select: { id: true, externalId: true } });
      for (const row of historical) saved.set(row.externalId, row.id);
      for (const metric of [...metrics, ...adMetrics]) if (!saved.has(metric.campaignExternalId)) {
        const name = historicalNames.get(metric.campaignExternalId);
        if (!name) throw new MetaError("INVALID_RESPONSE");
        const row = await tx.marketingCampaign.upsert({ where: { tenantId_accountId_externalId: { tenantId, accountId, externalId: metric.campaignExternalId } },
          create: { tenantId, accountId, externalId: metric.campaignExternalId, name, lastSyncedAt: now }, update: { name, lastSyncedAt: now }, select: { id: true } });
        saved.set(metric.campaignExternalId, row.id);
      }
      for (const metric of metrics) {
        const campaignId = saved.get(metric.campaignExternalId); if (!campaignId) throw new MetaError("INVALID_RESPONSE");
        const date = day(metric.date), where = { tenantId_campaignId_date: { tenantId, campaignId, date } };
        const previous = await tx.marketingDailyMetric.findUnique({ where });
        if (previous?.sourceObservedAt && previous.sourceObservedAt >= observed) continue;
        const rule = previous?.costPercentage != null ? null : await tx.marketingCostRule.findFirst({ where: { tenantId, validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gt: date } }] } });
        const costPercentage = previous?.costPercentage ?? rule?.percentage ?? new Prisma.Decimal(0), metaSpend = new Prisma.Decimal(metric.metaSpend);
        const data = { metaSpend, leads: metric.leads, impressions: metric.impressions, clicks: metric.clicks, linkClicks: metric.linkClicks,
          currency: account.currency, state: "CONFIRMED" as const, costPercentage, costRuleId: previous?.costRuleId ?? rule?.id ?? null,
          effectiveSpend: effectiveSpend(metaSpend, costPercentage), sourceObservedAt: observed, syncedAt: now, lastAttemptAt: now, syncRunId: run.id };
        await tx.marketingDailyMetric.upsert({ where, create: { tenantId, campaignId, date, ...data }, update: data });
      }
      for (const metric of adMetrics) {
        const campaignId = saved.get(metric.campaignExternalId); if (!campaignId) throw new MetaError("INVALID_RESPONSE");
        const date = day(metric.date), where = { tenantId_adExternalId_date: { tenantId, adExternalId: metric.adExternalId, date } };
        const previous = await tx.marketingAdDailyMetric.findUnique({ where });
        if (previous && previous.sourceObservedAt >= observed) continue;
        const data = { campaignId, adSetExternalId: metric.adSetExternalId, creativeExternalId: metric.creativeExternalId, currency: account.currency,
          metaSpend: new Prisma.Decimal(metric.metaSpend), conversations: metric.leads, sourceObservedAt: observed, syncRunId: run.id };
        await tx.marketingAdDailyMetric.upsert({ where, create: { tenantId, adExternalId: metric.adExternalId, date, ...data }, update: data });
      }
      // Success and observations share the same transaction and lease fence.
      await tx.marketingSyncRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", leaseToken: null, claimedAt: null, finishedAt: now, safeErrorCode: null } });
      await tx.metaAdAccount.update({ where: { tenantId_id: { tenantId, id: accountId } }, data: { lastSyncedAt: now } });
      await tx.metaConnection.update({ where: { tenantId_id: { tenantId, id: run.connectionId } }, data: { lastSyncedAt: now, safeErrorCode: null } });
    }, { isolationLevel: "Serializable", timeout: 120000 });
    try { await syncAccountBalance(tenantId, accountId, run.connectionId, `sync:${run.id}`, db, authorization); } catch { /* Physical-balance availability is independent from the successful metric transaction. */ }
    return { accountId, status: "SUCCEEDED" };
  } catch (error) {
    const code = error instanceof MetaError ? error.safeCode : "PROVIDER_UNAVAILABLE";
    if (credentialVersion !== undefined) await db.metaConnection.updateMany({ where: { tenantId, id: run.connectionId, credentialVersion }, data: { safeErrorCode: code } });
    if (code === "AUTHORIZATION_REQUIRED" && credentialVersion !== undefined) {
      if (!(error instanceof MetaError) || error.connectionInvalid) await db.metaConnection.updateMany({ where: { tenantId, id: run.connectionId, credentialVersion }, data: { status: "REVOKED", revokedAt: new Date(), safeErrorCode: code } });
      else await db.metaConnectionAccount.updateMany({ where: { tenantId, connectionId: run.connectionId, accountId, connection: { credentialVersion } }, data: { accessible: false } });
    }
    try { await finishSync(tenantId, run.id, run.leaseToken, code, new Date(), db); } catch { /* An expired worker cannot finish another lease. */ }
    return { accountId, status: "FAILED", code };
  }
}
