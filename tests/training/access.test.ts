import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../src/lib/prisma";
import { brokerLoginStatus, trainingCourseTitle } from "../../src/lib/training/access-policy";
import { trainingBrokers } from "../../src/lib/training/brokers.server";
import { setAccess } from "../../src/lib/training/service.server";
import { GET } from "../../src/app/api/admin/training/access/route";
import { createSessionToken } from "../../src/lib/auth.server";
import { trainingFetch } from "../../src/components/training/Training";

test("stale login eligibility gives an actionable message without changing learner revocation errors", async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ error: "broker_login_required" }, { status: 409 });
    await assert.rejects(trainingFetch("/api/admin/training/access", "PUT", {}), /Usuários \/ Equipe/);
    globalThis.fetch = async () => Response.json({ error: "access_revoked" }, { status: 403 });
    await assert.rejects(trainingFetch("/api/training/courses"), /Acesso revogado/);
  } finally { globalThis.fetch = oldFetch; }
});

test("operational identity never grants login or changes system role", () => {
  const ready = { role: "BROKER", isActive: true, passwordConfigured: true };
  assert.equal(brokerLoginStatus(null), "no_login");
  assert.equal(brokerLoginStatus(ready), "eligible");
  assert.equal(brokerLoginStatus({ ...ready, role: "MANAGER" }), "wrong_role");
  assert.equal(brokerLoginStatus({ ...ready, isActive: false }), "inactive_login");
  assert.equal(brokerLoginStatus({ ...ready, passwordConfigured: false }), "password_pending");
  assert.equal(brokerLoginStatus(ready, { active: false, mergedIntoId: null }), "inactive_person");
  assert.equal(brokerLoginStatus(ready, { active: true, mergedIntoId: "canonical" }), "inactive_person");
  assert.equal(trainingCourseTitle("cmv2etzu60000s90wahxoe74k"), "Curso Iniciação Flyimob");
});

test("list uses explicit person linkage and includes people without login and legacy users in same tenant", async () => {
  const oldPeople = prisma.operationPerson.findMany, oldUsers = prisma.user.findMany;
  const login = { id: "login-laura", name: "Login antigo", role: "BROKER", isActive: true, passwordHash: "DO_NOT_EXPOSE", trainingAccess: null };
  prisma.operationPerson.findMany = (async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { tenantId: "goiania", mergedIntoId: null, OR: [{ operationalRole: "BROKER" }, { user: { role: "BROKER" } }] });
    return [{ id: "person-sandra", name: "Sandra Freitas", active: true, mergedIntoId: null, user: null },
      { id: "person-laura", name: "Laura Moura", active: true, mergedIntoId: null, user: login }];
  }) as unknown as typeof oldPeople;
  prisma.user.findMany = (async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { tenantId: "goiania", personId: null, role: "BROKER" });
    return [{ ...login, id: "legacy", name: "Gilberto", passwordHash: null }];
  }) as unknown as typeof oldUsers;
  try {
    const rows = await trainingBrokers("goiania");
    assert.deepEqual(rows.map(r => [r.name, r.userId, r.status]), [["Gilberto", "legacy", "password_pending"], ["Laura Moura", "login-laura", "eligible"], ["Sandra Freitas", null, "no_login"]]);
    assert.equal(JSON.stringify(rows).includes("DO_NOT_EXPOSE"), false);
    assert.equal(JSON.stringify(rows).includes("passwordHash"), false);
  } finally { prisma.operationPerson.findMany = oldPeople; prisma.user.findMany = oldUsers; }
});

