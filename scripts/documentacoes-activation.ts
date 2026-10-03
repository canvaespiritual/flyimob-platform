import { loadDocumentationEnv } from "./documentacoes-env.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { createFolder, updateFolder, mutatePerson, ensureCatalog } from "../src/lib/documentacoes/folders.server";
import { canManageDocumentation, documentationFolderScope } from "../src/lib/documentacoes/access-policy";
import { hashPassword, verifyPassword } from "../src/lib/auth.server";
import { DocumentationError } from "../src/lib/documentacoes/validation";
import { requestContext } from "../tests/documentacoes/request-context";
import { createSessionToken } from "../src/lib/auth.server";
loadDocumentationEnv();
const tenantId = "cmjjziyt30004wjwkr45f3vgf";
const mode = process.argv[2];
const marker = `TESTE DOCUMENTACOES ${randomUUID()}`;
const rollback = new Error("CONTROLLED_DOCUMENTATION_ROLLBACK");
const results: string[] = [];
async function inspect() {
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const sql = readFileSync("prisma/migrations/20261003000000_documentation_foundation/migration.sql", "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1]);
    const existing = await tx.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'Documentation%'`;
    assert.deepEqual(existing.map(row => row.table_name).sort(), [...tables].sort()); assert.equal(tables.length, 11);
    const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(match => match[1]);
    const actualIndexes = await tx.$queryRaw<{ name: string; valid: boolean }[]>`SELECT c.relname AS name,i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`;
    for (const name of indexes) assert.ok(actualIndexes.some(row => row.name === name && row.valid), `missing index ${name}`);
    const constraints = [...sql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)].map(match => match[1]);
    const actualConstraints = await tx.$queryRaw<{ name: string; valid: boolean; type: string; definition: string }[]>`SELECT conname AS name,convalidated AS valid,contype::text AS type,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace`;
    for (const name of constraints) assert.ok(actualConstraints.some(row => row.name === name && row.valid), `missing constraint ${name}`);
    for (const match of sql.matchAll(/ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "([^"]+)"\(([^)]+)\) ON DELETE RESTRICT ON UPDATE CASCADE/g)) {
      const row = actualConstraints.find(item => item.name === match[1])!;
      const normalize = (value: string) => value.replace(/["\s]/g, "");
      assert.ok(normalize(row.definition).includes(normalize(`FOREIGN KEY (${match[2]}) REFERENCES ${match[3]}(${match[4]})`)));
      assert.match(row.definition, /ON UPDATE CASCADE ON DELETE RESTRICT/);
    }
    for (const match of sql.matchAll(/CREATE TYPE "([^"]+)" AS ENUM \(([^)]+)\)/g)) {
      const values = await tx.$queryRaw<{ enumlabel: string }[]>`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid WHERE typname=${match[1]} ORDER BY enumsortorder`;
      assert.deepEqual(values.map(row => row.enumlabel), [...match[2].matchAll(/'([^']+)'/g)].map(item => item[1]));
    }
    const partial = await tx.$queryRaw<{ definition: string }[]>`SELECT indexdef AS definition FROM pg_indexes WHERE schemaname='public' AND indexname='DocumentationPerson_one_titular_per_folder'`;
    assert.match(partial[0].definition, /WHERE.*TITULAR/);
    const money = await tx.$queryRaw<{ numeric_precision: number; numeric_scale: number }[]>`SELECT numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='DocumentationAnalysis' AND data_type='numeric'`;
    assert.equal(money.length, 6); assert.ok(money.every(row => row.numeric_precision === 18 && row.numeric_scale === 2));
    const version = await tx.$queryRaw<{ column_default: string; is_nullable: string }[]>`SELECT column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='sessionVersion'`;
    assert.equal(version[0].column_default, "0"); assert.equal(version[0].is_nullable, "NO");
    assert.equal(await tx.user.count({ where: { sessionVersion: { not: 0 } } }), 0);
    const roles = await tx.$queryRaw<{ enumlabel: string }[]>`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid WHERE typname='UserRole' ORDER BY enumsortorder`;
    assert.deepEqual(roles.map(row => row.enumlabel).sort(), ["OWNER", "MANAGER", "BROKER", "DATA_ENTRY", "DIRECTOR", "CORRESPONDENTE"].sort());
    const trigger = await tx.$queryRaw<{ enabled: string; definition: string }[]>`SELECT t.tgenabled::text AS enabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='DocumentationEvent' AND NOT t.tgisinternal`;
    assert.ok(trigger.some(row => row.enabled === "O" && /BEFORE DELETE OR UPDATE|BEFORE UPDATE OR DELETE/.test(row.definition)));
    const pending = await tx.$queryRaw<{ finished_at: Date | null }[]>`SELECT finished_at FROM "_prisma_migrations" WHERE migration_name='20261003000000_documentation_foundation' AND rolled_back_at IS NULL`;
    assert.ok(pending[0].finished_at);
    console.log(JSON.stringify({ tables: tables.length, indexes: indexes.length, constraints: constraints.length, decimalColumns: money.length, allExistingSessionVersionsZero: true, existingRolesPreserved: true, triggerEnabled: true }));
  });
}
async function seed() {
  await prisma.$transaction(async tx => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true, isPlatform: true } });
    assert.equal(tenant.slug, "fly-imob-brasilia"); assert.equal(tenant.isPlatform, false);
    const first = await ensureCatalog(tx, tenantId); const firstTotal = await tx.documentationDocumentType.count({ where: { tenantId } });
    const second = await ensureCatalog(tx, tenantId); const secondTotal = await tx.documentationDocumentType.count({ where: { tenantId } });
    assert.equal(firstTotal, 20); assert.equal(secondTotal, 20); assert.equal(second.count, 0);
    assert.equal(await tx.documentationDocumentType.count({ where: { tenantId, defaultRequired: true } }), 0);
    console.log(JSON.stringify({ tenant: tenant.slug, firstInserted: first.count, firstTotal, secondInserted: second.count, secondTotal }));
  });
}
async function smoke() {
  const ids: { tenant?: string; users: string[]; folders: string[] } = { users: [], folders: [] };
  try {
    await prisma.$transaction(async tx => {
      let serial = 0;
      async function savepoint<T>(callback: () => Promise<T>) {
        const name = `documentation_smoke_${++serial}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const value = await callback(); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return value; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      }
      const db = { $transaction: (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => savepoint(() => callback(tx)) } as unknown as typeof prisma;
      const owner = await tx.user.findFirstOrThrow({ where: { tenantId, role: "OWNER", isActive: true }, select: { id: true } });
      const broker = await tx.user.findFirstOrThrow({ where: { tenantId, role: "BROKER", isActive: true }, select: { id: true } });
      const viewer = { user: { id: owner.id, tenantId, role: "OWNER" as const }, tenant: { id: tenantId, isPlatform: false } };
      const other = await tx.tenant.create({ data: { name: marker, slug: `documentation-smoke-${randomUUID()}` } }); ids.tenant = other.id;
      const password = `Synthetic-${randomUUID()}`; const passwordHash = await hashPassword(password);
      async function user(tid: string, role: "BROKER" | "CORRESPONDENTE") { const row = await tx.user.create({ data: { tenantId: tid, role, name: marker, email: `documentation-smoke-${randomUUID()}@example.invalid`, passwordHash } }); ids.users.push(row.id); return row; }
      const correspondent = await user(tenantId, "CORRESPONDENTE"); const replacement = await user(tenantId, "CORRESPONDENTE");
      const foreignBroker = await user(other.id, "BROKER"); const foreignCorrespondent = await user(other.id, "CORRESPONDENTE");
      assert.ok(await verifyPassword(password, correspondent.passwordHash!));
      const builder = await tx.construtora.create({ data: { tenantId: other.id, name: marker } });
      const property = await tx.empreendimento.create({ data: { tenantId: other.id, name: marker, slug: `documentation-smoke-${randomUUID()}`, construtoraId: builder.id } });
      const holder = { name: marker, cpf: "52998224725", phone: "00000000000", email: "synthetic@example.invalid" };
      const folder = await createFolder(viewer, { holder, brokerId: broker.id, correspondentId: correspondent.id }, db); ids.folders.push(folder.id);
      const initial = await tx.documentationFolder.findUniqueOrThrow({ where: { id: folder.id }, include: { people: true } });
      assert.equal(initial.tenantId, tenantId); assert.equal(initial.status, "EM_MONTAGEM"); assert.equal(initial.version, 0); assert.equal(initial.people.length, 1); assert.equal(initial.people[0].tenantId, tenantId);
      results.push("folder_creation");
      let version = 0;
      for (const relationship of ["CONJUGE", "FIADOR", "FIADOR"]) { await mutatePerson(viewer, folder.id, null, "POST", { name: marker, relationship, version }, db); version++; }
      assert.equal(await tx.documentationPerson.count({ where: { folderId: folder.id, relationship: "FIADOR" } }), 2);
      await assert.rejects(mutatePerson(viewer, folder.id, null, "POST", { ...holder, relationship: "TITULAR", version }, db), /já possui/);
      await assert.rejects(savepoint(() => tx.documentationPerson.create({ data: { tenantId, folderId: folder.id, ...holder, relationship: "TITULAR" } })), error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
      await assert.rejects(mutatePerson(viewer, folder.id, initial.people[0].id, "DELETE", { version }, db), /não pode ser removido/);
      const spouse = await tx.documentationPerson.findFirstOrThrow({ where: { folderId: folder.id, relationship: "CONJUGE" } });
      await mutatePerson(viewer, folder.id, spouse.id, "PATCH", { name: `${marker} EDITADO`, relationship: "CONJUGE", version }, db); version++;
      await mutatePerson(viewer, folder.id, spouse.id, "DELETE", { version }, db); version++;
      results.push("people_multiple_relationships_holder_protection_edit_remove");
      await updateFolder(viewer, folder.id, { version, correspondentId: replacement.id, administrativeObservation: "SYNTHETIC PRIVATE OBSERVATION" }, db); version++;
      await assert.rejects(updateFolder(viewer, folder.id, { version: version - 1, administrativeObservation: "STALE" }, db), error => error instanceof DocumentationError && error.status === 409);
      const latest = await tx.documentationFolder.findUniqueOrThrow({ where: { id: folder.id } }); assert.equal(latest.version, version); assert.equal(latest.administrativeObservation, "SYNTHETIC PRIVATE OBSERVATION");
      results.push("optimistic_locking_409");
      const corrViewer = { user: { id: replacement.id, tenantId, role: "CORRESPONDENTE" as const }, tenant: viewer.tenant };
      assert.equal(canManageDocumentation(corrViewer), false);
      await assert.rejects(updateFolder(corrViewer, folder.id, { version }, db), error => error instanceof DocumentationError && error.status === 403);
      assert.equal(await tx.documentationFolder.count({ where: { tenantId, correspondentId: replacement.id } }), 1);
      assert.equal(await tx.documentationFolder.count({ where: { tenantId, correspondentId: correspondent.id } }), 0);
      assert.equal(await tx.documentationFolder.count({ where: { id: folder.id, ...documentationFolderScope(corrViewer) } }), 0);
      results.push("correspondent_hash_assignments_admin_and_analysis_denial");
      const foreignViewer = { user: { id: foreignBroker.id, tenantId: other.id, role: "OWNER" as const }, tenant: { id: other.id, isPlatform: false } };
      await assert.rejects(updateFolder(foreignViewer, folder.id, { version }, db), error => error instanceof DocumentationError && error.status === 404);
      for (const refs of [{ brokerId: foreignBroker.id }, { correspondentId: foreignCorrespondent.id }, { construtoraId: builder.id }, { empreendimentoId: property.id }]) await assert.rejects(createFolder(viewer, { holder, brokerId: broker.id, ...refs }, db));
      const foreignFolder = await createFolder(foreignViewer, { holder, brokerId: foreignBroker.id }, db); ids.folders.push(foreignFolder.id);
      const foreignPerson = await tx.documentationPerson.findFirstOrThrow({ where: { folderId: foreignFolder.id } });
      await assert.rejects(mutatePerson(viewer, folder.id, foreignPerson.id, "PATCH", { name: marker, relationship: "FIADOR", version }, db), error => error instanceof DocumentationError && error.status === 404);
      await assert.rejects(savepoint(() => tx.documentationDocument.create({ data: { tenantId, folderId: folder.id, personId: foreignPerson.id, uploadedById: owner.id, uploadedByRole: "OWNER", uploadOrigin: "ADMINISTRATION", originalFileName: "NO ACTUAL FILE", storageKey: marker, mimeType: "application/pdf", fileSize: 0 } })), error => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003");
      results.push("tenant_resource_and_database_fk_isolation");
      const events = await tx.documentationEvent.findMany({ where: { folderId: folder.id } });
      for (const name of ["FOLDER_CREATED", "FOLDER_UPDATED", "BROKER_ASSIGNED", "CORRESPONDENT_ASSIGNED", "CORRESPONDENT_CHANGED", "PERSON_ADDED", "PERSON_UPDATED", "PERSON_REMOVED"]) assert.ok(events.some(event => event.eventType === name), name);
      const metadata = JSON.stringify(events.map(event => event.metadata)); for (const forbidden of [holder.cpf, holder.phone, holder.email, marker, password, passwordHash, "SYNTHETIC PRIVATE OBSERVATION"]) assert.equal(metadata.includes(forbidden), false);
      await assert.rejects(savepoint(() => tx.documentationEvent.update({ where: { id: events[0].id }, data: { eventType: "FORBIDDEN" } })), /append-only/);
      await assert.rejects(savepoint(() => tx.documentationEvent.delete({ where: { id: events[0].id } })), /append-only/);
      results.push("timeline_all_events_safe_metadata_insert_update_delete_trigger");
      const type = await tx.documentationDocumentType.findFirstOrThrow({ where: { tenantId } });
      await tx.documentationDocumentType.update({ where: { id: type.id }, data: { name: marker, sortOrder: 99, isActive: false } });
      assert.equal((await tx.documentationDocumentType.findUniqueOrThrow({ where: { id: type.id } })).isActive, false);
      await tx.documentationDocumentType.update({ where: { id: type.id }, data: { isActive: true } });
      assert.equal(await tx.documentationDocumentType.count({ where: { tenantId } }), 20);
      results.push("configuration_edit_reorder_deactivate_activate");
      throw rollback;
    }, { maxWait: 10000, timeout: 120000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await prisma.user.count({ where: { id: { in: ids.users } } }), 0);
  assert.equal(await prisma.documentationFolder.count({ where: { id: { in: ids.folders } } }), 0);
  assert.equal(await prisma.tenant.count({ where: { id: ids.tenant } }), 0);
  assert.equal(await prisma.documentationPerson.count({ where: { name: { startsWith: marker } } }), 0);
  assert.equal(await prisma.documentationDocumentType.count({ where: { name: marker } }), 0);
  console.log(JSON.stringify({ results, rollbackConfirmed: true, syntheticRecordsRemaining: 0 }));
}
async function main() {
  if (mode === "--inspect") await inspect(); else if (mode === "--seed") await seed(); else if (mode === "--smoke") await smoke(); else if (mode === "--queries") await queries(); else throw new Error("Choose explicit --inspect, --seed, --smoke or --queries; no implicit production writes.");
}
async function queries() {
  const owner = await prisma.user.findFirstOrThrow({ where: { tenantId, role: "OWNER", isActive: true }, select: { id: true, role: true, sessionVersion: true } });
  const sessionToken = createSessionToken({ uid: owner.id, tid: tenantId, role: owner.role, sv: owner.sessionVersion });
  const { getSessionUser } = await import("../src/lib/session.server");
  const legacyToken = createSessionToken({ uid: owner.id, tid: tenantId, role: owner.role });
  assert.ok(await requestContext(legacyToken, getSessionUser));
  const { GET: folders } = await import("../src/app/api/documentacoes/pastas/route");
  const { GET: correspondents } = await import("../src/app/api/documentacoes/correspondentes/route");
  const { GET: types } = await import("../src/app/api/documentacoes/tipos/route");
  const { GET: options } = await import("../src/app/api/documentacoes/opcoes/route");
  const { GET: detail } = await import("../src/app/api/documentacoes/pastas/[id]/route");
  const checked: string[] = [];
  for (const [name, handler] of [
    ["overview_and_folders", () => folders(new Request("https://local.test/api/documentacoes/pastas?from=2026-10-01&to=2026-10-31"))],
    ["folder_filters", () => folders(new Request("https://local.test/api/documentacoes/pastas?q=TESTE&status=EM_MONTAGEM&page=1"))],
    ["correspondents", () => correspondents(new Request("https://local.test/api/documentacoes/correspondentes"))],
    ["configuration", () => types()],
    ...["broker", "correspondent", "crm", "builder", "property"].map(kind => [`form_options_${kind}`, () => options(new Request(`https://local.test/api/documentacoes/opcoes?kind=${kind}`))] as const),
  ] as const) {
    const response = await requestContext(sessionToken, handler); assert.equal(response.status, 200, name); await response.json(); checked.push(name);
  }
  assert.equal((await requestContext(sessionToken, () => detail(new Request("https://local.test/api/documentacoes/pastas/nonexistent"), { params: Promise.resolve({ id: "synthetic-nonexistent" }) })) ).status, 404);
  assert.equal((await requestContext(undefined, () => types())).status, 401);
  console.log(JSON.stringify({ authenticatedHandlers: checked, nonexistentFolder404: true, anonymous401: true, browserLoginPerformed: false, emailsSent: 0 }));
}
main().catch(error => { console.error(error instanceof DocumentationError ? `Validation failed: status ${error.status}` : error instanceof Prisma.PrismaClientKnownRequestError ? `Validation failed: Prisma ${error.code}` : error instanceof assert.AssertionError ? `Assertion failed: ${error.message}` : "Activation validation failed; transaction aborted."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
