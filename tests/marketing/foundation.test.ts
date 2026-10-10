import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { canAccessMarketing, canConfigureMarketing, civilToday, day, period, purposes, type MarketingViewer } from "../../src/lib/marketing/policy";
import { effectiveSpend, metricValues, summarize, storeDailyMetric, markDailyMetricUnavailable, type ReportRow } from "../../src/lib/marketing/metrics.server";
import { configureConnection, createCostRule, selectAccount, updateCampaign, marketingTransaction } from "../../src/lib/marketing/admin.server";
import { settings, campaignList, overview } from "../../src/lib/marketing/queries.server";
import { claimSync, finishSync, enqueueSync, LEASE_MS } from "../../src/lib/marketing/sync.server";
import { failure } from "../../src/lib/marketing/http.server";
import { GET as getOverview } from "../../src/app/api/marketing/overview/route";
import { GET as getOptions } from "../../src/app/api/marketing/options/route";
import { POST as postConnection } from "../../src/app/api/marketing/connections/route";
import { GET as getSettings, POST as postRule } from "../../src/app/api/marketing/settings/route";
import { GET as getCampaigns } from "../../src/app/api/marketing/campaigns/route";
import { PATCH as patchCampaign } from "../../src/app/api/marketing/campaigns/[id]/route";
import { createSessionToken } from "../../src/lib/auth.server";

