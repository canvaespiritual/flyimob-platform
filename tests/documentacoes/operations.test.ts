import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { createSessionToken, verifyPassword } from "../../src/lib/auth.server";
import { createFolder, updateFolder, mutatePerson, ensureCatalog } from "../../src/lib/documentacoes/folders.server";
import { initialCatalog } from "../../src/lib/documentacoes/catalog";
import { folderFilters, pagination } from "../../src/lib/documentacoes/queries.server";
import { personInput, cpf } from "../../src/lib/documentacoes/validation";
import { GET as listFolders, POST as postFolder } from "../../src/app/api/documentacoes/pastas/route";
import { GET as getFolder, PATCH as patchFolder } from "../../src/app/api/documentacoes/pastas/[id]/route";
import { POST as addPerson } from "../../src/app/api/documentacoes/pastas/[id]/pessoas/route";
import { PATCH as editPerson, DELETE as removePerson } from "../../src/app/api/documentacoes/pastas/[id]/pessoas/[personId]/route";
import { GET as listCorrespondents, POST as createCorrespondent } from "../../src/app/api/documentacoes/correspondentes/route";
import { PATCH as activateCorrespondent } from "../../src/app/api/documentacoes/correspondentes/[id]/route";
import { POST as invite } from "../../src/app/api/documentacoes/correspondentes/convite/route";
import { POST as reset } from "../../src/app/api/documentacoes/correspondentes/[id]/recuperar-acesso/route";
import { GET as listTypes, POST as addType } from "../../src/app/api/documentacoes/tipos/route";
import { PATCH as editType } from "../../src/app/api/documentacoes/tipos/[id]/route";
import { POST as initializeTypes } from "../../src/app/api/documentacoes/tipos/inicializar/route";
import { GET as options } from "../../src/app/api/documentacoes/opcoes/route";
import CorrespondentePage from "../../src/app/correspondente/page";
import { sessionAuthorizesUser } from "../../src/lib/auth-policy";