test("invalid login, person ID or other tenant cannot create access or call Horizonte; eligible login still works", async () => {
  const oldTx = prisma.$transaction, oldFetch = globalThis.fetch, oldIds = process.env.HORIZONTE_COURSE_IDS, oldEnabled = process.env.HORIZONTE_ENABLED;
  process.env.HORIZONTE_COURSE_IDS = "c1"; process.env.HORIZONTE_ENABLED = "false";
  let writes = 0, remote = 0;
  let broker: unknown = { id: "user", tenantId: "t1", name: "Laura", role: "BROKER", isActive: true, passwordHash: null, person: { active: true, mergedIntoId: null } };
  globalThis.fetch = async () => { remote++; throw Error("Unexpected network"); };
  const tx = { $executeRaw: async () => {}, user: { findFirst: async ({ where }: { where: Record<string, unknown> }) => { assert.equal(where.tenantId, "t1"); assert.equal(where.role, "BROKER"); assert.equal(where.isActive, true); return broker; } }, trainingAccess: { upsert: async () => { writes++; } } };
  prisma.$transaction = (async (fn: (db: unknown) => unknown) => fn(tx)) as typeof oldTx;
  try {
    const admin = { id: "owner", tenantId: "t1", name: "Owner" };
    await assert.rejects(setAccess(admin, "user", ["c1"]), /broker_login_required/);
    broker = { ...(broker as object), passwordHash: "local-test", person: { active: false, mergedIntoId: null } };
    await assert.rejects(setAccess(admin, "user", ["c1"]), /broker_login_required/);
    broker = null;
    await assert.rejects(setAccess(admin, "person:unlinked", ["c1"]), /broker_not_found/);
    await assert.rejects(setAccess(admin, "other-tenant-user", ["c1"]), /broker_not_found/);
    assert.equal(writes, 0); assert.equal(remote, 0);
    broker = { id: "user", tenantId: "t1", name: "Laura", role: "BROKER", isActive: true, passwordHash: "local-test", person: null };
    assert.deepEqual(await setAccess(admin, "user", ["c1"]), { ok: true, syncPending: true });
    assert.equal(writes, 1);
  } finally { prisma.$transaction = oldTx; globalThis.fetch = oldFetch; if (oldIds === undefined) delete process.env.HORIZONTE_COURSE_IDS; else process.env.HORIZONTE_COURSE_IDS = oldIds; if (oldEnabled === undefined) delete process.env.HORIZONTE_ENABLED; else process.env.HORIZONTE_ENABLED = oldEnabled; }
});

test("admin route derives tenant from session and returns friendly course names without credentials", async () => {
  const oldFind = prisma.user.findFirst, oldUsers = prisma.user.findMany, oldPeople = prisma.operationPerson.findMany;
  const oldSecret = process.env.SESSION_SECRET, oldIds = process.env.HORIZONTE_COURSE_IDS;
  process.env.SESSION_SECRET = "synthetic-local-admin-session-secret"; process.env.HORIZONTE_COURSE_IDS = "cmv2etzu60000s90wahxoe74k";
  prisma.user.findFirst = (async () => ({ id: "owner", tenantId: "t1", role: "OWNER", name: "Owner", isActive: true, sessionVersion: 0, tenant: { id: "t1", isPlatform: false } })) as unknown as typeof oldFind;
  prisma.operationPerson.findMany = (async ({ where }: { where: { tenantId: string } }) => { assert.equal(where.tenantId, "t1"); return [{ id: "person", name: "Sandra", active: true, mergedIntoId: null, user: null }]; }) as unknown as typeof oldPeople;
  prisma.user.findMany = (async ({ where }: { where: { tenantId: string } }) => { assert.equal(where.tenantId, "t1"); return []; }) as unknown as typeof oldUsers;
  try {
    const token = createSessionToken({ uid: "owner", tid: "t1", role: "OWNER", sv: 0 });
    const r = await requestContext(token, () => GET(new Request("https://flyimob.test/api/admin/training/access?tenantId=other")));
    assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "private, no-store");
    const data = await r.json();
    assert.deepEqual(data.courses, [{ id: "cmv2etzu60000s90wahxoe74k", title: "Curso Iniciação Flyimob" }]);
    assert.equal(data.brokers[0].name, "Sandra"); assert.equal(data.brokers[0].eligible, false); assert.equal(data.brokers[0].userId, null);
  } finally { prisma.user.findFirst = oldFind; prisma.user.findMany = oldUsers; prisma.operationPerson.findMany = oldPeople; if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret; if (oldIds === undefined) delete process.env.HORIZONTE_COURSE_IDS; else process.env.HORIZONTE_COURSE_IDS = oldIds; }
});
