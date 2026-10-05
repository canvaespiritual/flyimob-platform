import { requestContext } from "../documentacoes/request-context";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { prisma } from "../../src/lib/prisma";
import { canActAsSalesResponsible } from "../../src/lib/team/policy";
import { updateCampaign } from "../../src/lib/marketing/admin.server";
import { options } from "../../src/lib/marketing/queries.server";
import { createFolder, updateFolder } from "../../src/lib/documentacoes/folders.server";
import { documentationFolderScope } from "../../src/lib/documentacoes/access-policy";
import { folderFilters } from "../../src/lib/documentacoes/queries.server";
import { GET as documentationOptions } from "../../src/app/api/documentacoes/opcoes/route";
import { createSessionToken } from "../../src/lib/auth.server";

const owner = { user: { id: "owner", tenantId: "operation-a", role: "OWNER" as const }, tenant: { id: "operation-a", isPlatform: false } };
const holder = { name: "Synthetic holder", cpf: "52998224725", phone: "11900000000", relationship: "TITULAR" };
type Row = Record<string, unknown>;
function fixture(role: string, active = true, foreign = false) {
  const person = { id: "responsible", name: "Synthetic responsible", operationalRole: role, active, mergedIntoId: null, independent: true, user: null, financialParticipant: null };
  const assignments: Row[] = [], folders: Row[] = [], events: Row[] = [];
  const tx = {
    operationPerson: {
      findFirst: async ({ where }: { where: Row }) => { assert.equal(where.tenantId, owner.tenant.id); return foreign ? null : person; },
      findMany: async ({ where }: { where: Row }) => { assert.equal(where.tenantId, owner.tenant.id); return [person]; },
    },
    user: { findFirst: async () => null }, metaAdAccount: { findMany: async () => [] },
    marketingCampaign: { findFirst: async () => ({ id: "campaign" }), updateMany: async () => ({ count: 1 }) },
    campaignBrokerAssignment: { findFirst: async () => null, create: async ({ data }: { data: Row }) => { assignments.push(data); } },
    marketingAuditEvent: { create: async () => ({}) },
    documentationFolder: {
      findFirst: async () => ({ id: "folder", status: "EM_MONTAGEM", responsiblePersonId: person.id, brokerId: null }),
      updateMany: async () => ({ count: 1 }), update: async ({ data }: { data: Row }) => { folders.push(data); },
      create: async ({ data }: { data: Row }) => { folders.push(data); return { id: "folder", version: 0 }; },
    },
    documentationDocumentType: { createMany: async () => ({ count: 20 }) },
    documentationEvent: { create: async ({ data }: { data: Row }) => { events.push(data); } },
  };
  const db = { ...tx, $transaction: async (run: (tx: unknown) => unknown) => run(tx) } as unknown as typeof prisma;
  return { db, person, assignments, folders, events };
}
for (const role of ["BROKER", "MANAGER", "DIRECTOR", "DIRECTION"]) {
  test(`${role} without login is selectable and can own campaigns and documentation without role conversion`, async () => {
    const f = fixture(role);
    assert.equal(canActAsSalesResponsible(f.person), true);
    assert.equal((await options(owner, f.db)).brokers[0].isActive, true);
    await updateCampaign(owner, "campaign", { version: 0, assignment: { personId: f.person.id, validFrom: "2026-10-05" } }, f.db);
    await createFolder(owner, { responsiblePersonId: f.person.id, holder }, f.db);
    assert.equal(f.assignments[0].personId, f.person.id);
    assert.equal(f.folders[0].responsiblePersonId, f.person.id);
    assert.equal(f.assignments[0].brokerId, null); assert.equal(f.folders[0].brokerId, null);
    assert.equal(f.person.operationalRole, role); assert.equal(f.person.user, null);
  });
}
for (const role of ["OTHER", "PARTNER", "ADMINISTRATIVE"]) {
  test(`${role} is excluded from new commercial responsibilities in both modules`, async () => {
    const f = fixture(role);
    assert.equal(canActAsSalesResponsible(f.person), false);
    assert.equal((await options(owner, f.db)).brokers[0].isActive, false);
    await assert.rejects(updateCampaign(owner, "campaign", { version: 0, assignment: { personId: f.person.id, validFrom: "2026-10-05" } }, f.db));
    await assert.rejects(createFolder(owner, { responsiblePersonId: f.person.id, holder }, f.db));
    assert.equal(f.assignments.length + f.folders.length, 0);
  });
}
test("inactive people cannot receive new links but retain existing responsibility and can edit unrelated folder fields", async () => {
  const f = fixture("DIRECTOR", false);
  assert.equal((await options(owner, f.db)).brokers[0].isActive, false);
  await assert.rejects(createFolder(owner, { responsiblePersonId: f.person.id, holder }, f.db));
  await assert.rejects(updateCampaign(owner, "campaign", { version: 0, assignment: { personId: f.person.id, validFrom: "2026-10-05" } }, f.db));
  await updateFolder(owner, "folder", { version: 0, administrativeObservation: "New observation" }, f.db);
  assert.equal(f.folders[0].responsiblePersonId, f.person.id);
  assert.equal(f.events.some(e => e.eventType === "BROKER_ASSIGNED"), false);
});
test("later function changes preserve stored campaign and documentation responsibility", async () => {
  const f = fixture("MANAGER");
  await updateCampaign(owner, "campaign", { version: 0, assignment: { personId: f.person.id, validFrom: "2026-10-05" } }, f.db);
  await createFolder(owner, { responsiblePersonId: f.person.id, holder }, f.db);
  f.person.operationalRole = "OTHER"; f.person.active = false;
  await updateFolder(owner, "folder", { version: 0, administrativeObservation: "Historical edit" }, f.db);
  assert.equal(f.assignments[0].personId, f.person.id);
  assert.ok(f.folders.every(folder => folder.responsiblePersonId === f.person.id));
});
test("both modules reject a commercially eligible person from another operation", async () => {
  const f = fixture("DIRECTOR", true, true);
  await assert.rejects(createFolder(owner, { responsiblePersonId: f.person.id, holder }, f.db));
  await assert.rejects(updateCampaign(owner, "campaign", { version: 0, assignment: { personId: f.person.id, validFrom: "2026-10-05" } }, f.db));
});
test("commercial eligibility and authenticated scope are independent; later login resolves ownership through person", () => {
  assert.deepEqual(documentationFolderScope({ ...owner, user: { ...owner.user, role: "MANAGER" } }), { tenantId: "operation-a", id: { in: [] } });
  assert.deepEqual(documentationFolderScope({ ...owner, user: { ...owner.user, role: "BROKER" } }), {
    tenantId: "operation-a", OR: [{ responsiblePerson: { user: { id: "owner" } } }, { responsiblePersonId: null, brokerId: "owner" }],
  });
  assert.equal(canActAsSalesResponsible({ active: true, operationalRole: "DIRECTOR", mergedIntoId: "other" }), false);
  assert.deepEqual(folderFilters("operation-a", new URLSearchParams("responsiblePersonId=historical")), { tenantId: "operation-a", responsiblePersonId: "historical" });
});
test("Marketing and documentation consume the canonical policy, and additive migration preserves legacy data", () => {
  for (const path of ["src/lib/marketing/admin.server.ts", "src/lib/documentacoes/folders.server.ts", "src/app/api/documentacoes/opcoes/route.ts", "src/lib/marketing/queries.server.ts"]) {
    assert.match(readFileSync(path, "utf8"), /canActAsSalesResponsible/);
  }
  const sql = readFileSync("prisma/migrations/20261005130000_commercial_responsibility/migration.sql", "utf8");
  assert.equal(/DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM/i.test(sql), false);
  assert.ok(sql.includes('f."tenantId" = u."tenantId" AND f."brokerId" = u."id"'));
  assert.ok(sql.includes('UPDATE "DocumentationFolder" SET "responsiblePersonId" = target_person'));
});
test("documentation selector lists the four active commercial roles without login, retaining historical options only on request", async t => {
  process.env.SESSION_SECRET = "synthetic-commercial-test-session";
  const originalUser = prisma.user.findFirst, originalPeople = prisma.operationPerson.findMany;
  t.after(() => { prisma.user.findFirst = originalUser; prisma.operationPerson.findMany = originalPeople; });
  prisma.user.findFirst = (async () => ({ ...owner.user, isActive: true, sessionVersion: 0, tenant: owner.tenant })) as unknown as typeof originalUser;
  const rows = ["BROKER", "MANAGER", "DIRECTOR", "DIRECTION", "OTHER", "ADMINISTRATIVE", "PARTNER"].map(role => fixture(role).person);
  rows.push({ ...fixture("DIRECTOR", false).person, id: "inactive" });
  prisma.operationPerson.findMany = (async ({ where }: { where: Row }) => { assert.equal(where.tenantId, owner.tenant.id); return rows; }) as unknown as typeof originalPeople;
  const token = createSessionToken({ uid: owner.user.id, tid: owner.tenant.id, role: "OWNER", sv: 0 });
  const result = await requestContext(token, () => documentationOptions(new Request("https://flyimob.test/api/documentacoes/opcoes?kind=broker")));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).items.length, 4);
  const history = await requestContext(token, () => documentationOptions(new Request("https://flyimob.test/api/documentacoes/opcoes?kind=broker&history=1")));
  assert.equal((await history.json()).items.length, 8);
});
