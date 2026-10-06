import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { CONVERSATION_ACTION, encryptCredential, decryptCredential, insight, MetaClient, MetaError, exchangeAuthorization, metaConfig } from "../../src/lib/marketing/meta.server";
import { beginAuthorization, completeAuthorization, discoverAccounts, parseAccount, connectionClient } from "../../src/lib/marketing/connections.server";
import { executeSync, syncRange, syncSelected } from "../../src/lib/marketing/worker.server";
import { summarize } from "../../src/lib/marketing/metrics.server";
import { day, type MarketingViewer } from "../../src/lib/marketing/policy";
import { failure } from "../../src/lib/marketing/http.server";
import { overview } from "../../src/lib/marketing/queries.server";

// Isolated synthetic credentials only. This test never reads environment files or calls Meta.
process.env.META_APP_ID = "123"; process.env.META_APP_SECRET = randomBytes(32).toString("hex");
process.env.META_LOGIN_CONFIG_ID = "456"; process.env.META_OAUTH_REDIRECT_URI = "https://flyimob.com/api/integrations/meta/callback";
process.env.META_CREDENTIAL_KEY_V1 = randomBytes(32).toString("base64");
const token = randomBytes(48).toString("base64url");
const viewer: MarketingViewer = { user: { id: "owner", tenantId: "tenant", role: "OWNER" }, tenant: { id: "tenant", isPlatform: false } };
const validInsight = { date_start: "2026-10-05", date_stop: "2026-10-05", spend: "31.00", impressions: "1000", clicks: "10", campaign_id: "11" };
function db(tx: Record<string, unknown>) { return { ...tx, $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as unknown as typeof prisma; }
function transport(payloads: unknown[], urls: URL[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); urls.push(url);
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    const payload = payloads.shift(); if (payload instanceof Error) throw payload;
    return Response.json(payload);
  }) as typeof fetch;
}
test("credentials use randomized authenticated encryption bound to tenant and connection", () => {
  const a = encryptCredential(token, "tenant", "connection"), b = encryptCredential(token, "tenant", "connection");
  assert.notDeepEqual(a.credentialCiphertext, b.credentialCiphertext);
  assert.equal(decryptCredential({ ...a, tenantId: "tenant", id: "connection" }), token);
  assert.throws(() => decryptCredential({ ...a, tenantId: "foreign", id: "connection" }));
  assert.throws(() => decryptCredential({ ...a, tenantId: "tenant", id: "other" }));
  a.credentialAuthTag[0] ^= 1; assert.throws(() => decryptCredential({ ...a, tenantId: "tenant", id: "connection" }));
});
test("invalid key, plaintext and unknown key version are refused", () => {
  const saved = process.env.META_CREDENTIAL_KEY_V1; process.env.META_CREDENTIAL_KEY_V1 = "bad";
  try { assert.throws(() => encryptCredential(token, "t", "c")); } finally { process.env.META_CREDENTIAL_KEY_V1 = saved; }
  assert.throws(() => decryptCredential({ tenantId: "t", id: "c", credentialCiphertext: null, credentialNonce: null, credentialAuthTag: null, credentialKeyVersion: "v9" }));
});
test("OAuth configuration rejects absent app parameters and unsafe callbacks", () => {
  const saved = process.env.META_OAUTH_REDIRECT_URI; process.env.META_OAUTH_REDIRECT_URI = "http://flyimob.com/api/integrations/meta/callback";
  try { assert.throws(metaConfig); } finally { process.env.META_OAUTH_REDIRECT_URI = saved; }
  assert.equal(metaConfig().redirectUri, saved);
});
test("OAuth start stores only a state hash, binds owner tenant and reconnect version", async () => {
  let data: Record<string, unknown> = {};
  const database = db({ metaConnection: { findFirst: async ({ where }: { where: object }) => { assert.deepEqual(where, { id: "connection", tenantId: "tenant" }); return { id: "connection", credentialVersion: 3 }; } },
    marketingOAuthState: { create: async (args: { data: Record<string, unknown> }) => { data = args.data; } } });
  const result = await beginAuthorization(viewer, "connection", database), url = new URL(result.url);
  assert.match(String(data.id), /^[a-f0-9]{64}$/); assert.notEqual(data.id, result.state);
  assert.equal(data.actorId, "owner"); assert.equal(data.credentialVersion, 3);
  assert.equal(url.searchParams.get("config_id"), "456"); assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.has("access_token"), false); assert.equal(url.searchParams.has("client_secret"), false);
});
test("OAuth denies DIRECTOR and tenant mismatch before queries or exchange", async () => {
  for (const person of [{ ...viewer, user: { ...viewer.user, role: "DIRECTOR" as const } }, { ...viewer, tenant: { id: "foreign", isPlatform: false } }]) {
    await assert.rejects(beginAuthorization(person, "connection", db({})), /Acesso/);
    await assert.rejects(syncSelected(person, {}, db({})), /Acesso/);
  }
});
test("OAuth replay, expired state and cancelled authorization cannot replace credentials", async () => {
  await assert.rejects(completeAuthorization(viewer, "bad", "code", db({})), /inválida/);
  await assert.rejects(completeAuthorization(viewer, "a".repeat(43), "code", db({ marketingOAuthState: { findFirst: async () => null } })), /inválida/);
  await assert.rejects(completeAuthorization(viewer, "a".repeat(43), null, db({ marketingOAuthState: { findFirst: async () => ({ connectionId: "connection" }), updateMany: async () => ({ count: 1 }) } })), /não concluída/);
});
test("authorization exchanges are server-side POST bodies; neither secrets nor tokens appear in URL", async () => {
  let requests = 0;
  const credential = await exchangeAuthorization("synthetic-code", (async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.search, ""); assert.equal(init?.method, "POST");
    const body = init?.body as URLSearchParams; assert.equal(body.get("client_id"), "123");
    if (requests++) assert.equal(body.get("fb_exchange_token"), token); else assert.equal(body.get("code"), "synthetic-code");
    return Response.json({ access_token: token, expires_in: 3600 });
  }) as typeof fetch);
  assert.equal(requests, 2); assert.ok(credential.expiresAt > new Date());
});
test("paginated account, campaign, ad and insight reads ignore token-bearing next URLs", async () => {
  for (const path of ["me/adaccounts", "act_1/campaigns", "act_1/ads", "act_1/insights"]) {
    const urls: URL[] = [], client = new MetaClient(token, "app", transport([{ data: [{ id: "1" }], paging: { next: "https://evil.invalid/?access_token=redacted", cursors: { after: "cursor" } } }, { data: [{ id: "2" }] }], urls));
    assert.deepEqual((await client.pages(path)).map(r => r.id), ["1", "2"]);
    assert.equal(urls[1].hostname, "graph.facebook.com"); assert.equal(urls[1].searchParams.get("after"), "cursor");
  }
});
test("interrupted pages, repeated cursors and partial responses fail instead of returning partial rows", async () => {
  const page = { data: [{ id: "1" }], paging: { next: "next", cursors: { after: "same" } } };
  for (const tail of [new Error("transport with synthetic secret"), page, { unexpected: [] }]) await assert.rejects(new MetaClient(token, "app", transport([page, tail])).pages("me/adaccounts"), MetaError);
});
for (const [code, expected] of [[190, "AUTHORIZATION_REQUIRED"], [10, "AUTHORIZATION_REQUIRED"], [200, "AUTHORIZATION_REQUIRED"], [4, "RATE_LIMITED"], [17, "RATE_LIMITED"], [613, "RATE_LIMITED"], [80000, "RATE_LIMITED"], [1, "INVALID_RESPONSE"]] as const) {
  test(`Meta error ${code} is sanitized as ${expected}`, async () => {
    await assert.rejects(new MetaClient(token, "app", transport([{ error: { code, message: token } }])).pages("me/adaccounts"), (error: unknown) => error instanceof MetaError && error.safeCode === expected && !error.message.includes(token));
  });
}
test("Meta timeout and HTTP rate limit/transient responses have safe operational codes", async () => {
  await assert.rejects(new MetaClient(token, "app", transport([new Error(token)])).get("me"), { safeCode: "PROVIDER_UNAVAILABLE" });
  await assert.rejects(new MetaClient(token, "app", (async () => Response.json({ error: {} }, { status: 429 })) as typeof fetch).get("me"), { safeCode: "RATE_LIMITED" });
  await assert.rejects(new MetaClient(token, "app", transport([{ error: { code: 1, is_transient: true } }])).get("me"), { safeCode: "PROVIDER_UNAVAILABLE" });
});
test("discovery validates canonical IDs, inactive account status, business, currency and timezone", () => {
  const source = { id: "act_1", account_id: "1", name: "Account", account_status: 2, currency: "BRL", timezone_name: "Asia/Tokyo", business: { id: "8", name: "Business" } };
  assert.equal(parseAccount(source).sourceAccountStatus, 2); assert.equal(parseAccount(source).businessExternalId, "8");
  for (const invalid of [{ ...source, id: "act_2" }, { ...source, currency: "brl" }, { ...source, timezone_name: "invalid" }]) assert.throws(() => parseAccount(invalid));
});
test("leads come exclusively from messaging_conversation_started_7d; absent action is confirmed zero", () => {
  const result = insight({ ...validInsight, actions: [{ action_type: "link_click", value: "99" }, { action_type: "messaging_user_depth_2", value: "70" }, { action_type: "total_messaging_connection", value: "80" }, { action_type: CONVERSATION_ACTION, value: "7" }] });
  assert.equal(result.leads, 7); assert.equal(result.linkClicks, 99n);
  assert.equal(insight(validInsight).leads, 0); assert.equal(insight({ ...validInsight, actions: [] }).leads, 0);
});
test("invalid delivery, missing spend and duplicate primary action cannot become confirmed zero", () => {
  for (const value of [{ ...validInsight, spend: undefined }, { ...validInsight, impressions: "NaN" }, { ...validInsight, date_stop: "2026-10-06" }, { ...validInsight, actions: null }, { ...validInsight, actions: [{ action_type: CONVERSATION_ACTION, value: "1" }, { action_type: CONVERSATION_ACTION, value: "2" }] }]) assert.throws(() => insight(value));
});
test("Decimal CPL Meta/effective, CPC, CPM and operational increment use separate denominators", () => {
  const row = { date: day("2026-10-05"), currency: "BRL", state: "CONFIRMED", metaSpend: new Prisma.Decimal("100"), effectiveSpend: new Prisma.Decimal("112.75"), leads: 4, impressions: 1000n, clicks: 10n, linkClicks: 3n,
    campaign: { id: "c", name: "Campaign", purpose: "CLIENTES", assignments: [] } };
  const total = summarize([row]).totals[0];
  assert.equal(total.cplMeta, "25.00"); assert.equal(total.cplEffective, "28.19"); assert.equal(total.cpc, "10.00"); assert.equal(total.cpm, "100.00"); assert.equal(total.increment, "12.75");
  const zero = summarize([{ ...row, leads: 0, impressions: 0n, clicks: 0n }]).totals[0];
  assert.equal(zero.cplMeta, null); assert.equal(zero.cpc, null); assert.equal(zero.cpm, null);
  assert.equal(summarize([{ ...row, clicks: null }]).totals[0].cpc, null);
});
test("first sync includes previous and current month, later sync reconciles 7 days in source timezone", () => {
  assert.deepEqual(syncRange("Asia/Tokyo", true, new Date("2026-09-30T23:00:00Z")), { from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(syncRange("America/Los_Angeles", false, new Date("2026-10-05T01:00:00Z")), { from: "2026-09-27", to: "2026-10-04" });
});
test("expired credentials are marked expired without contacting Meta or deleting history", async () => {
  let expired = false;
  await assert.rejects(connectionClient("tenant", "connection", db({ metaConnection: { findFirst: async () => ({ status: "AUTHORIZED", expiresAt: new Date(0), credentialVersion: 2 }), updateMany: async ({ data }: { data: { status: string } }) => { expired = data.status === "EXPIRED"; } } })), MetaError);
  assert.ok(expired);
});
test("provider errors returned by API never include raw payload or synthetic credential", async () => {
  const payload = await failure(new MetaError("RATE_LIMITED")).text(); assert.ok(payload.includes("RATE_LIMITED")); assert.ok(!payload.includes(token));
});
test("Meta V1 migration adds tenant-bound OAuth/ad metrics without destructive SQL", async () => {
  const { readFile } = await import("node:fs/promises"); const sql = await readFile("prisma/migrations/20261005010000_marketing_meta_v1/migration.sql", "utf8");
  assert.ok(!/\b(DROP|TRUNCATE|DELETE)\s+(TABLE|FROM)/i.test(sql)); assert.ok(sql.includes('FOREIGN KEY ("tenantId", "campaignId")')); assert.ok(sql.includes('"credentialVersion"')); assert.ok(sql.includes('"impressions" BIGINT'));
});

function connection() { return { id: "connection", tenantId: "tenant", status: "AUTHORIZED", credentialVersion: 1, expiresAt: new Date(Date.now() + 3600000), ...encryptCredential(token, "tenant", "connection") }; }
test("discovery deduplicates accounts across pages/connections and preserves selection", async context => {
  const account = { id: "act_1", account_id: "1", name: "Renamed account", account_status: 1, currency: "BRL", timezone_name: "America/Sao_Paulo" };
  context.mock.method(globalThis, "fetch", transport([{ data: [account], paging: { next: "next", cursors: { after: "2" } } }, { data: [account] }]));
  let imported = 0, invalidated = false, audited = false;
  const database = db({ metaConnection: { findFirst: async () => connection(), update: async () => ({}) },
    metaAdAccount: { findUnique: async () => ({ currency: "BRL" }), upsert: async ({ where, update }: { where: object; update: { name: string } }) => { assert.deepEqual(where, { tenantId_externalId: { tenantId: "tenant", externalId: "1" } }); assert.equal(update.name, "Renamed account"); imported++; return { id: "canonical" }; } },
    metaConnectionAccount: { updateMany: async () => { invalidated = true; }, upsert: async ({ update, create }: { update: object; create: { selected?: boolean } }) => { assert.equal(Object.hasOwn(update, "selected"), false); assert.equal(create.selected, undefined); } },
    marketingAuditEvent: { create: async ({ data }: { data: { metadata: object } }) => { assert.deepEqual(data.metadata, {}); audited = true; } } });
  assert.deepEqual(await discoverAccounts(viewer, "connection", database), { discovered: 1 }); assert.equal(imported, 1); assert.ok(invalidated && audited);
});
test("discovery failure on page two never invalidates existing access or imports partial accounts", async context => {
  context.mock.method(globalThis, "fetch", transport([{ data: [], paging: { next: "next", cursors: { after: "2" } } }, new Error("timeout")]));
  let writes = 0;
  await assert.rejects(discoverAccounts(viewer, "connection", db({ metaConnection: { findFirst: async () => connection(), updateMany: async () => ({ count: 1 }) },
    metaConnectionAccount: { updateMany: async () => { writes++; } } })), { safeCode: "PROVIDER_UNAVAILABLE" }); assert.equal(writes, 0);
});
test("reconnect replaces only encrypted credential by version, without touching account/history/assignment", async context => {
  context.mock.method(globalThis, "fetch", (async (input, init) => {
    if (init?.method === "POST") return Response.json({ access_token: token, expires_in: 3600 });
    return Response.json(String(input).includes("permissions") ? { data: ["ads_read", "ads_management", "business_management"].map(permission => ({ permission, status: "granted" })) } : { id: "100" });
  }) as typeof fetch);
  let updated: Record<string, unknown> = {};
  const database = db({ marketingOAuthState: { findFirst: async () => ({ connectionId: "connection", credentialVersion: 1 }), updateMany: async () => ({ count: 1 }) },
    metaConnection: { updateMany: async ({ where, data }: { where: object; data: Record<string, unknown> }) => { assert.deepEqual(where, { tenantId: "tenant", id: "connection", credentialVersion: 1 }); updated = data; return { count: 1 }; } },
    marketingAuditEvent: { create: async ({ data }: { data: { metadata: object } }) => { assert.deepEqual(data.metadata, {}); } } });
  assert.deepEqual(await completeAuthorization(viewer, "a".repeat(43), "synthetic-code", database), { connectionId: "connection" });
  assert.equal(updated.status, "AUTHORIZED"); assert.ok(updated.credentialCiphertext instanceof Buffer); assert.ok(!Object.values(updated).includes(token));
});

function syncFixture(leaseValid = true) {
  const records = new Map<string, Record<string, unknown>>(), adRecords = new Map<string, Record<string, unknown>>();
  let campaign = { id: "campaign", externalId: "11", name: "Old name", purpose: "CLIENTES", version: 4 };
  let completed = false, closed = false;
  const run: Parameters<typeof executeSync>[0] = { id: "run", tenantId: "tenant", accountId: "account", connectionId: "connection", leaseToken: "00000000-0000-0000-0000-000000000000", periodFrom: day("2026-10-01"), periodTo: day("2026-10-05"), status: "RUNNING", attempts: 1, maxAttempts: 5, claimedAt: new Date(), idempotencyKey: "request", safeErrorCode: null, createdAt: new Date(), updatedAt: new Date(), nextAttemptAt: new Date(), startedAt: new Date(), finishedAt: null };
  const database = db({
    metaConnection: { findFirst: async () => connection(), updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    metaAdAccount: { findFirst: async () => ({ externalId: "1", currency: "BRL", sourceAccountStatus: 1 }), update: async () => ({}) },
    metaConnectionAccount: { findUnique: async () => ({ selected: true, accessible: true }), updateMany: async () => ({ count: 1 }) },
    marketingCampaign: { upsert: async ({ update }: { update: { name: string } }) => { campaign = { ...campaign, name: update.name, version: campaign.version + 1 }; return campaign; }, findMany: async () => [campaign] },
    marketingCostRule: { findFirst: async () => ({ id: "rule", percentage: new Prisma.Decimal("12.75") }) },
    marketingDailyMetric: { findUnique: async () => records.get("2026-10-05") ?? null, upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { const key = (create.date as Date).toISOString().slice(0, 10); records.set(key, records.has(key) ? { ...records.get(key), ...update } : create); } },
    marketingAdDailyMetric: { findUnique: async () => null, upsert: async ({ create }: { create: Record<string, unknown> }) => { adRecords.set(String(create.adExternalId), create); } },
    marketingSyncRun: { updateMany: async ({ data }: { data: Record<string, unknown> }) => { if (data.claimedAt) return { count: leaseValid ? 1 : 0 }; closed = true; return { count: 1 }; }, findFirst: async () => run,
      update: async () => { completed = true; } },
  });
  return { database, records, adRecords, run, campaign: () => campaign, completed: () => completed, closed: () => closed };
}
function syncPayload(spend = "31.00", conversations = "5") {
  return [{ data: [{ id: "11", name: "Renamed campaign", status: "ACTIVE", effective_status: "ACTIVE" }] },
    { data: [{ id: "33", campaign_id: "11", adset_id: "22", creative: { id: "44" } }] },
    { data: [{ ...validInsight, spend, actions: [{ action_type: CONVERSATION_ACTION, value: conversations }] }] },
    { data: [{ ...validInsight, spend, ad_id: "33", adset_id: "22", actions: [{ action_type: CONVERSATION_ACTION, value: conversations }] }] }];
}
test("real ingestion contract renames stable campaign without reassigning it and stores daily creative IDs", async context => {
  const fixture = syncFixture(); context.mock.method(globalThis, "fetch", transport(syncPayload()));
  assert.equal((await executeSync(fixture.run, fixture.database)).status, "SUCCEEDED");
  assert.equal(fixture.campaign().name, "Renamed campaign"); assert.equal(fixture.campaign().purpose, "CLIENTES");
  const metric = fixture.records.get("2026-10-05")!; assert.equal(String(metric.metaSpend), "31"); assert.equal(metric.leads, 5); assert.equal(String(metric.effectiveSpend), "34.95");
  const ad = fixture.adRecords.get("33")!; assert.equal(ad.creativeExternalId, "44"); assert.equal(ad.adSetExternalId, "22"); assert.equal(ad.campaignId, "campaign"); assert.ok(fixture.completed());
});
test("intraday sync replaces 18 with 31, keeps existing cost snapshot, and same observation is idempotent", async context => {
  const fixture = syncFixture();
  fixture.records.set("2026-10-05", { metaSpend: new Prisma.Decimal("18"), leads: 2, costPercentage: new Prisma.Decimal("10"), costRuleId: "historical-rule", sourceObservedAt: new Date(0) });
  context.mock.method(globalThis, "fetch", transport(syncPayload())); await executeSync(fixture.run, fixture.database);
  const saved = fixture.records.get("2026-10-05")!; assert.equal(String(saved.metaSpend), "31"); assert.equal(String(saved.effectiveSpend), "34.1"); assert.equal(saved.costRuleId, "historical-rule");
});
test("failed page and expired lease prevent every campaign and metric write", async context => {
  const fixture = syncFixture(); const payload = syncPayload(); payload[3] = { data: [] }; const responses: unknown[] = [...payload.slice(0, 3), new Error("timeout")];
  context.mock.method(globalThis, "fetch", transport(responses)); assert.equal((await executeSync(fixture.run, fixture.database)).status, "FAILED");
  assert.equal(fixture.campaign().name, "Old name"); assert.equal(fixture.records.size, 0); assert.equal(fixture.completed(), false); assert.ok(fixture.closed());
});
test("concurrent worker with stale lease cannot persist or finish a new owner's run", async context => {
  const fixture = syncFixture(false); context.mock.method(globalThis, "fetch", transport(syncPayload()));
  assert.equal((await executeSync(fixture.run, fixture.database)).status, "FAILED"); assert.equal(fixture.records.size, 0); assert.equal(fixture.campaign().name, "Old name");
});
test("same broker consolidates accounts/connections across daily assignment history and separates currencies", () => {
  const metric = (id: string, account: string, currency: string) => ({ date: day("2026-10-05"), currency, state: "CONFIRMED", metaSpend: new Prisma.Decimal("10"), effectiveSpend: new Prisma.Decimal("10"), leads: 2,
    campaign: { id, name: id, purpose: "CLIENTES", account: { name: account, timezone: "Asia/Tokyo" }, assignments: [{ brokerId: "thiago", validFrom: day("2026-09-01"), validTo: null, broker: { name: "Thiago" } }] } });
  const result = summarize([metric("c1", "a1", "BRL"), metric("c2", "a2", "BRL"), metric("c3", "a3", "USD")], "thiago");
  assert.equal(result.brokers.length, 2); assert.equal(result.brokers.find(b => b.currency === "BRL")?.metaSpend, "20.00"); assert.equal(result.campaigns.length, 3);
});
test("successful empty account sync still exposes last update scoped to the tenant and selected account", async () => {
  const now = new Date();
  const database = db({ metaAdAccount: { findFirst: async () => ({ timezone: "Asia/Tokyo" }), aggregate: async ({ where }: { where: object }) => { assert.deepEqual(where, { tenantId: "tenant", id: "account" }); return { _max: { lastSyncedAt: now } }; } },
    marketingDailyMetric: { count: async () => 0, findMany: async () => [] } });
  const result = await overview(viewer, new URLSearchParams("period=today&accountId=account"), database);
  assert.equal(result.lastSyncedAt, now); assert.equal(result.totals.length, 0); assert.ok(result.timezoneNote.includes("Asia/Tokyo"));
});
test("first sync imports a historic campaign omitted by the campaigns edge using its provider name", async context => {
  const fixture = syncFixture(), payloads = syncPayload(); payloads[0] = { data: [] };
  for (const row of payloads[2].data) Object.assign(row, { campaign_name: "Historic campaign" });
  for (const row of payloads[3].data) Object.assign(row, { campaign_name: "Historic campaign" });
  context.mock.method(fixture.database.marketingCampaign, "findMany", async () => []);
  context.mock.method(globalThis, "fetch", transport(payloads));
  assert.equal((await executeSync(fixture.run, fixture.database)).status, "SUCCEEDED");
  assert.equal(fixture.campaign().name, "Historic campaign"); assert.equal(fixture.records.size, 1);
});
test("OAuth start endpoint sets a browser-bound Secure HttpOnly Lax cookie without returning credentials", async context => {
  const { createSessionToken } = await import("../../src/lib/auth.server");
  const { POST } = await import("../../src/app/api/marketing/meta/connect/route");
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  const oldUser = prisma.user.findFirst, oldConnection = prisma.metaConnection.findFirst, oldState = prisma.marketingOAuthState.create;
  context.after(() => { prisma.user.findFirst = oldUser; prisma.metaConnection.findFirst = oldConnection; prisma.marketingOAuthState.create = oldState; });
  prisma.user.findFirst = (async () => ({ id: "owner", tenantId: "tenant", role: "OWNER", name: "Synthetic", email: "synthetic@example.test", isActive: true, sessionVersion: 0, tenant: { id: "tenant", name: "Synthetic", slug: "synthetic", isPlatform: false, parentId: null } })) as unknown as typeof prisma.user.findFirst;
  prisma.metaConnection.findFirst = (async () => ({ id: "connection", credentialVersion: 1 })) as unknown as typeof prisma.metaConnection.findFirst;
  prisma.marketingOAuthState.create = (async () => ({})) as unknown as typeof prisma.marketingOAuthState.create;
  const session = createSessionToken({ uid: "owner", tid: "tenant", role: "OWNER", sv: 0 });
  const response = await requestContext(session, () => POST(new Request("https://flyimob.com/api/marketing/meta/connect", { method: "POST", body: JSON.stringify({ connectionId: "connection" }) })));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!;
  for (const fragment of ["HttpOnly", "Secure", "SameSite=lax", "Path=/api/integrations/meta/callback", "Max-Age=600"]) assert.ok(cookie.includes(fragment));
  const body = await response.json(), url = new URL(body.url); assert.equal(url.searchParams.get("redirect_uri"), "https://flyimob.com/api/integrations/meta/callback");
  assert.equal(Object.keys(body).length, 1); assert.ok(!JSON.stringify(body).includes(process.env.META_APP_SECRET!));
});
test("callback without matching browser state redirects safely and performs no credential exchange", async () => {
  const { GET } = await import("../../src/app/api/integrations/meta/callback/route");
  const response = await requestContext(undefined, () => GET(new Request("https://flyimob.com/api/integrations/meta/callback?state=bad&code=synthetic")));
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "https://flyimob.com/admin/marketing/configuracoes?meta=error");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer"); assert.ok(response.headers.get("set-cookie")?.includes("Max-Age=0"));
});

test("successful campaign sync also records physical balance and repeated observation does not duplicate it", async context => {
 const fixture=syncFixture();let saved:Record<string,unknown>|undefined;
 const snapshot={findUnique:async()=>saved?{state:"AVAILABLE"}:null,upsert:async({create}:{create:Record<string,unknown>})=>{saved=create;}};
 Object.assign(fixture.database,{marketingBalanceSnapshot:snapshot});
 Object.assign(fixture.database.metaConnectionAccount,{findFirst:async()=>({id:"link"})});
 const original=fixture.database.$transaction;
 Object.assign(fixture.database,{$transaction:async(callback:(tx:unknown)=>unknown)=>original(async tx=>{Object.assign(tx,{marketingBalanceSnapshot:snapshot});return callback(tx);})});
 const payloads:unknown[]=[...syncPayload(),{id:"act_1",currency:"BRL",funding_source_details:{display_string:"Saldo disponível (R$689,39 BRL)",id:"123",type:20}}];
 context.mock.method(globalThis,"fetch",transport(payloads));
 assert.equal((await executeSync(fixture.run,fixture.database)).status,"SUCCEEDED");assert.equal(String(saved?.availableBalance),"689.39");assert.equal(saved?.observationKey,"sync:run");
 context.mock.method(globalThis,"fetch",transport(syncPayload()));await executeSync(fixture.run,fixture.database);assert.equal(fixture.records.size,1);assert.equal(String(fixture.records.get("2026-10-05")?.metaSpend),"31");
});