const decimal = (value: string | number) => new Prisma.Decimal(value);
const owner: MarketingViewer = { user: { id: "owner-a", tenantId: "a", role: "OWNER" }, tenant: { id: "a", isPlatform: false } };
const director: MarketingViewer = { ...owner, user: { ...owner.user, role: "DIRECTOR" } };
const date = (d: string) => day(`2026-10-${d}`);
const campaign = { id: "campaign-a", name: "Campaign A", purpose: "CLIENTES", assignments: [
  { brokerId: "gilberto", validFrom: date("01"), validTo: date("21"), broker: { name: "Gilberto" } },
  { brokerId: "laura", validFrom: date("21"), validTo: null, broker: { name: "Laura" } },
] };
function row(d: string, spend = "100", leads = 2, overrides: Partial<ReportRow> = {}): ReportRow {
  return { date: date(d), currency: "BRL", metaSpend: decimal(spend), effectiveSpend: effectiveSpend(decimal(spend), decimal("12.75")), leads, state: "CONFIRMED", campaign, ...overrides };
}
type Args = { where: Record<string, unknown>; data: Record<string, unknown> };
function database(tx: Record<string, unknown>) { return { ...tx, $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as unknown as typeof prisma; }

for (const role of ["OWNER", "DIRECTOR", "MANAGER", "BROKER", "DATA_ENTRY", "CORRESPONDENTE"] as UserRole[]) {
  test(`explicit Marketing permission for ${role}`, () => {
    const viewer = { ...owner, user: { ...owner.user, role } };
    assert.equal(canAccessMarketing(viewer), ["OWNER", "DIRECTOR"].includes(role));
    assert.equal(canConfigureMarketing(viewer), role === "OWNER");
    assert.equal(canAccessMarketing({ ...viewer, tenant: { ...viewer.tenant, isPlatform: true } }), false);
    assert.equal(canAccessMarketing({ ...viewer, user: { ...viewer.user, tenantId: "foreign" } }), false);
  });
}
test("dates reject rollover; timezones preserve both sides of local midnight", () => {
  for (const value of ["2026-02-30", "2026-13-01", "2026-1-1", "x", null]) assert.throws(() => day(value));
  const midnight = new Date("2026-10-03T02:00:00Z");
  assert.equal(civilToday("America/Sao_Paulo", midnight), "2026-10-02");
  assert.equal(civilToday("Asia/Tokyo", midnight), "2026-10-03");
  assert.throws(() => civilToday("invalid/timezone"));
});
test("period presets include today, yesterday, week, month, previous year boundary and custom validation", () => {
  const check = (preset: string) => period(new URLSearchParams({ period: preset }), "2026-01-03");
  assert.equal(check("today").from, "2026-01-03"); assert.equal(check("yesterday").to, "2026-01-02");
  assert.equal(check("week").from, "2025-12-28"); assert.equal(check("month").from, "2026-01-01");
  assert.deepEqual(check("previous"), { from: "2025-12-01", to: "2025-12-31", preset: "previous" });
  assert.throws(() => period(new URLSearchParams("period=custom&from=2026-10-03&to=2026-10-02")));
  assert.throws(() => period(new URLSearchParams("period=custom&from=2024-01-01&to=2026-10-02")));
  assert.throws(() => check("unknown"));
});
test("Decimal effective costs and zero denominator use explicit semantics", () => {
  assert.equal(effectiveSpend(decimal(100), decimal("12.75")).toFixed(2), "112.75");
  assert.equal(effectiveSpend(decimal(100), decimal(0)).toFixed(2), "100.00");
  assert.equal(effectiveSpend(decimal("0.05"), decimal(10)).toFixed(2), "0.06");
  assert.equal(summarize([row("01", "0", 0)]).totals[0].cpl, null);
});
test("campaign assignment boundaries preserve October and consolidate different accounts/connections", () => {
  const report = summarize([row("01"), row("20"), row("21"), row("31"), row("01", "50", 1, { campaign: { ...campaign, id: "campaign-b", name: "Other account B" } }), row("01", "50", 1, { campaign: { ...campaign, id: "campaign-c", name: "Other account C" } })]);
  assert.equal(report.totals[0].metaSpend, "500.00");
  assert.equal(report.brokers.find(b => b.id === "gilberto")?.metaSpend, "300.00");
  assert.equal(report.brokers.find(b => b.id === "laura")?.metaSpend, "200.00");
  assert.equal(report.campaigns.length, 3);
  assert.equal(summarize([row("20"), row("21")], "gilberto").totals[0].metaSpend, "100.00");
});
test("unassigned campaign and different currencies remain separate", () => {
  const rows = [row("01", "100", 2, { campaign: { ...campaign, assignments: [] } }), row("01", "10", 1, { currency: "USD" })];
  const report = summarize(rows); assert.equal(report.totals.length, 2);
  assert.equal(report.brokers.find(b => b.id === null)?.name, "Não atribuídas");
  assert.equal(summarize(rows, "unassigned").totals.length, 1);
});
test("missing and failed measurements never become confirmed zero", () => {
  const report = summarize([row("01", "0", 0), row("02", "0", 0, { state: "MISSING", metaSpend: null, leads: null, effectiveSpend: null }), row("03", "0", 0, { state: "FAILED", metaSpend: null, leads: null, effectiveSpend: null })]);
  assert.equal(report.unavailable, 2); assert.equal(report.totals[0].rows, 1);
  assert.equal(summarize([]).totals.length, 0);
});
test("metric input refuses negative, imprecise or invalid counts and currencies", () => {
  const value = { date: "2026-10-01", metaSpend: "100.00", leads: 2, currency: "BRL", sourceObservedAt: new Date() };
  for (const change of [{ metaSpend: "-1" }, { metaSpend: "1.123" }, { leads: -1 }, { leads: 1.5 }, { currency: "brl" }, { sourceObservedAt: new Date("invalid") }]) assert.throws(() => metricValues({ ...value, ...change }));
});
test("metric ingestion replaces accumulated totals, rejects conflict and preserves cost snapshot", async () => {
  let existing: Record<string, unknown> | null = null;
  const db = database({ marketingCampaign: { findFirst: async ({ where }: Args) => { assert.equal(where.tenantId, "a"); return { account: { currency: "BRL" } }; } },
    marketingCostRule: { findFirst: async () => ({ id: "rule-a", percentage: decimal("12.75") }) },
    marketingDailyMetric: { findUnique: async () => existing, upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => { existing = { ...(existing ?? args.create), ...args.update }; return existing; } } });
  const input = { date: "2026-10-01", metaSpend: "18", leads: 3, currency: "BRL", sourceObservedAt: new Date("2026-10-01T13:00:00Z") };
  await storeDailyMetric("a", "campaign-a", input, db);
  await storeDailyMetric("a", "campaign-a", { ...input, metaSpend: "31", leads: 5, sourceObservedAt: new Date("2026-10-01T17:00:00Z") }, db);
  assert.equal((existing!.metaSpend as Prisma.Decimal).toString(), "31"); assert.equal(existing!.leads, 5);
  assert.equal((existing!.effectiveSpend as Prisma.Decimal).toFixed(2), "34.95");
  await storeDailyMetric("a", "campaign-a", input, db); assert.equal(existing!.leads, 5);
  await assert.rejects(storeDailyMetric("a", "campaign-a", { ...input, sourceObservedAt: new Date("2026-10-01T17:00:00Z") }, db), /dois totais/);
  await assert.rejects(storeDailyMetric("a", "campaign-a", { ...input, currency: "USD" }, db), /Moeda/);
});
test("foreign campaign is refused before ingestion and failure cannot erase confirmed data", async () => {
  const db = database({ marketingCampaign: { findFirst: async () => null } });
  await assert.rejects(storeDailyMetric("a", "foreign", { date: "2026-10-01", metaSpend: "1", leads: 1, currency: "BRL", sourceObservedAt: new Date() }, db), /não encontrada/);
  let changed: Record<string, unknown> = {};
  const confirmed = database({ marketingCampaign: { findFirst: async () => ({ account: { currency: "BRL" } }) }, marketingDailyMetric: {
    findUnique: async () => ({ metaSpend: decimal(0) }), update: async ({ data }: Args) => { changed = data; return data; },
  } });
  await markDailyMetricUnavailable("a", "campaign", "2026-10-01", "FAILED", confirmed);
  assert.deepEqual(Object.keys(changed), ["lastAttemptAt"]);
});
test("administrative services deny unsupported roles and director settings before database access", async () => {
  const db = database({});
  for (const role of ["BROKER", "MANAGER", "CORRESPONDENTE"] as UserRole[]) await assert.rejects(updateCampaign({ ...owner, user: { ...owner.user, role } }, "id", {}, db), /Acesso/);
  await assert.rejects(configureConnection(director, null, { label: "x" }, db), /Acesso/);
  await assert.rejects(createCostRule(director, { percentage: "10", validFrom: "2026-10-01" }, db), /Acesso/);
  await assert.rejects(selectAccount(director, "connection", { accountId: "account", selected: true }, db), /Acesso/);
});
test("no token, secret, tenant override or external ID can enter administrative mutations", async () => {
  for (const body of [{ label: "x", token: "secret" }, { label: "x", tenantId: "foreign" }]) await assert.rejects(configureConnection(owner, null, body, database({})), /Campo/);
  await assert.rejects(updateCampaign(owner, "id", { version: 0, externalId: "replacement" }, database({})), /Campo/);
  await assert.rejects(createCostRule(owner, { percentage: "-1", validFrom: "2026-10-01" }, database({})), /percentual/);
  await assert.rejects(createCostRule(owner, { percentage: "1001", validFrom: "2026-10-01" }, database({})), /máximo/);
});
test("connection creates only an unauthenticated label and bounded audit metadata", async () => {
  let connectionData: Record<string, unknown> = {}, eventData: Record<string, unknown> = {};
  const db = database({ metaConnection: { create: async ({ data }: Args) => { connectionData = data; return { id: "c" }; } }, marketingAuditEvent: { create: async ({ data }: Args) => { eventData = data; } } });
  await configureConnection(owner, null, { label: "Operation connection" }, db);
  assert.deepEqual(connectionData, { tenantId: "a", label: "Operation connection" });
  assert.deepEqual(eventData.metadata, {}); assert.equal(eventData.actorId, owner.user.id);
  assert.equal(JSON.stringify(eventData).includes("Operation connection"), false);
});
test("account selection can only use the tenant-scoped connection/account relation", async () => {
  const db = database({ metaConnectionAccount: { findUnique: async ({ where }: Args) => { assert.deepEqual(where, { tenantId_connectionId_accountId: { tenantId: "a", connectionId: "foreign", accountId: "other" } }); return null; } } });
  await assert.rejects(selectAccount(owner, "foreign", { accountId: "other", selected: true }, db), /não acessível/);
});
test("settings explicitly project safe fields and never return credential envelope", async () => {
  const db = database({ metaConnection: { findMany: async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
    assert.equal(args.where.tenantId, "a"); for (const key of ["credentialCiphertext", "credentialNonce", "credentialAuthTag", "credentialKeyVersion"]) assert.equal(key in args.select, false); return [];
  } }, marketingCostRule: { findMany: async () => [] } });
  assert.equal((await settings(owner, db)).connections.length, 0);
});
test("campaign list scopes tenant, filters purpose/status and uses paginated current assignments", async () => {
  const db = database({ marketingCampaign: { findMany: async (args: { where: Record<string, unknown>; take: number; skip: number }) => {
    const where = (args.where.AND as Record<string, unknown>[])[0];
    assert.equal(where.tenantId, "a"); assert.equal(where.purpose, "RECRUTAMENTO"); assert.equal(args.take, 20); assert.equal(args.skip, 20);
    assert.ok(where.OR); return [];
  }, count: async () => 40 } });
  assert.equal((await campaignList(director, new URLSearchParams("page=2&purpose=RECRUTAMENTO&brokerId=unassigned"), db)).page, 2);
  await assert.rejects(campaignList(owner, new URLSearchParams("page=0"), db), /Página/);
  await assert.rejects(campaignList(owner, new URLSearchParams("purpose=UNKNOWN"), db), /Finalidade/);
  assert.deepEqual(Object.keys(purposes), ["CLIENTES", "RECRUTAMENTO", "INSTITUCIONAL_OUTRO", "NAO_CLASSIFICADA"]);
});
test("overview defaults to client campaigns and leaves absence empty", async () => {
  const db = database({ metaAdAccount: { aggregate: async () => ({ _max: { lastSyncedAt: null } }) }, marketingDailyMetric: { count: async () => 0, findMany: async (args: { where: { tenantId: string; campaign: { purpose: string } } }) => { assert.equal(args.where.tenantId, "a"); assert.equal(args.where.campaign.purpose, "CLIENTES"); return []; } } });
  const result = await overview(owner, new URLSearchParams(), db); assert.equal(result.totals.length, 0); assert.equal(result.lastSyncedAt, null);
});
test("stale campaign version and foreign broker reject updates", async () => {
  const db = database({ marketingCampaign: { findFirst: async () => ({ id: "c", purpose: "CLIENTES" }), updateMany: async () => ({ count: 0 }) } });
  await assert.rejects(updateCampaign(owner, "c", { version: 0, purpose: "RECRUTAMENTO" }, db), /outra pessoa/);
  const foreign = database({ marketingCampaign: { findFirst: async () => ({ id: "c", purpose: "CLIENTES" }), updateMany: async () => ({ count: 1 }) }, operationPerson: { findFirst: async () => null }, user: { findFirst: async () => null } });
  await assert.rejects(updateCampaign(owner, "c", { version: 0, assignment: { brokerId: "foreign", validFrom: "2026-10-01" } }, foreign), /responsável ativo/);
});
test("cost rule creates new validity and refuses overlapping start or confirmed history", async () => {
  let closed: unknown; let created: Record<string, unknown> = {};
  const db = database({ marketingCostRule: { findFirst: async () => ({ id: "old", validFrom: day("2026-10-01") }), update: async ({ data }: Args) => { closed = data.validTo; }, create: async ({ data }: Args) => { created = data; return { id: "new" }; } }, marketingDailyMetric: { count: async () => 0 }, marketingAuditEvent: { create: async () => ({}) } });
  await createCostRule(owner, { percentage: "10", validFrom: "2027-01-01" }, db);
  assert.equal((closed as Date).toISOString().slice(0, 10), "2027-01-01"); assert.equal((created.percentage as Prisma.Decimal).toString(), "10");
  await assert.rejects(createCostRule(owner, { percentage: "10", validFrom: "2026-10-01" }, db), /depois/);
  const confirmed = database({ marketingCostRule: { findFirst: async () => null }, marketingDailyMetric: { count: async () => 1 } });
  await assert.rejects(createCostRule(owner, { percentage: "10", validFrom: "2026-10-01" }, confirmed), /métricas confirmadas/);
});
test("serializable transaction retries conflicts without swallowing failures", async () => {
  let count = 0;
  const db = { $transaction: async (_run: unknown, options: { isolationLevel: string }) => { assert.equal(options.isolationLevel, "Serializable"); if (count++ < 2) throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6" }); return "done"; } } as unknown as typeof prisma;
  assert.equal(await marketingTransaction(db, async () => "unused"), "done"); assert.equal(count, 3);
});
test("sync refuses unauthenticated placeholder connections and has no provider calls", async () => {
  await assert.rejects(enqueueSync({ tenantId: "a", connectionId: "c", accountId: "account", idempotencyKey: "k", from: "2026-10-01", to: "2026-10-03" }, database({ metaConnectionAccount: { findUnique: async () => ({ selected: true, accessible: true, connection: { status: "NOT_CONFIGURED" }, account: { status: "ACTIVE" } }) } })), /autorizada/);
  const source = readFileSync("src/lib/marketing/sync.server.ts", "utf8"); assert.equal(source.includes("fetch("), false);
});
test("sync compare-and-swap claim permits a single worker", async () => {
  let pending = true;
  const db = database({ marketingSyncRun: { findMany: async () => [], count: async () => 0, findFirst: async () => ({ id: "run", tenantId: "a", connectionId: "c", accountId: "account", attempts: 0, maxAttempts: 5 }), updateMany: async () => { const count = pending ? 1 : 0; pending = false; return { count }; } }, metaConnectionAccount: { findUnique: async () => ({ selected: true, accessible: true }) } });
  const results = await Promise.all([claimSync("a", "account", new Date(), db), claimSync("a", "account", new Date(), db)]);
  assert.equal(results.filter(Boolean).length, 1);
});
test("sync rejects stale lease and raw error details, retries safely", async () => {
  await assert.rejects(finishSync("a", "r", "old", null, new Date(), database({ marketingSyncRun: { findFirst: async () => null } })), /expirada/);
  await assert.rejects(finishSync("a", "r", "lease", "token=secret" as never, new Date(), database({})), /Código/);
  let changed: Record<string, unknown> = {};
  const db = database({ marketingSyncRun: { findFirst: async () => ({ attempts: 1, maxAttempts: 5 }), updateMany: async ({ data }: Args) => { changed = data; return { count: 1 }; } } });
  assert.equal((await finishSync("a", "r", "lease", "RATE_LIMITED", new Date(), db)).retry, true);
  assert.equal(changed.status, "PENDING"); assert.equal(changed.leaseToken, null); assert.equal(LEASE_MS, 600000);
});
test("migration is additive and contains tenant FKs, exclusion, snapshots, envelope and immutable audit", () => {
  const sql = readFileSync("prisma/migrations/20261003020000_marketing_foundation/migration.sql", "utf8");
  assert.equal(/DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM/i.test(sql), false);
  for (const name of ["Marketing_assignment_no_overlap", "Marketing_cost_no_overlap", "Marketing_sync_one_running_per_account", "Marketing_credential_envelope", "MarketingDailyMetric_preserve", "MarketingAuditEvent_immutable"]) assert.ok(sql.includes(name));
  for (const match of sql.matchAll(/ALTER TABLE "([^"]+)"/g)) assert.ok(/^(Meta|Marketing|CampaignBrokerAssignment)/.test(match[1]));
});
test("API failures never reveal raw Prisma or credential error", async () => {
  const response = failure(new Error("token=synthetic-secret DATABASE_URL=secret"));
  assert.equal(response.status, 500); assert.equal((await response.text()).includes("secret"), false);
});
test("anonymous Marketing routes reject before querying or parsing request data", async () => {
  const request = new Request("https://flyimob.test/api/marketing", { method: "POST", body: "invalid" });
  for (const handler of [() => getOverview(request), () => getOptions(), () => getSettings(), () => getCampaigns(request), () => postConnection(request), () => postRule(request), () => patchCampaign(request, { params: Promise.resolve({ id: "foreign" }) })]) {
    const result = await requestContext(undefined, handler); assert.equal(result.status, 401);
  }
});
test("authenticated director cannot change settings and unsupported roles cannot read Marketing", async t => {
  process.env.SESSION_SECRET = "synthetic-marketing-session-secret";
  const old = prisma.user.findFirst;
  t.after(() => { prisma.user.findFirst = old; });
  let role: UserRole = "DIRECTOR";
  prisma.user.findFirst = (async () => ({ id: "owner-a", tenantId: "a", role, name: "Synthetic", email: "synthetic@example.test", isActive: true, sessionVersion: 0, tenant: { id: "a", name: "Synthetic", slug: "synthetic", isPlatform: false, parentId: null } })) as unknown as typeof prisma.user.findFirst;
  const token = createSessionToken({ uid: "owner-a", tid: "a", role: "DIRECTOR", sv: 0 });
  assert.equal((await requestContext(token, () => getSettings())).status, 403);
  for (const denied of ["BROKER", "MANAGER", "CORRESPONDENTE"] as UserRole[]) { role = denied; assert.equal((await requestContext(token, () => getOverview(new Request("https://flyimob.test/api/marketing")))).status, 403); }
});
