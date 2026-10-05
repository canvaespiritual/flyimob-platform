import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";
import { configureConnection, createCostRule, selectAccount, updateCampaign } from "../src/lib/marketing/admin.server";
import { storeDailyMetric, markDailyMetricUnavailable } from "../src/lib/marketing/metrics.server";
import { settings, overview, campaignList } from "../src/lib/marketing/queries.server";
import { enqueueSync, claimSync, finishSync, LEASE_MS } from "../src/lib/marketing/sync.server";
import { day, type MarketingViewer } from "../src/lib/marketing/policy";

loadDocumentationEnv();
const db = new PrismaClient({ log: [] });
const marker = `marketing-qa-${randomUUID()}`;
const checks: string[] = [];
const rollback = new Error("MANDATORY_MARKETING_QA_ROLLBACK");
async function inspect() {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const extensions = await tx.$queryRaw<{ available: boolean; installed: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='btree_gist') AS available, EXISTS(SELECT 1 FROM pg_extension WHERE extname='btree_gist') AS installed`;
    const migrations = await tx.$queryRaw<{ migration_name: string; finished: boolean }[]>`SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished FROM "_prisma_migrations" ORDER BY started_at`;
    const constraints = await tx.$queryRaw<{ conname: string; contype: string }[]>`SELECT conname, contype::text FROM pg_constraint WHERE conname LIKE 'Marketing_%' ORDER BY conname`;
    const tables = await tx.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'Marketing%' OR table_name LIKE 'Meta%' OR table_name='CampaignBrokerAssignment') ORDER BY table_name`;
    return { extensions: extensions[0], migrations, constraints, tables: tables.map(t => t.table_name) };
  });
}
async function main() {
try {
  if (process.argv.includes("--inspect")) console.log(JSON.stringify(await inspect(), null, 2));
  else if (process.argv.includes("--rollback-delivery-test")) {
    try {
      await db.$transaction(async tx => {
        const adapter = Object.assign(Object.create(tx), { $transaction: async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => run(tx) }) as typeof db;
        await tx.tenant.create({ data: { id: marker, slug: marker, name: "Synthetic Marketing delivery QA" } });
        await tx.tenant.create({ data: { id: `${marker}-foreign`, slug: `${marker}-foreign`, name: "Synthetic foreign delivery" } });
        const user = await tx.user.create({ data: { tenantId: marker, email: `${marker}@example.test`, name: "Synthetic", role: "OWNER" } });
        const owner: MarketingViewer = { tenant: { id: marker, isPlatform: false }, user: { id: user.id, tenantId: marker, role: "OWNER" } };
        const account = await tx.metaAdAccount.create({ data: { tenantId: marker, externalId: marker, name: "Synthetic", currency: "BRL", timezone: "America/Sao_Paulo" } });
        const campaign = await tx.marketingCampaign.create({ data: { tenantId: marker, accountId: account.id, externalId: marker, name: "Synthetic", purpose: "CLIENTES" } });
        const connection = await tx.metaConnection.create({ data: { tenantId: marker, label: "Synthetic delivery" } });
        const run = await tx.marketingSyncRun.create({ data: { tenantId: marker, connectionId: connection.id, accountId: account.id, idempotencyKey: marker, periodFrom: day("2026-10-20"), periodTo: day("2026-10-20") } });
        const expectFailure = async (label: string, action: () => Promise<unknown>) => {
          await tx.$executeRawUnsafe("SAVEPOINT delivery_expected_failure");
          let failed = false; try { await action(); } catch { failed = true; }
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT delivery_expected_failure");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT delivery_expected_failure");
          assert.ok(failed, label); checks.push(label);
        };
        const metric = await storeDailyMetric(marker, campaign.id, { date: "2026-10-20", metaSpend: "31", leads: 5, currency: "BRL", sourceObservedAt: new Date() }, adapter);
        const data = { tenantId: marker, campaignId: campaign.id, adSetExternalId: "22", adExternalId: "33", creativeExternalId: "44", date: day("2026-10-20"), currency: "BRL", metaSpend: new Prisma.Decimal("18"), conversations: 3, sourceObservedAt: new Date(), syncRunId: run.id };
        const ad = await tx.marketingAdDailyMetric.create({ data });
        await tx.marketingAdDailyMetric.update({ where: { id: ad.id }, data: { metaSpend: new Prisma.Decimal("31"), conversations: 5 } });
        assert.equal((await tx.marketingAdDailyMetric.findUniqueOrThrow({ where: { id: ad.id } })).metaSpend.toString(), "31");
        await expectFailure("ad_daily_unique", () => tx.marketingAdDailyMetric.create({ data }));
        await expectFailure("ad_daily_tenant_binding", () => tx.marketingAdDailyMetric.create({ data: { ...data, tenantId: `${marker}-foreign` } }));
        await expectFailure("ad_daily_nonnegative", () => tx.marketingAdDailyMetric.update({ where: { id: ad.id }, data: { conversations: -1 } }));
        await tx.marketingDailyMetric.update({ where: { id: metric.id }, data: { impressions: 1000n, clicks: 10n, linkClicks: 3n } });
        const report = await overview(owner, new URLSearchParams("period=custom&from=2026-10-20&to=2026-10-20"), adapter);
        assert.equal(report.totals[0].cpc, "3.10"); assert.equal(report.totals[0].cplMeta, "6.20"); assert.equal(report.totals[0].cpm, "31.00");
        await expectFailure("campaign_delivery_nonnegative", () => tx.marketingDailyMetric.update({ where: { id: metric.id }, data: { clicks: -1n } }));
        checks.push("creative_identity_intraday_delivery_ratios");
        const event = await tx.marketingAuditEvent.create({ data: { tenantId: marker, actorId: user.id, eventType: "SYNTHETIC_DELIVERY", entityId: campaign.id, metadata: { before: "PAUSED", after: "ACTIVE" } } });
        await expectFailure("audit_immutable", () => tx.marketingAuditEvent.delete({ where: { id: event.id } }));
        await expectFailure("audit_metadata_allowlist", () => tx.marketingAuditEvent.create({ data: { tenantId: marker, actorId: user.id, eventType: "UNSAFE", entityId: campaign.id, metadata: { token: "synthetic" } } }));
        throw rollback;
      }, { isolationLevel: "Serializable", timeout: 180000, maxWait: 10000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.equal(await db.tenant.count({ where: { id: { in: [marker, `${marker}-foreign`] } } }), 0);
    console.log(JSON.stringify({ checks, mandatoryRollback: true, syntheticTenantsRemaining: 0, externalCalls: 0 }));
  }
  else if (process.argv.includes("--rollback-test")) {
    try {
      await db.$transaction(async tx => {
        const adapter = Object.assign(Object.create(tx), { $transaction: async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => run(tx) }) as typeof db;
        await tx.tenant.create({ data: { id: marker, slug: marker, name: "Synthetic Marketing QA" } });
        await tx.tenant.create({ data: { id: `${marker}-foreign`, slug: `${marker}-foreign`, name: "Synthetic foreign operation" } });
        for (const [suffix, role] of [["owner", "OWNER"], ["director", "DIRECTOR"], ["gilberto", "BROKER"], ["laura", "BROKER"]] as const) await tx.user.create({ data: {
          id: `${marker}-${suffix}`, tenantId: marker, email: `${marker}-${suffix}@example.test`, name: suffix, role,
        } });
        const owner: MarketingViewer = { tenant: { id: marker, isPlatform: false }, user: { id: `${marker}-owner`, tenantId: marker, role: "OWNER" } };
        const director: MarketingViewer = { ...owner, user: { ...owner.user, id: `${marker}-director`, role: "DIRECTOR" } };
        const a = await configureConnection(owner, null, { label: "Synthetic authorization A" }, adapter);
        const b = await configureConnection(owner, null, { label: "Synthetic authorization B" }, adapter);
        const account = await tx.metaAdAccount.create({ data: { tenantId: marker, externalId: "synthetic-account", name: "Synthetic account", currency: "BRL", timezone: "America/Sao_Paulo" } });
        await tx.metaConnectionAccount.createMany({ data: [a, b].map(c => ({ tenantId: marker, connectionId: c.id, accountId: account.id })) });
        await selectAccount(owner, a.id, { accountId: account.id, selected: true }, adapter);
        assert.equal(await tx.metaAdAccount.count({ where: { tenantId: marker } }), 1);
        assert.equal(await tx.metaConnectionAccount.count({ where: { tenantId: marker, accountId: account.id } }), 2);
        checks.push("two_connections_one_canonical_account");
        const campaign = await tx.marketingCampaign.create({ data: { tenantId: marker, accountId: account.id, externalId: "synthetic-campaign", name: "Synthetic campaign" } });
        const savepoint = async (label: string, action: () => Promise<unknown>) => {
          await tx.$executeRawUnsafe("SAVEPOINT marketing_expected_failure");
          let rejected = false; try { await action(); } catch { rejected = true; }
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT marketing_expected_failure");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT marketing_expected_failure");
          assert.equal(rejected, true, label); checks.push(label);
        };
        await savepoint("tenant_foreign_key", () => tx.marketingCampaign.create({ data: { tenantId: `${marker}-foreign`, accountId: account.id, externalId: "foreign", name: "Foreign" } }));
        await savepoint("canonical_account_unique", () => tx.metaAdAccount.create({ data: { tenantId: marker, externalId: account.externalId, name: "Duplicate", currency: "BRL", timezone: "UTC" } }));
        await createCostRule(owner, { percentage: "12.75", validFrom: "2026-10-01" }, adapter);
        await createCostRule(owner, { percentage: "10", validFrom: "2027-01-01" }, adapter);
        await savepoint("cost_overlap_constraint", () => tx.marketingCostRule.create({ data: { tenantId: marker, percentage: 1, validFrom: day("2026-11-01"), createdById: owner.user.id } }));
        await savepoint("cost_history_immutable", async () => { const rule = await tx.marketingCostRule.findFirstOrThrow({ where: { tenantId: marker } }); return tx.marketingCostRule.update({ where: { id: rule.id }, data: { percentage: 99 } }); });
        await updateCampaign(director, campaign.id, { version: 0, purpose: "CLIENTES", assignment: { brokerId: `${marker}-gilberto`, validFrom: "2026-10-01" } }, adapter);
        await updateCampaign(director, campaign.id, { version: 1, assignment: { brokerId: `${marker}-laura`, validFrom: "2026-10-21" } }, adapter);
        await savepoint("assignment_overlap_constraint", () => tx.campaignBrokerAssignment.create({ data: { tenantId: marker, campaignId: campaign.id, brokerId: `${marker}-gilberto`, validFrom: day("2026-10-15"), createdById: owner.user.id } }));
        await assert.rejects(updateCampaign(director, campaign.id, { version: 0, purpose: "RECRUTAMENTO" }, adapter), /outra pessoa/);
        const input = { date: "2026-10-20", metaSpend: "18", leads: 3, currency: "BRL", sourceObservedAt: new Date("2026-10-20T13:00:00Z") };
        await storeDailyMetric(marker, campaign.id, input, adapter);
        await storeDailyMetric(marker, campaign.id, { ...input, metaSpend: "31", leads: 5, sourceObservedAt: new Date("2026-10-20T17:00:00Z") }, adapter);
        await storeDailyMetric(marker, campaign.id, input, adapter);
        await storeDailyMetric(marker, campaign.id, { ...input, date: "2026-10-21", metaSpend: "100", leads: 10 }, adapter);
        await storeDailyMetric(marker, campaign.id, { ...input, date: "2027-01-01", metaSpend: "100", leads: 10 }, adapter);
        await storeDailyMetric(marker, campaign.id, { ...input, date: "2026-10-22", metaSpend: "0", leads: 0 }, adapter);
        await markDailyMetricUnavailable(marker, campaign.id, "2026-10-20", "FAILED", adapter);
        await markDailyMetricUnavailable(marker, campaign.id, "2026-10-23", "MISSING", adapter);
        const updated = await tx.marketingDailyMetric.findUniqueOrThrow({ where: { tenantId_campaignId_date: { tenantId: marker, campaignId: campaign.id, date: day(input.date) } } });
        assert.equal(updated.metaSpend!.toString(), "31"); assert.equal(updated.effectiveSpend!.toFixed(2), "34.95"); assert.equal(updated.leads, 5); assert.equal(updated.state, "CONFIRMED");
        const january = await tx.marketingDailyMetric.findUniqueOrThrow({ where: { tenantId_campaignId_date: { tenantId: marker, campaignId: campaign.id, date: day("2027-01-01") } } });
        assert.equal(january.effectiveSpend!.toFixed(2), "110.00");
        await savepoint("metric_cost_snapshot_immutable", () => tx.marketingDailyMetric.update({ where: { id: updated.id }, data: { costPercentage: 99 } }));
        const report = await overview(owner, new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-31"), adapter);
        assert.equal(report.totals[0].metaSpend, "131.00"); assert.equal(report.unavailable, 1);
        assert.equal(report.brokers.find(b => b.id === `person:user:${marker}-gilberto`)!.metaSpend, "31.00");
        assert.equal(report.brokers.find(b => b.id === `person:user:${marker}-laura`)!.metaSpend, "100.00");
        checks.push("metric_replace_idempotency_snapshot_zero_missing_historical_brokers");
        await updateCampaign(owner, campaign.id, { version: 2, assignment: { brokerId: null, validFrom: "2026-10-21" } }, adapter);
        assert.equal(await tx.campaignBrokerAssignment.count({ where: { tenantId: marker, cancelledAt: { not: null } } }), 1);
        assert.equal((await overview(owner, new URLSearchParams("period=custom&from=2026-10-21&to=2026-10-21"), adapter)).brokers[0].name, "Não atribuídas");
        checks.push("future_assignment_cancel_preserves_history");
        assert.equal((await campaignList(owner, new URLSearchParams("metaStatus=ALL"), adapter)).items.length, 1);
        const safeSettings = await settings(owner, adapter);
        assert.equal(JSON.stringify(safeSettings).includes("credentialCiphertext"), false);
        await assert.rejects(configureConnection(director, null, { label: "Forbidden" }, adapter), /Acesso/);
        await assert.rejects(createCostRule(owner, { percentage: "1", validFrom: "2027-02-01", token: "forbidden" }, adapter), /Campo/);
        await savepoint("credential_envelope_constraint", () => tx.metaConnection.update({ where: { id: a.id }, data: { credentialCiphertext: Buffer.from("synthetic") } }));
        // Synthetic authorization only inside this mandatory rollback; no provider request.
        await tx.metaConnection.update({ where: { id: a.id }, data: { status: "AUTHORIZED", credentialCiphertext: Buffer.from("synthetic"), credentialNonce: Buffer.alloc(12), credentialAuthTag: Buffer.alloc(16), credentialKeyVersion: "synthetic-v1" } });
        const taskInput = { tenantId: marker, connectionId: a.id, accountId: account.id, idempotencyKey: "synthetic-task", from: "2026-10-01", to: "2026-10-03" };
        const task = await enqueueSync(taskInput, adapter); assert.equal((await enqueueSync(taskInput, adapter)).id, task.id);
        const now = new Date(); const claimed = await claimSync(marker, account.id, now, adapter); assert.ok(claimed);
        assert.equal(await claimSync(marker, account.id, now, adapter), null);
        await assert.rejects(finishSync(marker, task.id, "wrong-lease", null, now, adapter), /expirada/);
        assert.equal((await finishSync(marker, task.id, claimed.leaseToken, "RATE_LIMITED", now, adapter)).retry, true);
        const later = new Date(now.getTime() + 60001); const retry = await claimSync(marker, account.id, later, adapter); assert.ok(retry);
        const recovered = await claimSync(marker, account.id, new Date(later.getTime() + LEASE_MS + 1), adapter); assert.ok(recovered);
        assert.notEqual(recovered.leaseToken, retry.leaseToken);
        await assert.rejects(finishSync(marker, task.id, retry.leaseToken, null, new Date(), adapter), /expirada/);
        await finishSync(marker, task.id, recovered.leaseToken, null, new Date(later.getTime() + LEASE_MS + 2), adapter);
        checks.push("sync_idempotency_exclusive_claim_retry_recovery_fencing");
        const state = await tx.marketingOAuthState.create({ data: { id: "f".repeat(64), tenantId: marker, actorId: owner.user.id, connectionId: a.id, credentialVersion: 0, expiresAt: new Date(Date.now() + 600000) } });
        assert.equal((await tx.marketingOAuthState.updateMany({ where: { id: state.id, consumedAt: null }, data: { consumedAt: new Date() } })).count, 1);
        assert.equal((await tx.marketingOAuthState.updateMany({ where: { id: state.id, consumedAt: null }, data: { consumedAt: new Date() } })).count, 0);
        await savepoint("oauth_tenant_binding", () => tx.marketingOAuthState.create({ data: { id: "e".repeat(64), tenantId: `${marker}-foreign`, actorId: owner.user.id, connectionId: a.id, credentialVersion: 0, expiresAt: new Date() } }));
        checks.push("oauth_state_one_time_consumption");
        const adData = { tenantId: marker, campaignId: campaign.id, adSetExternalId: "22", adExternalId: "33", creativeExternalId: "44", date: day("2026-10-20"), currency: "BRL", metaSpend: new Prisma.Decimal("18"), conversations: 3, sourceObservedAt: new Date(), syncRunId: task.id };
        const ad = await tx.marketingAdDailyMetric.create({ data: adData });
        await tx.marketingAdDailyMetric.update({ where: { id: ad.id }, data: { metaSpend: new Prisma.Decimal("31"), conversations: 5 } });
        assert.equal((await tx.marketingAdDailyMetric.findUniqueOrThrow({ where: { id: ad.id } })).metaSpend.toString(), "31");
        await savepoint("ad_daily_unique", () => tx.marketingAdDailyMetric.create({ data: adData }));
        await savepoint("ad_daily_tenant_binding", () => tx.marketingAdDailyMetric.create({ data: { ...adData, tenantId: `${marker}-foreign` } }));
        await savepoint("ad_daily_nonnegative", () => tx.marketingAdDailyMetric.update({ where: { id: ad.id }, data: { conversations: -1 } }));
        await tx.marketingDailyMetric.update({ where: { id: updated.id }, data: { impressions: 1000n, clicks: 10n, linkClicks: 3n } });
        const deliveryReport = await overview(owner, new URLSearchParams("period=custom&from=2026-10-20&to=2026-10-20"), adapter);
        assert.equal(deliveryReport.totals[0].cpc, "3.10"); assert.equal(deliveryReport.totals[0].cplMeta, "6.20"); assert.equal(deliveryReport.totals[0].cpm, "31.00");
        await savepoint("campaign_delivery_nonnegative", () => tx.marketingDailyMetric.update({ where: { id: updated.id }, data: { clicks: -1n } }));
        checks.push("creative_identity_intraday_delivery_ratios");
        const events = await tx.marketingAuditEvent.findMany({ where: { tenantId: marker } });
        assert.ok(events.length >= 6);
        for (const event of events) for (const forbidden of ["credential", "token", "secret", "Synthetic authorization"]) assert.equal(JSON.stringify(event.metadata).includes(forbidden), false);
        await savepoint("audit_immutable", () => tx.marketingAuditEvent.delete({ where: { id: events[0].id } }));
        await savepoint("audit_metadata_allowlist", () => tx.marketingAuditEvent.create({ data: { tenantId: marker, actorId: owner.user.id, eventType: "UNSAFE", entityId: a.id, metadata: { token: "synthetic" } } }));
        throw rollback;
      }, { isolationLevel: "Serializable", timeout: 360000, maxWait: 10000 });
      throw new Error("Rollback sentinel did not execute");
    } catch (error) { if (error !== rollback) throw error; }
    const remaining = await db.tenant.count({ where: { id: { in: [marker, `${marker}-foreign`] } } });
    assert.equal(remaining, 0);
    console.log(JSON.stringify({ checks, mandatoryRollback: true, syntheticTenantsRemaining: remaining, externalCalls: 0 }));
  } else throw new Error("Use --inspect, --rollback-test or --rollback-delivery-test");
} catch (error) {
  // Do not print database URLs, Prisma parameters, payloads or external errors.
  console.error(JSON.stringify({ failed: true, name: error instanceof Error ? error.name : "unknown", code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : undefined,
    transactionExpired: error instanceof Prisma.PrismaClientKnownRequestError && /expired|timeout/i.test(String(error.meta?.error ?? "")), completedChecks: checks }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
}
void main();