process.env.SESSION_SECRET = "synthetic-documentation-operations-secret";
const session = { user: { id: "owner-a", tenantId: "tenant-a", role: "OWNER" as UserRole }, tenant: { id: "tenant-a", isPlatform: false } };
const holder = { name: "Pessoa sintética", cpf: "52998224725", phone: "11900000000", relationship: "TITULAR" };
type Args = { where: Record<string, unknown>; data: Record<string, unknown>; select?: Record<string, unknown> };
function fakeDB(overrides: Record<string, unknown> = {}) {
  const events: Record<string, unknown>[] = []; const folders: Record<string, unknown>[] = [];
  const current = { id: "folder-a", tenantId: "tenant-a", version: 2, status: "EM_MONTAGEM", brokerId: "broker-a", correspondentId: null, crmLeadId: null, construtoraId: null, empreendimentoId: null, administrativeObservation: null };
  const tx = {
    user: { findFirst: async ({ where }: Args) => where.id === "foreign" ? null : { id: where.id } },
    cRMLead: { findFirst: async () => null }, construtora: { findFirst: async () => null }, empreendimento: { findFirst: async () => null },
    documentationFolder: { findFirst: async ({ where }: Args) => where.id === "foreign" ? null : current,
      updateMany: async ({ where }: Args) => ({ count: where.version === current.version ? 1 : 0 }), update: async () => current,
      create: async ({ data }: Args) => { folders.push(data); return { id: "folder-a", version: 0 }; } },
    documentationPerson: { findFirst: async () => ({ id: "person-a", ...holder }), count: async () => 1,
      create: async ({ data }: Args) => ({ id: "person-new", ...data }), update: async ({ data }: Args) => ({ id: "person-a", ...data }), delete: async () => ({ id: "person-a" }) },
    documentationDocument: { count: async () => 0 }, documentationPendingItem: { count: async () => 0 },
    documentationDocumentType: { createMany: async () => ({ count: 20 }) },
    documentationEvent: { create: async ({ data }: Args) => { events.push(data); return data; } }, ...overrides,
  };
  const db = { $transaction: async (callback: (tx: unknown) => unknown) => { const e = events.length; const f = folders.length; try { return await callback(tx); } catch (error) { events.length = e; folders.length = f; throw error; } } } as unknown as typeof prisma;
  return { db, tx: tx as unknown as Prisma.TransactionClient, events, folders };
}
const restores: (() => void)[] = [];
function mock(t: TestContext, target: object, key: string, implementation: unknown) {
  const record = target as Record<string, unknown>; const before = record[key]; record[key] = implementation;
  restores.push(() => { record[key] = before; }); t.after(() => { while (restores.length) restores.pop()!(); });
}
const account = (role: UserRole = "OWNER") => ({ id: "owner-a", tenantId: "tenant-a", role, isActive: true, sessionVersion: 0, name: "Synthetic", email: "synthetic@example.test", tenant: { id: "tenant-a", name: "Synthetic operation", isPlatform: false, slug: "synthetic", parentId: null } });
const token = (role: UserRole = "OWNER") => createSessionToken({ uid: "owner-a", tid: "tenant-a", role, sv: 0 });
const request = (body: unknown = {}, query = "") => new Request(`https://flyimob.test/api/test${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: "folder-a", personId: "person-a" }) };

test("OWNER creates a manual folder with session tenant, mandatory holder and real atomic events", async () => {
  const fake = fakeDB(); const result = await createFolder(session, { tenantId: "foreign", brokerId: "broker-a", holder, status: "APROVADO" }, fake.db);
  assert.deepEqual(result, { id: "folder-a", version: 0 });
  assert.equal(fake.folders[0].tenantId, "tenant-a"); assert.equal(fake.folders[0].crmLeadId, null); assert.equal(fake.folders[0].status, "EM_MONTAGEM");
  assert.deepEqual((fake.folders[0].people as { create: unknown }).create, { ...holder, email: null, birthDate: null });
  assert.deepEqual(fake.events.map(event => event.eventType), ["FOLDER_CREATED", "BROKER_ASSIGNED"]);
  assert.equal(JSON.stringify(fake.events).includes(holder.cpf), false); assert.equal(JSON.stringify(fake.events).includes(holder.name), false);
});
test("creation rejects absent broker, foreign broker/correspondent/CRM and invalid holder without writes", async () => {
  for (const body of [{ holder }, { holder, brokerId: "foreign" }, { holder, brokerId: "broker-a", correspondentId: "foreign" }, { holder, brokerId: "broker-a", crmLeadId: "foreign" }, { holder: { ...holder, cpf: null }, brokerId: "broker-a" }]) {
    const fake = fakeDB(); await assert.rejects(createFolder(session, body, fake.db)); assert.equal(fake.folders.length, 0); assert.equal(fake.events.length, 0);
  }
});
test("CRM provides a snapshot without changing CRM and references are tenant-scoped", async () => {
  const fake = fakeDB({ cRMLead: { findFirst: async ({ where }: Args) => { assert.equal(where.tenantId, "tenant-a"); return { id: "crm-a", nome: "CRM snapshot", telefone: "11999999999", email: "crm@example.test" }; } } });
  await createFolder(session, { brokerId: "broker-a", correspondentId: "correspondent-a", crmLeadId: "crm-a", holder: { cpf: holder.cpf } }, fake.db);
  assert.equal(fake.folders[0].crmLeadId, "crm-a"); assert.equal((fake.folders[0].people as { create: { name: string } }).create.name, "CRM snapshot");
  assert.equal(fake.events.at(-1)?.eventType, "CORRESPONDENT_ASSIGNED");
});
test("property enforces its builder and rejects tenant-invalid builders", async () => {
  const fake = fakeDB({ empreendimento: { findFirst: async ({ where }: Args) => { assert.equal(where.tenantId, "tenant-a"); return { id: "property-a", construtoraId: "builder-a" }; } }, construtora: { findFirst: async ({ where }: Args) => where.id === "builder-a" ? { id: "builder-a" } : null } });
  await assert.rejects(createFolder(session, { brokerId: "broker-a", holder, empreendimentoId: "property-a", construtoraId: "foreign" }, fake.db), /não correspondem/);
  await createFolder(session, { brokerId: "broker-a", holder, empreendimentoId: "property-a" }, fake.db); assert.equal(fake.folders[0].construtoraId, "builder-a");
});
test("service layer independently denies correspondent, platform and inconsistent tenant", async () => {
  for (const denied of [{ ...session, user: { ...session.user, role: "CORRESPONDENTE" as const } }, { ...session, tenant: { ...session.tenant, isPlatform: true } }, { ...session, user: { ...session.user, tenantId: "foreign" } }]) {
    const fake = fakeDB(); await assert.rejects(createFolder(denied, { brokerId: "broker-a", holder }, fake.db), /Acesso/);
    await assert.rejects(updateFolder(denied, "folder-a", { version: 2 }, fake.db), /Acesso/);
    await assert.rejects(mutatePerson(denied, "folder-a", null, "POST", { version: 2 }, fake.db), /Acesso/);
  }
});
test("optimistic version conflicts, IDOR and analysis statuses reject mutations", async () => {
  const fake = fakeDB(); await assert.rejects(updateFolder(session, "foreign", { version: 2 }, fake.db), /não encontrada/);
  await assert.rejects(updateFolder(session, "folder-a", { version: 1 }, fake.db), /Recarregue/);
  await assert.rejects(updateFolder(session, "folder-a", { version: 2, status: "APROVADO" }, fake.db), /apenas montagem/);
  const analysis = fakeDB({ documentationFolder: { findFirst: async () => ({ status: "APROVADO" }) } });
  await assert.rejects(updateFolder(session, "folder-a", { version: 2 }, analysis.db), /não permite/);
  assert.equal(fake.events.length, 0);
});
test("pending folders permit corrections but administrative PATCH cannot bypass workflow status", async () => {
  let writes = 0;
  const fake = fakeDB({ documentationFolder: {
    findFirst: async () => ({ id: "folder-a", tenantId: "tenant-a", version: 2, status: "PENDENCIA_DOCUMENTAL", brokerId: "broker-a", correspondentId: "correspondent-a", crmLeadId: null, construtoraId: null, empreendimentoId: null, administrativeObservation: null }),
    updateMany: async () => ({ count: 1 }), update: async () => { writes++; return {}; },
  } });
  await assert.rejects(updateFolder(session, "folder-a", { version: 2, status: "EM_MONTAGEM" }, fake.db), /Use o reenvio/);
  assert.equal(writes, 0); assert.equal(fake.events.length, 0);
  await updateFolder(session, "folder-a", { version: 2, status: "PENDENCIA_DOCUMENTAL", administrativeObservation: "Correction" }, fake.db);
  assert.equal(writes, 1);
  await mutatePerson(session, "folder-a", null, "POST", { version: 2, name: "Synthetic correction", relationship: "OUTRO" }, fake.db);
  assert.ok(fake.events.some(event => event.eventType === "PERSON_ADDED"));
});
test("updates increment version and persist assignment and person events", async () => {
  const fake = fakeDB(); assert.deepEqual(await updateFolder(session, "folder-a", { version: 2, brokerId: "broker-b", correspondentId: "correspondent-a", holder, administrativeObservation: "private" }, fake.db), { id: "folder-a", version: 3 });
  assert.deepEqual(fake.events.map(event => event.eventType), ["PERSON_UPDATED", "FOLDER_UPDATED", "BROKER_ASSIGNED", "CORRESPONDENT_ASSIGNED"]);
  assert.equal(JSON.stringify(fake.events).includes("private"), false);
  const changed = fakeDB({ documentationFolder: { findFirst: async () => ({ id: "folder-a", status: "EM_MONTAGEM", brokerId: "broker-a", correspondentId: "correspondent-old" }), updateMany: async () => ({ count: 1 }), update: async () => ({}) } });
  await updateFolder(session, "folder-a", { version: 2, correspondentId: "correspondent-new" }, changed.db); assert.equal(changed.events.at(-1)?.eventType, "CORRESPONDENT_CHANGED");
});
test("spouse and guarantor additions permit repeated relationship types", async () => {
  const fake = fakeDB();
  for (const relationship of ["CONJUGE", "FIADOR", "FIADOR"]) await mutatePerson(session, "folder-a", null, "POST", { name: "Synthetic other", relationship, version: 2 }, fake.db);
  assert.deepEqual(fake.events.map(row => row.eventType), ["PERSON_ADDED", "PERSON_ADDED", "PERSON_ADDED"]);
});
test("second titular, holder removal/downgrade and foreign person are rejected", async () => {
  const fake = fakeDB(); await assert.rejects(mutatePerson(session, "folder-a", null, "POST", { ...holder, version: 2 }, fake.db), /já possui/);
  await assert.rejects(mutatePerson(session, "folder-a", "person-a", "DELETE", { version: 2 }, fake.db), /não pode ser removido/);
  await assert.rejects(mutatePerson(session, "folder-a", "person-a", "PATCH", { ...holder, relationship: "CONJUGE", version: 2 }, fake.db), /não pode perder/);
  const foreign = fakeDB({ documentationPerson: { findFirst: async ({ where }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.equal(where.folderId, "folder-a"); return null; } } });
  await assert.rejects(mutatePerson(session, "folder-a", "foreign", "PATCH", { version: 2 }, foreign.db), /não encontrada/);
});
test("safe removal preserves linked people and records actual removal only", async () => {
  const delegate = { findFirst: async () => ({ id: "person-a", relationship: "CONJUGE" }), delete: async () => ({ id: "person-a" }) };
  const linked = fakeDB({ documentationPerson: delegate, documentationDocument: { count: async () => 1 } });
  await assert.rejects(mutatePerson(session, "folder-a", "person-a", "DELETE", { version: 2 }, linked.db), /vinculada/); assert.equal(linked.events.length, 0);
  const safe = fakeDB({ documentationPerson: delegate }); await mutatePerson(session, "folder-a", "person-a", "DELETE", { version: 2 }, safe.db); assert.equal(safe.events[0].eventType, "PERSON_REMOVED");
});
test("event failure rolls back folder creation instead of leaving an unaudited folder", async () => {
  const fake = fakeDB({ documentationEvent: { create: async () => { throw new Error("synthetic event failure"); } } });
  await assert.rejects(createFolder(session, { brokerId: "broker-a", holder }, fake.db), /event failure/); assert.equal(fake.folders.length, 0);
});
test("catalog is idempotent, preserves customization and isolates tenant", async () => {
  const rows = new Map<string, Omit<ReturnType<typeof initialCatalog>[number], "name"> & { name: string }>();
  const fake = fakeDB({ documentationDocumentType: { createMany: async ({ data, skipDuplicates }: { data: ReturnType<typeof initialCatalog>; skipDuplicates: boolean }) => { assert.equal(skipDuplicates, true); let count = 0; for (const row of data) { const key = `${row.tenantId}:${row.code}`; if (!rows.has(key)) { rows.set(key, row); count++; } } return { count }; } } });
  assert.equal((await ensureCatalog(fake.tx, "tenant-a")).count, 20); rows.get("tenant-a:RG_CPF")!.name = "Custom name";
  assert.equal((await ensureCatalog(fake.tx, "tenant-a")).count, 0); assert.equal(rows.get("tenant-a:RG_CPF")!.name, "Custom name");
  assert.equal((await ensureCatalog(fake.tx, "tenant-b")).count, 20); assert.equal(rows.size, 40); assert.ok([...rows.values()].every(row => !row.defaultRequired));
});
test("search, pagination, CPF and Sao Paulo date bounds validate invalid inputs", () => {
  assert.deepEqual(pagination(new URLSearchParams("page=2")), { page: 2, skip: 20, take: 20 });
  for (const query of ["page=0", "page=NaN", "page=2.5"]) assert.throws(() => pagination(new URLSearchParams(query)));
  const where = folderFilters("tenant-a", new URLSearchParams("q=529.982.247-25&from=2026-10-01&to=2026-10-02"));
  assert.equal(where.tenantId, "tenant-a"); assert.equal((where.createdAt as { gte: Date }).gte.toISOString(), "2026-10-01T03:00:00.000Z"); assert.equal((where.createdAt as { lt: Date }).lt.toISOString(), "2026-10-03T03:00:00.000Z");
  for (const query of ["status=INVALID", "from=2026-02-30", "from=2026-10-05&to=2026-10-01"]) assert.throws(() => folderFilters("tenant-a", new URLSearchParams(query)));
  assert.equal(cpf("529.982.247-25"), holder.cpf); assert.throws(() => cpf("11111111111")); assert.throws(() => personInput({ name: "Synthetic", relationship: "TITULAR" }));
});
test("all new API handlers reject anonymous and correspondent before querying resources", async t => {
  const handlers = [() => listFolders(request()), () => postFolder(request()), () => getFolder(request(), context), () => patchFolder(request(), context), () => addPerson(request(), context), () => editPerson(request(), context), () => removePerson(request(), context), () => listCorrespondents(request()), () => activateCorrespondent(request(), context), () => invite(request()), () => reset(request(), context), () => listTypes(), () => addType(request()), () => editType(request(), context), () => initializeTypes(), () => options(request())];
  for (const handler of handlers) assert.equal((await requestContext(undefined, handler)).status, 401);
  mock(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  for (const handler of handlers) assert.equal((await requestContext(token("CORRESPONDENTE"), handler)).status, 403);
});
test("detail GET altered ID remains tenant-scoped and missing folder is 404", async t => {
  mock(t, prisma.user, "findFirst", async () => account()); mock(t, prisma.documentationFolder, "findFirst", async ({ where }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.equal(where.id, "foreign"); return null; });
  assert.equal((await requestContext(token(), () => getFolder(request(), { params: Promise.resolve({ id: "foreign" }) }))).status, 404);
});
test("correspondent listing uses only own tenant, fixed role and public columns", async t => {
  mock(t, prisma.user, "findFirst", async () => account()); mock(t, prisma.user, "findMany", async ({ where, select }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.equal(where.role, "CORRESPONDENTE"); assert.equal(select?.passwordHash, undefined); return []; });
  mock(t, prisma.user, "count", async () => 0); mock(t, prisma, "$transaction", async (promises: Promise<unknown>[]) => Promise.all(promises));
  assert.equal((await requestContext(token(), () => listCorrespondents(request()))).status, 200);
});
test("direct creation hashes password, fixes tenant/role and returns duplicate conflict", async t => {
  mock(t, prisma.user, "findFirst", async () => account());
  mock(t, prisma.user, "create", async ({ data }: Args) => { assert.equal(data.tenantId, "tenant-a"); assert.equal(data.role, "CORRESPONDENTE"); assert.equal(await verifyPassword("Synthetic Password 123", String(data.passwordHash)), true); return { id: "correspondent-a" }; });
  const body = { name: "Synthetic Correspondent", email: "synthetic@example.test", password: "Synthetic Password 123", tenantId: "foreign", role: "OWNER" };
  assert.equal((await requestContext(token(), () => createCorrespondent(request(body)))).status, 201);
  assert.equal((await requestContext(token(), () => createCorrespondent(request({ ...body, confirmPassword: "wrong" })))).status, 400);
  mock(t, prisma.user, "create", async () => { throw new Prisma.PrismaClientKnownRequestError("synthetic duplicate", { code: "P2002", clientVersion: "6" }); });
  assert.equal((await requestContext(token(), () => createCorrespondent(request(body)))).status, 409);
});
test("invitation reuses existing token flow with fixed role and no forged tenant", async t => {
  for (const [key, value] of Object.entries({ BREVO_API_KEY: "synthetic", BREVO_SENDER_EMAIL: "sender@example.test", APP_URL: "https://flyimob.test" })) { const before = process.env[key]; process.env[key] = value; t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; }); }
  mock(t, prisma.user, "findFirst", async () => account()); mock(t, prisma.user, "findUnique", async () => null);
  mock(t, prisma.userInviteToken, "create", async ({ data }: Args) => { assert.equal(data.role, "CORRESPONDENTE"); assert.equal(data.tenantId, "tenant-a"); assert.equal(data.invitedById, "owner-a"); return data; });
  mock(t, globalThis, "fetch", async () => Response.json({ messageId: "synthetic" }));
  const response = await requestContext(token(), () => invite(request({ email: "invite@example.test", role: "OWNER", tenantId: "foreign" })));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
});
test("inactivation scopes target, increments sessionVersion and revokes previous token", async t => {
  mock(t, prisma.user, "findFirst", async () => account()); mock(t, prisma.user, "updateMany", async ({ where, data }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.equal(where.role, "CORRESPONDENTE"); assert.equal(data.isActive, false); assert.deepEqual(data.sessionVersion, { increment: 1 }); return { count: 1 }; });
  assert.equal((await requestContext(token(), () => activateCorrespondent(request({ isActive: false, updatedAt: "2026-10-03T00:00:00.000Z" }), context))).status, 200);
  assert.equal(sessionAuthorizesUser({ uid: "owner-a", tid: "tenant-a", sv: 0 }, { ...account("CORRESPONDENTE"), sessionVersion: 1 }), false);
});
test("type updates isolate tenant, reject stale version and support activation changes", async t => {
  mock(t, prisma.user, "findFirst", async () => account()); let count = 1;
  mock(t, prisma.documentationDocumentType, "updateMany", async ({ where, data }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.ok(where.updatedAt instanceof Date); assert.equal(data.isActive, false); return { count }; });
  const body = { name: "Synthetic type", description: "", sortOrder: 9, isActive: false, defaultRequired: false, updatedAt: "2026-10-03T00:00:00.000Z" };
  assert.equal((await requestContext(token(), () => editType(request(body), context))).status, 200); count = 0;
  assert.equal((await requestContext(token(), () => editType(request(body), context))).status, 409);
});
test("DIRECTOR can read but cannot manage correspondent credentials or catalog", async t => {
  mock(t, prisma.user, "findFirst", async () => account("DIRECTOR"));
  for (const handler of [() => activateCorrespondent(request(), context), () => invite(request()), () => reset(request(), context), () => addType(request()), () => editType(request(), context), () => initializeTypes(), () => createCorrespondent(request())]) assert.equal((await requestContext(token("DIRECTOR"), handler)).status, 403);
});
test("recovery refuses other tenant or inactive correspondent before sending mail", async t => {
  let calls = 0; mock(t, prisma.user, "findFirst", async ({ where }: Args) => {
    calls++; if (calls === 1) return account(); assert.equal(where.tenantId, "tenant-a"); assert.equal(where.role, "CORRESPONDENTE"); assert.equal(where.isActive, true); return null;
  });
  mock(t, globalThis, "fetch", async () => { throw new Error("unexpected external call"); });
  assert.equal((await requestContext(token(), () => reset(request(), { params: Promise.resolve({ id: "foreign" }) }))).status, 404);
});
test("reactivation preserves sessionVersion and missing correspondent cannot be altered", async t => {
  mock(t, prisma.user, "findFirst", async () => account()); let count = 1;
  mock(t, prisma.user, "updateMany", async ({ where, data }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.equal(where.role, "CORRESPONDENTE"); assert.equal(data.isActive, true); assert.equal(data.sessionVersion, undefined); return { count }; });
  const body = { isActive: true, updatedAt: "2026-10-03T00:00:00.000Z" };
  assert.equal((await requestContext(token(), () => activateCorrespondent(request(body), context))).status, 200); count = 0;
  assert.equal((await requestContext(token(), () => activateCorrespondent(request(body), { params: Promise.resolve({ id: "foreign" }) }))).status, 409);
});
test("minimal correspondent page queries exclusively own assignments without CPF or internal notes", async t => {
  mock(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  for (const method of ["findMany", "count", "groupBy"]) mock(t, prisma.documentationFolder, method, async ({ where, select }: Args) => { assert.equal(where.tenantId, "tenant-a"); assert.equal(where.correspondentId, "owner-a"); if (select) assert.equal(select.administrativeObservation, undefined); return method === "count" ? 0 : []; });
  assert.ok(await requestContext(token("CORRESPONDENTE"), () => CorrespondentePage()));
});
