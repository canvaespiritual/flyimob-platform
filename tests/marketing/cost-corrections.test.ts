import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { createSessionToken } from "../../src/lib/auth.server";
import { applyCostCorrections, confirmCostCorrection, correctionPlan, previewCostCorrection } from "../../src/lib/marketing/cost-corrections.server";
import { summarize, storeDailyMetric, type ReportRow } from "../../src/lib/marketing/metrics.server";
import { overview } from "../../src/lib/marketing/queries.server";
import { GET, PATCH, POST } from "../../src/app/api/marketing/settings/cost-rules/[id]/validity/route";
import { day, type MarketingViewer } from "../../src/lib/marketing/policy";

process.env.SESSION_SECRET = "synthetic-cost-correction-test-secret";
const owner: MarketingViewer = { user: { id: "owner", tenantId: "a", role: "OWNER" }, tenant: { id: "a", isPlatform: false } };
const reason = "Correção da vigência inicial cadastrada incorretamente na implantação do módulo.";
type Row = Record<string, unknown>;
const rule = () => ({ id: "rule", percentage: new Prisma.Decimal("12.15"), validFrom: day("2026-10-05"), validTo: null as Date | null });
function fixture() {
  const rules = [rule()], audits: Row[] = [], writes: Row[] = [];
  const tx = {
    marketingCostRule: { findMany: async ({ where }: { where: Row }) => { assert.equal(where.tenantId, "a"); return rules; }, update: async ({ where, data }: { where: { tenantId_id: Row }; data: Row }) => { assert.equal(where.tenantId_id.tenantId, "a"); writes.push(data); Object.assign(rules[0], data); return rules[0]; } },
    marketingAuditEvent: { create: async ({ data }: { data: Row }) => { audits.push(data); return { id: "audit", createdAt: new Date(), ...data }; } },
    marketingDailyMetric: new Proxy({}, { get: () => assert.fail("correction must never write or read raw metrics") }),
  };
  const db = { ...tx, $transaction: async (run: (tx: unknown) => unknown, options: Row) => { assert.equal(options.isolationLevel, "Serializable"); const before = { ...rules[0] }, auditCount = audits.length, writeCount = writes.length; try { return await run(tx); } catch (e) { Object.assign(rules[0], before); audits.length = auditCount; writes.length = writeCount; throw e; } } } as unknown as typeof prisma;
  return { rules, audits, writes, db, tx };
}
const input = { validFrom: "2026-04-01", reason };
test("OWNER reviews without writes then explicitly corrects 05/10 to 01/04 with permanent before/after audit", async () => {
  const f = fixture(), review = await previewCostCorrection(owner, "rule", input, f.db);
  assert.equal(f.writes.length + f.audits.length, 0);
  assert.deepEqual([review.oldStart, review.newStart, review.affectedFrom, review.affectedTo], ["2026-10-05", "2026-04-01", "2026-04-01", "2026-10-05"]);
  await confirmCostCorrection(owner, "rule", { reviewToken: review.reviewToken, confirmed: true }, f.db);
  assert.deepEqual(f.writes, [{ validFrom: day("2026-04-01") }]); assert.equal(f.rules[0].percentage.toString(), "12.15");
  assert.equal(f.audits[0].actorId, "owner"); assert.equal(f.audits[0].entityId, "rule"); assert.equal(f.audits[0].tenantId, "a");
  assert.deepEqual(f.audits[0].metadata, { percentage: "12.15", before: { validFrom: "2026-10-05", validTo: null }, after: { validFrom: "2026-04-01", validTo: null, affectedFrom: "2026-04-01", affectedTo: "2026-10-05", reason } });
});
for (const role of ["DIRECTOR", "MANAGER", "BROKER", "DATA_ENTRY", "CORRESPONDENTE"] as const) test(`${role} cannot preview or confirm historical corrections`, async () => {
  const viewer = { ...owner, user: { ...owner.user, role } }, f = fixture();
  await assert.rejects(previewCostCorrection(viewer, "rule", input, f.db), /Acesso/);
  await assert.rejects(confirmCostCorrection(viewer, "rule", {}, f.db), /Acesso/);
  assert.equal(f.writes.length + f.audits.length, 0);
});
test("reason and explicit confirmation required; percentage, end and tenant overrides rejected", async () => {
  const f = fixture();
  for (const value of [{ validFrom: input.validFrom }, { ...input, reason: " " }, { ...input, percentage: "15" }, { ...input, tenantId: "foreign" }, { ...input, validTo: null }]) await assert.rejects(previewCostCorrection(owner, "rule", value, f.db));
  const review = await previewCostCorrection(owner, "rule", input, f.db);
  for (const value of [{ reviewToken: review.reviewToken }, { reviewToken: review.reviewToken, confirmed: false }, { reviewToken: review.reviewToken, confirmed: true, validFrom: "2025-01-01" }]) await assert.rejects(confirmCostCorrection(owner, "rule", value, f.db));
});
test("tampered, expired, stale, cross-operation, cross-user, cross-rule and replayed reviews cannot commit", async t => {
  const f = fixture(), review = await previewCostCorrection(owner, "rule", input, f.db);
  await assert.rejects(confirmCostCorrection(owner, "rule", { confirmed: true, reviewToken: `${review.reviewToken}x` }, f.db));
  for (const viewer of [{ ...owner, tenant: { id: "b", isPlatform: false }, user: { ...owner.user, tenantId: "b" } }, { ...owner, user: { ...owner.user, id: "another-owner" } }]) await assert.rejects(confirmCostCorrection(viewer, "rule", { confirmed: true, reviewToken: review.reviewToken }, f.db));
  await assert.rejects(confirmCostCorrection(owner, "other-rule", { confirmed: true, reviewToken: review.reviewToken }, f.db));
  const now = Date.now(); const clock = t.mock.method(Date, "now", () => now + 16 * 60 * 1000);
  await assert.rejects(confirmCostCorrection(owner, "rule", { confirmed: true, reviewToken: review.reviewToken }, f.db), /expirou/); clock.mock.restore();
  f.rules.push({ ...rule(), id: "future", validFrom: day("2027-01-01") });
  await assert.rejects(confirmCostCorrection(owner, "rule", { confirmed: true, reviewToken: review.reviewToken }, f.db), /vigências mudaram/); f.rules.pop();
  await confirmCostCorrection(owner, "rule", { confirmed: true, reviewToken: review.reviewToken }, f.db);
  await assert.rejects(confirmCostCorrection(owner, "rule", { confirmed: true, reviewToken: review.reviewToken }, f.db), /vigências mudaram/);
});
test("complete timeline prevents overlap, duplicate starts, reversal and ambiguous crossing of later rules", () => {
  const rules = [{ ...rule(), id: "previous", validFrom: day("2026-01-01"), validTo: day("2026-10-05") }, { ...rule(), validTo: day("2027-01-01") }, { ...rule(), id: "next", validFrom: day("2027-01-01") }];
  for (const start of ["2026-04-01", "2026-01-01", "2027-01-01", "2027-02-01"]) assert.throws(() => correctionPlan(rules, "rule", start), /sobrepõe/);
  assert.throws(() => correctionPlan(rules, "rule", "2026-10-05"), /diferente/);
  assert.throws(() => correctionPlan(rules, "foreign", "2026-04-01"), /não encontrada/);
  assert.equal(correctionPlan([rules[1], rules[2]], "rule", "2026-04-01").affectedFrom, "2026-04-01");
  assert.equal(rules[2].validFrom.toISOString().slice(0, 10), "2027-01-01");
});
function row(date = "2026-04-01", meta = "5311.88", leads = 100): ReportRow {
  return { date: day(date), currency: "BRL", state: "CONFIRMED", metaSpend: new Prisma.Decimal(meta), effectiveSpend: new Prisma.Decimal(meta), leads, impressions: 1000n, clicks: 10n, linkClicks: 5n,
    campaign: { id: "campaign", name: "Synthetic", purpose: "CLIENTES", assignments: [{ brokerId: "person", broker: { name: "Responsible" }, validFrom: day("2026-01-01"), validTo: null }] } };
}
const correction = { metadata: { after: { affectedFrom: "2026-04-01", affectedTo: "2026-10-05" } } };
test("reports correct effective spend, CPL, campaigns and responsible filters while preserving every raw field and snapshot", () => {
  const original = row(), snapshot = { ...original };
  const corrected = applyCostCorrections([original], [{ ...rule(), validFrom: day("2026-04-01") }], [correction]);
  assert.equal(corrected[0].effectiveSpend?.toFixed(2), "5957.27"); assert.deepEqual(original, snapshot);
  for (const field of ["metaSpend", "leads", "impressions", "clicks", "linkClicks", "date", "campaign"] as const) assert.equal(corrected[0][field], original[field]);
  const report = summarize(corrected, "person");
  assert.equal(report.totals[0].metaSpend, "5311.88"); assert.equal(report.totals[0].cplEffective, "59.57");
  assert.equal(report.brokers[0].effectiveSpend, "5957.27"); assert.equal(report.campaigns[0].effectiveSpend, "5957.27"); assert.equal(report.totals[0].leads, 100);
  assert.equal(summarize(corrected, "other").totals.length, 0);
  assert.equal(applyCostCorrections([row("2026-03-31")], [{ ...rule(), validFrom: day("2026-04-01") }], [correction])[0].effectiveSpend?.toFixed(2), "5311.88");
  assert.equal(applyCostCorrections([{ ...original, state: "MISSING", metaSpend: null, effectiveSpend: null }], [], [correction])[0].effectiveSpend, null);
});
test("multiple corrections resolve current timeline once, preserve responsible date splits and support moving start forward", () => {
  const first = row("2026-04-01", "100", 10), second = row("2026-05-01", "200", 20);
  second.campaign = { ...second.campaign, assignments: [{ ...second.campaign.assignments[0], brokerId: "another", broker: { name: "Another" } }] };
  const duplicate = [correction, correction];
  const report = summarize(applyCostCorrections([first, second], [{ ...rule(), validFrom: day("2026-04-01") }], duplicate));
  assert.equal(report.totals[0].effectiveSpend, "336.45"); assert.equal(report.brokers[0].effectiveSpend, "112.15"); assert.equal(report.brokers[1].effectiveSpend, "224.30");
  const forward = applyCostCorrections([first, second], [{ ...rule(), validFrom: day("2026-05-01") }], duplicate);
  assert.equal(forward[0].effectiveSpend?.toFixed(2), "100.00"); assert.equal(forward[1].effectiveSpend?.toFixed(2), "224.30");
});
test("later ingestion retains original snapshots and reports still reflect the correction", async () => {
  let stored: Row = {};
  const tx = { marketingCampaign: { findFirst: async () => ({ account: { currency: "BRL" } }) }, marketingDailyMetric: {
    findUnique: async () => ({ costPercentage: new Prisma.Decimal(0), costRuleId: null, sourceObservedAt: new Date("2026-10-05T10:00:00Z") }),
    upsert: async ({ update }: { update: Row }) => { stored = update; return update; },
  }, marketingCostRule: { findFirst: async () => assert.fail("existing snapshot is preserved") } };
  const db = { $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as unknown as typeof prisma;
  await storeDailyMetric("a", "campaign", { date: "2026-04-01", metaSpend: "200", leads: 20, currency: "BRL", sourceObservedAt: new Date("2026-10-05T11:00:00Z") }, db);
  assert.equal((stored.costPercentage as Prisma.Decimal).toString(), "0");
  const report = applyCostCorrections([{ ...row("2026-04-01", "200", 20), effectiveSpend: stored.effectiveSpend as Prisma.Decimal }], [{ ...rule(), validFrom: day("2026-04-01") }], [correction]);
  assert.equal(report[0].effectiveSpend?.toFixed(2), "224.30");
});
test("historical overview scopes corrections and metrics to operation and period in one consistent read", async () => {
  const source = row();
  const tx = { marketingDailyMetric: { count: async () => 1, findMany: async ({ where }: { where: Row }) => { assert.equal(where.tenantId, "a"); return [source]; } },
    marketingAuditEvent: { findMany: async ({ where }: { where: Row }) => { assert.equal(where.tenantId, "a"); assert.equal(where.eventType, "COST_RULE_VALIDITY_CORRECTED"); return [correction]; } },
    marketingCostRule: { findMany: async ({ where }: { where: Row }) => { assert.equal(where.tenantId, "a"); return [{ ...rule(), validFrom: day("2026-04-01") }]; } }, metaAdAccount: { aggregate: async () => ({ _max: { lastSyncedAt: null } }) } };
  const db = { $transaction: async (run: (tx: unknown) => unknown, options: Row) => { assert.equal(options.isolationLevel, "RepeatableRead"); return run(tx); } } as unknown as typeof prisma;
  const result = await overview(owner, new URLSearchParams("period=custom&from=2026-04-01&to=2026-04-01&brokerId=person"), db);
  assert.equal(result.totals[0].effectiveSpend, "5957.27"); assert.equal(result.totals[0].metaSpend, "5311.88");
});
test("API blocks anonymous and non-owner callers before preview, confirmation or audit reads", async t => {
  const context = { params: Promise.resolve({ id: "rule" }) }, request = () => new Request("https://flyimob.test/api/test", { method: "POST", body: "invalid" });
  for (const run of [() => POST(request(), context), () => PATCH(request(), context), () => GET(request(), context)]) assert.equal((await requestContext(undefined, run)).status, 401);
  const original = prisma.user.findFirst; t.after(() => { prisma.user.findFirst = original; });
  for (const role of ["DIRECTOR", "MANAGER", "BROKER", "DATA_ENTRY", "CORRESPONDENTE"] as const) {
    prisma.user.findFirst = (async () => ({ id: "owner", tenantId: "a", role, isActive: true, sessionVersion: 0, tenant: owner.tenant })) as unknown as typeof original;
    const token = createSessionToken({ uid: "owner", tid: "a", role, sv: 0 });
    for (const run of [() => POST(request(), context), () => PATCH(request(), context), () => GET(request(), context)]) assert.equal((await requestContext(token, run)).status, 403);
  }
});
test("migration authorizes only same-transaction owner audit and leaves metric protections untouched", () => {
  const sql = readFileSync("prisma/migrations/20261005140000_marketing_cost_validity_correction/migration.sql", "utf8");
  assert.equal(/UPDATE\s+"MarketingDailyMetric"|marketing_metric_preserve|DROP\s|DELETE\s+FROM/i.test(sql), false);
  assert.match(sql, /e\.xmin/); assert.match(sql, /u\."role" = 'OWNER'/); assert.match(sql, /NEW\."percentage" IS DISTINCT FROM OLD\."percentage"/);
});
