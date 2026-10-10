import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { eligiblePerson } from "../../src/lib/team/policy";
import { teamOwner, savePerson, enableAccess, people } from "../../src/lib/team/service.server";
import { updateCampaign } from "../../src/lib/marketing/admin.server";
import { campaignList, metaStatusWhere, options } from "../../src/lib/marketing/queries.server";
import { prisma } from "../../src/lib/prisma";
import { day, type MarketingViewer } from "../../src/lib/marketing/policy";
import { requestContext } from "../documentacoes/request-context";
import { createSessionToken } from "../../src/lib/auth.server";
import { GET, POST } from "../../src/app/api/team/route";
import { PATCH } from "../../src/app/api/team/[id]/route";
import { POST as accessPost } from "../../src/app/api/team/[id]/access/route";

const owner: MarketingViewer = { tenant: { id: "operation-a", isPlatform: false }, user: { id: "owner", tenantId: "operation-a", role: "OWNER" } };
const source = { id: "person-a", name: "Same name", email: null, operationalRole: "BROKER", active: true, mergedIntoId: null, independent: false, user: null, financialParticipant: { id: "participant", name: "Same name", active: true } };
function database(tx: Record<string, unknown>) { return { ...tx, $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as unknown as typeof prisma; }

for (const [label, overrides, expected] of [
  ["active participant without login", {}, true],
  ["active user without financial participant", { financialParticipant: null, user: { isActive: true } }, true],
  ["inactive participant alone", { financialParticipant: { active: false } }, false],
  ["inactive user alone", { financialParticipant: null, user: { isActive: false } }, false],
  ["inactive user with active financial identity", { user: { isActive: false } }, true],
  ["inactive operational identity overrides active sources", { active: false }, false],
  ["independent person needs neither login nor finances", { independent: true, financialParticipant: null }, true],
  ["merged identity cannot be selected", { mergedIntoId: "canonical" }, false],
] as const) test(label, () => { assert.equal(eligiblePerson({ ...source, ...overrides }), expected); });

test("same names do not deduplicate identities; explicit shared person yields one option", async () => {
  const db = database({ operationPerson: { findMany: async ({ where }: { where: Record<string, unknown> }) => {
    assert.deepEqual(where, { tenantId: owner.tenant.id, mergedIntoId: null });
    return [{ ...source, user: { id: "user", isActive: true } }, { ...source, id: "unrelated-person", financialParticipant: { ...source.financialParticipant, id: "other" } }];
  } }, metaAdAccount: { findMany: async () => [] } });
  const result = await options(owner, db); assert.equal(result.brokers.length, 2); assert.equal(result.brokers[0].name, result.brokers[1].name);
  assert.equal((await people(owner.tenant.id, db)).filter(p => p.id === source.id).length, 1);
});

for (const role of ["DIRECTOR", "MANAGER", "BROKER", "DATA_ENTRY", "CORRESPONDENTE"] as const) test(`team writes denied for ${role}`, async () => {
  const viewer = { ...owner, user: { ...owner.user, role } };
  assert.throws(() => teamOwner(viewer), /OWNER/);
  await assert.rejects(savePerson(viewer, null, {}, database({})), /OWNER/);
  await assert.rejects(enableAccess(viewer, "person", {}, database({})), /OWNER/);
});

test("tenant mismatch denied before reads or writes", () => { assert.throws(() => teamOwner({ ...owner, user: { ...owner.user, tenantId: "foreign" } }), /OWNER/); });

test("OWNER can affirm an active operational identity while its login stays inactive", async () => {
  let updated: Record<string, unknown> = {};
  const existing = { ...source, financialParticipant: null, user: { id: "inactive-user", isActive: false } };
  const db = database({ operationPerson: { findFirst: async () => existing, update: async ({ data }: { data: Record<string, unknown> }) => { updated = data; } },
    marketingAuditEvent: { create: async () => ({}) } });
  await savePerson(owner, existing.id, { name: existing.name, email: null, operationalRole: "BROKER", active: true }, db);
  assert.equal(updated.independent, true); assert.equal(updated.active, true);
  assert.equal(eligiblePerson({ ...existing, independent: updated.independent === true }), true);
  assert.equal(existing.user.isActive, false);
});

test("active participant without User gets date-bounded assignment with no fabricated broker", async () => {
  let closed: unknown, created: Record<string, unknown> = {};
  const db = database({
    marketingCampaign: { findFirst: async () => ({ id: "campaign", purpose: "CLIENTES" }), updateMany: async () => ({ count: 1 }) },
    operationPerson: { findFirst: async ({ where }: { where: Record<string, unknown> }) => { assert.equal(where.tenantId, owner.tenant.id); return source; } },
    campaignBrokerAssignment: {
      findFirst: async ({ orderBy }: { orderBy?: unknown }) => orderBy ? { validFrom: day("2026-10-25") } : { id: "old", personId: "previous", validFrom: day("2026-10-01"), validTo: day("2026-10-25") },
      update: async ({ data }: { data: unknown }) => { closed = data; }, create: async ({ data }: { data: Record<string, unknown> }) => { created = data; },
    }, marketingAuditEvent: { create: async () => ({}) },
  });
  await updateCampaign(owner, "campaign", { version: 0, assignment: { personId: source.id, validFrom: "2026-10-15" } }, db);
  assert.deepEqual(closed, { validTo: day("2026-10-15") }); assert.equal(created.personId, source.id); assert.equal(created.brokerId, null); assert.deepEqual(created.validTo, day("2026-10-25"));
});

test("cancellation at same start preserves row instead of deleting history", async () => {
  let cancelled: Record<string, unknown> = {};
  const db = database({ marketingCampaign: { findFirst: async () => ({ id: "campaign" }), updateMany: async () => ({ count: 1 }) },
    campaignBrokerAssignment: { findFirst: async ({ orderBy }: { orderBy?: unknown }) => orderBy ? null : { id: "old", personId: source.id, validFrom: day("2026-10-15"), validTo: null }, update: async ({ data }: { data: Record<string, unknown> }) => { cancelled = data; }, create: async () => assert.fail("cannot create empty assignment") },
    marketingAuditEvent: { create: async () => ({}) },
  });
  await updateCampaign(owner, "campaign", { version: 0, assignment: { personId: null, validFrom: "2026-10-15" } }, db);
  assert.ok(cancelled.cancelledAt instanceof Date); assert.equal(Object.keys(cancelled).length, 1);
});

test("only internal fields can be edited; Meta state never accepted", async () => {
  for (const key of ["sourceStatus", "effectiveStatus", "budget", "metaStatus"]) await assert.rejects(updateCampaign(owner, "campaign", { version: 0, [key]: "ACTIVE" }, database({})), /Campo/);
});

test("Meta status predicates prefer effective status with source fallback", () => {
  assert.deepEqual(metaStatusWhere("ACTIVE"), { OR: [{ effectiveStatus: "ACTIVE" }, { effectiveStatus: null, sourceStatus: "ACTIVE" }] });
  assert.deepEqual(metaStatusWhere("PAUSED"), { OR: [{ effectiveStatus: "PAUSED" }, { effectiveStatus: null, sourceStatus: "PAUSED" }] });
  assert.ok(metaStatusWhere("OTHER").AND);
});

test("priority groups paginate globally and current responsible uses canonical ID", async () => {
  const visited: string[] = [];
  const db = database({ operationPerson:{findMany:async()=>[{id:"person-a"}]},marketingCampaign: {
    count: async ({ where }: { where: { AND: Record<string, unknown>[] } }) => {
      const scoped = where.AND[0]; assert.equal(scoped.tenantId, owner.tenant.id);
      const assignment = (scoped.OR as {assignments:{some:Record<string,unknown>}}[])[0].assignments; assert.deepEqual(assignment.some.personId, {in:["person-a"]});
      return where.AND[1].AND ? 1 : 15;
    },
    findMany: async ({ where, skip, take, orderBy }: { where: { AND: Record<string, unknown>[] }; skip: number; take: number; orderBy: unknown }) => {
      const clause = where.AND[1], group = clause.AND ? "OTHER" : ((clause.OR as { effectiveStatus: string }[])[0].effectiveStatus); visited.push(group);
      assert.deepEqual(orderBy, [{ updatedAt: "desc" }, { id: "asc" }]);
      if (group === "PAUSED") { assert.equal(skip, 5); assert.equal(take, 20); return Array.from({ length: 10 }, (_, i) => ({ id: `paused-${i}`, assignments: [] })); }
      assert.equal(skip, 0); assert.equal(take, 10); return [{ id: "archived", assignments: [] }];
    },
  } });
  const result = await campaignList(owner, new URLSearchParams("metaStatus=ALL&brokerId=person-a&page=2"), db);
  assert.deepEqual(visited, ["PAUSED", "OTHER"]); assert.equal(result.total, 31); assert.equal(result.items.length, 11);
});

test("default active; textual search all; malformed Meta filters rejected", async () => {
  const db = database({ marketingCampaign: { count: async () => 0 } });
  assert.equal((await campaignList(owner, new URLSearchParams(), db)).metaStatus, "ACTIVE");
  assert.equal((await campaignList(owner, new URLSearchParams("q=historical"), db)).metaStatus, "ALL");
  await assert.rejects(campaignList(owner, new URLSearchParams("metaStatus=INVALID"), db), /Status Meta/);
});

test("team routes reject anonymous requests before parsing or database mutation", async () => {
  const request = new Request("https://flyimob.test/api/team", { method: "POST", body: "invalid" });
  const context = { params: Promise.resolve({ id: "foreign" }) };
  for (const run of [() => GET(), () => POST(request), () => PATCH(request, context), () => accessPost(request, context)]) assert.equal((await requestContext(undefined, run)).status, 401);
});

test("director retains Marketing but cannot access team endpoints", async t => {
  process.env.SESSION_SECRET = "synthetic-team-test-session";
  const original = prisma.user.findFirst; t.after(() => { prisma.user.findFirst = original; });
  prisma.user.findFirst = (async () => ({ id: "director", tenantId: "operation-a", role: "DIRECTOR", name: "Synthetic", email: "synthetic@example.test", isActive: true, sessionVersion: 0, tenant: { ...owner.tenant, name: "Synthetic", slug: "synthetic", parentId: null } })) as unknown as typeof prisma.user.findFirst;
  const token = createSessionToken({ uid: "director", tid: "operation-a", role: "DIRECTOR", sv: 0 });
  assert.equal((await requestContext(token, () => GET())).status, 403);
  assert.equal((await requestContext(token, () => accessPost(new Request("https://flyimob.test", { method: "POST", body: "invalid" }), { params: Promise.resolve({ id: "p" }) }))).status, 403);
});

test("migration keeps legacy IDs/columns and has no destructive SQL or fuzzy backfill", () => {
  const sql = readFileSync("prisma/migrations/20261005120000_operation_people/migration.sql", "utf8");
  assert.equal(/DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM/i.test(sql), false);
  assert.ok(sql.includes('p."userId" = u."id" AND p."tenantId" = u."tenantId"'));
  assert.equal(/WHERE[^;]*(?:lower\(|ILIKE)/i.test(sql), false);
  assert.ok(sql.includes('"brokerId" DROP NOT NULL')); assert.ok(sql.includes('"personId" IS NOT NULL OR "brokerId" IS NOT NULL'));
});
