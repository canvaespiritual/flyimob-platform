import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { createSessionToken, verifyPassword } from "../../src/lib/auth.server";
import { correspondentFolders } from "../../src/lib/documentacoes/correspondent-queries.server";
import { correspondentQueues, correspondentStatus, correspondentMessage, maskDocumentationCpf, documentationEventLabels } from "../../src/lib/documentacoes/correspondent-presentation";
import { setCorrespondentInitialPassword } from "../../src/lib/documentacoes/correspondent-credentials.server";
import { POST as definePassword } from "../../src/app/api/documentacoes/correspondentes/[id]/senha-inicial/route";
import { GET as clientDetails } from "../../src/app/api/documentacoes/correspondente/pastas/[id]/route";
import CorrespondentePage from "../../src/app/correspondente/page";

Object.assign(globalThis, { React });
process.env.SESSION_SECRET = "synthetic-correspondent-portal-secret";
const viewer = { user: { id: "corr-a", tenantId: "tenant-a", role: "CORRESPONDENTE" as UserRole }, tenant: { id: "tenant-a", isPlatform: false } };
const owner = { ...viewer, user: { ...viewer.user, id: "owner-a", role: "OWNER" as UserRole } };
type Query = { where: Record<string, unknown>; select?: Record<string, unknown>; data?: Record<string, unknown>; take?: number; skip?: number; orderBy?: unknown };
function listDB() {
  const calls: Query[] = [];
  const rows = [{ id: "folder-a", status: "EM_REANALISE", createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-03"), correspondentMessage: "Profissão e dependentes sintéticos", people: [{ name: "Pessoa sintética", cpf: "52998224725", email: "synthetic@example.test", phone: "11900000000" }], broker: { name: "Corretor sintético" }, rounds: [], _count: { documents: 11, pendingItems: 0 } }];
  const folder = {
    findMany: async (args: Query) => { calls.push(args); return rows; },
    count: async (args: Query) => { calls.push(args); return 41; },
    groupBy: async (args: Query) => { calls.push(args); return [{ status: "EM_REANALISE", _count: { _all: 41 } }]; },
  };
  return { calls, folder, db: { documentationFolder: folder } as unknown as typeof prisma };
}
function mock(t: TestContext, target: object, key: string, replacement: unknown) {
  const record = target as Record<string, unknown>; const original = record[key]; record[key] = replacement;
  t.after(() => { record[key] = original; });
}
const account = (role: UserRole) => ({ ...viewer.user, role, id: role === "OWNER" ? "owner-a" : "corr-a", isActive: true, sessionVersion: 0, name: "Correspondente sintético", email: "corr@example.test", tenant: { ...viewer.tenant, name: "Operação sintética", slug: "synthetic", parentId: null } });
const token = (role: UserRole) => createSessionToken({ uid: role === "OWNER" ? "owner-a" : "corr-a", tid: "tenant-a", role, sv: 0 });
const ctx = { params: Promise.resolve({ id: "corr-a" }) };
const passwordBody = { password: "synthetic-password", confirmPassword: "synthetic-password", updatedAt: "2026-10-03T12:00:00.000Z" };
function credentialRequest(origin = "https://flyimob.test") { return new Request("https://flyimob.test/api/documentacoes/correspondentes/corr-a/senha-inicial", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(passwordBody) }); }

test("correspondent listing keeps tenant/assignment on rows, totals and queues, ignoring forged selectors", async () => {
  const fake = listDB(); const result = await correspondentFolders(viewer, new URLSearchParams("tenantId=foreign&correspondentId=foreign&brokerId=foreign&status=EM_MONTAGEM"), fake.db);
  for (const call of fake.calls) { assert.equal(call.where.tenantId, "tenant-a"); assert.equal(call.where.correspondentId, "corr-a"); assert.equal(call.where.brokerId, undefined); }
  assert.deepEqual(fake.calls[0].orderBy, [{ updatedAt: "desc" }, { id: "desc" }]);
  assert.equal(fake.calls[0].take, 20); assert.equal(fake.calls[0].skip, 0);
  assert.equal(result.items[0].people[0].email, "synthetic@example.test"); assert.equal(result.items[0].people[0].phone, "11900000000"); assert.equal(result.items[0].correspondentMessage, "Profissão e dependentes sintéticos"); assert.equal(fake.calls[0].select?.administrativeObservation, undefined);
  assert.equal(result.total, 41); assert.equal(result.items[0].people[0].cpfDisplay, "529.982.247-25");
  const serialized = JSON.stringify(result); assert.equal(serialized.includes("52998224725"), false); assert.equal(serialized.includes("storageKey"), false);
});
test("name search is insensitive and CPF search strips punctuation within the same scope", async () => {
  for (const [query, expected] of [["Laura Silva", "Laura Silva"], ["529.982.247-25", "52998224725"]]) {
    const fake = listDB(); await correspondentFolders(viewer, new URLSearchParams({ q: query }), fake.db);
    const people = fake.calls[0].where.people as { some: { tenantId: string; OR: { name?: { contains: string; mode: string }; cpf?: { contains: string } }[] } };
    assert.equal(people.some.tenantId, "tenant-a");
    assert.equal(people.some.OR[0].name?.contains, query); assert.equal(people.some.OR[0].name?.mode, "insensitive");
    assert.equal(people.some.OR[1].cpf?.contains, expected);
    assert.deepEqual(fake.calls[0].where, fake.calls[1].where);
  }
});
test("period includes Sao Paulo calendar days and page three fetches only twenty rows", async () => {
  const fake = listDB(); const result = await correspondentFolders(viewer, new URLSearchParams("from=2026-10-01&to=2026-10-03&page=3"), fake.db);
  assert.deepEqual(fake.calls[0].where.createdAt, { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-10-04T03:00:00Z") });
  assert.equal(fake.calls[0].skip, 40); assert.equal(fake.calls[0].take, 20); assert.equal(result.page, 3);
});
for (const queue of correspondentQueues) test("queue " + queue.value + " uses existing states and preserves search in counts", async () => {
  const fake = listDB(); await correspondentFolders(viewer, new URLSearchParams({ queue: queue.value, q: "Pessoa" }), fake.db);
  assert.deepEqual(fake.calls[0].where.status, { in: queue.statuses });
  assert.deepEqual(fake.calls[0].where, fake.calls[1].where);
  assert.equal(fake.calls[2].where.status, undefined); assert.deepEqual(fake.calls[2].where.people, fake.calls[0].where.people);
});
test("invalid filters, page, role, platform and mismatched tenant never query data", async () => {
  for (const params of ["queue=foreign", "page=0", "page=1.5", "from=2026-10-04&to=2026-10-01", "q=" + "a".repeat(161)]) {
    const fake = listDB(); await assert.rejects(correspondentFolders(viewer, new URLSearchParams(params), fake.db)); assert.equal(fake.calls.length, 0);
  }
  for (const denied of [owner, { ...viewer, tenant: { ...viewer.tenant, isPlatform: true } }, { ...viewer, user: { ...viewer.user, tenantId: "foreign" } }]) {
    const fake = listDB(); await assert.rejects(correspondentFolders(denied, new URLSearchParams(), fake.db)); assert.equal(fake.calls.length, 0);
  }
});
test("CTAs distinguish first review, current work, corrected documents and concluded analyses", () => {
  for (const [status, action] of [["AGUARDANDO_CORRESPONDENTE", "Analisar"], ["EM_ANALISE", "Continuar análise"], ["EM_REANALISE", "Reanalisar"], ["PENDENCIA_DOCUMENTAL", "Consultar pendências"], ["APROVADO", "Consultar análise"], ["CONDICIONADO", "Consultar análise"], ["REPROVADO", "Consultar análise"]]) assert.equal(correspondentStatus(status).action, action);
  assert.equal(maskDocumentationCpf(null), "Não informado");
  assert.equal(documentationEventLabels.DOCUMENT_REVIEW_STARTED, "Análise iniciada");
  assert.equal(documentationEventLabels.DOCUMENT_REVIEW_RESUBMITTED, "Documentação corrigida reenviada");
  assert.equal(documentationEventLabels.DOCUMENT_REVIEW_APPROVED, "Documentação aprovada");
});
test("message uses real folder data and explicitly supplied initial password only in that interaction", () => {
  const input = { clientName: "Pessoa sintética", documentCount: 11, email: "corr@example.test", origin: "https://flyimob.com/admin/documentacoes" };
  const initial = correspondentMessage({ ...input, password: "synthetic-password" });
  for (const expected of ["Pessoa sintética", "11", "https://flyimob.com/correspondente", "Login: corr@example.test", "Senha inicial: synthetic-password", "Para analisar"]) assert.ok(initial.includes(expected));
  const later = correspondentMessage({ ...input, reanalysis: true }); assert.ok(later.includes("Correções")); assert.equal(later.includes("synthetic-password"), false); assert.ok(later.includes("Use sua senha de acesso."));
});
test("initial password persists scrypt hash only, revokes old sessions and never returns credentials", async () => {
  let query: Query | undefined;
  const db = { user: { updateMany: async (args: Query) => { query = args; return { count: 1 }; } } } as unknown as typeof prisma;
  const result = await setCorrespondentInitialPassword(owner, "corr-a", passwordBody, db);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(query!.where, { id: "corr-a", tenantId: "tenant-a", role: "CORRESPONDENTE", isActive: true, updatedAt: new Date(passwordBody.updatedAt) });
  assert.deepEqual(Object.keys(query!.data!).sort(), ["passwordHash", "sessionVersion"]);
  const hash = query!.data!.passwordHash as string; assert.notEqual(hash, passwordBody.password); assert.ok(await verifyPassword(passwordBody.password, hash));
  assert.equal(JSON.stringify(query).includes(passwordBody.password), false);
  assert.deepEqual(query!.data!.sessionVersion, { increment: 1 });
});
test("credentials require OWNER, exact confirmation, bounded password and optimistic target version", async () => {
  let writes = 0; const db = { user: { updateMany: async () => { writes++; return { count: 0 }; } } } as unknown as typeof prisma;
  for (const denied of [viewer, { ...owner, user: { ...owner.user, role: "DIRECTOR" as const } }, { ...owner, tenant: { ...owner.tenant, isPlatform: true } }, { ...owner, user: { ...owner.user, tenantId: "foreign" } }]) await assert.rejects(setCorrespondentInitialPassword(denied, "corr-a", passwordBody, db));
  for (const body of [{ ...passwordBody, password: "short", confirmPassword: "short" }, { ...passwordBody, confirmPassword: "different" }, { ...passwordBody, password: "a".repeat(257), confirmPassword: "a".repeat(257) }, { ...passwordBody, updatedAt: "invalid" }]) await assert.rejects(setCorrespondentInitialPassword(owner, "corr-a", body, db));
  assert.equal(writes, 0); await assert.rejects(setCorrespondentInitialPassword(owner, "foreign", passwordBody, db), /ausente, inativo ou atualizado/); assert.equal(writes, 1);
});
test("credential route rejects anonymous, correspondent, director and external Origin before writing", async t => {
  const previous = process.env.APP_URL; process.env.APP_URL = "https://flyimob.test"; t.after(() => { if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous; });
  let writes = 0; mock(t, prisma.user, "updateMany", async () => { writes++; return { count: 1 }; });
  assert.equal((await requestContext(undefined, () => definePassword(credentialRequest(), ctx))).status, 401);
  for (const role of ["CORRESPONDENTE", "DIRECTOR"] as UserRole[]) {
    mock(t, prisma.user, "findFirst", async () => account(role));
    assert.equal((await requestContext(token(role), () => definePassword(credentialRequest(), ctx))).status, 403);
  }
  mock(t, prisma.user, "findFirst", async () => account("OWNER"));
  assert.equal((await requestContext(token("OWNER"), () => definePassword(credentialRequest("https://external.test"), ctx))).status, 403);
  assert.equal(writes, 0);
  const response = await requestContext(token("OWNER"), () => definePassword(credentialRequest(), ctx));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true }); assert.match(response.headers.get("cache-control")!, /no-store/); assert.equal(writes, 1);
});
test("client timeline enforces assignment before reading events and masks CPF at the server", async t => {
  mock(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  let visible = true; let eventsRead = 0;
  mock(t, prisma.documentationFolder, "findFirst", async (args: Query) => {
    assert.deepEqual(args.where, { id: "folder-a", tenantId: "tenant-a", correspondentId: "corr-a" });
    return visible ? { id: "folder-a", status: "EM_ANALISE", broker: { name: "Synthetic" }, people: [{ id: "person-a", name: "Pessoa", cpf: "52998224725", relationship: "TITULAR" }], rounds: [{ id: "round-a" }] } : null;
  });
  mock(t, prisma.documentationEvent, "findMany", async (args: Query) => {
    eventsRead++; assert.deepEqual(args.where, { tenantId: "tenant-a", folderId: "folder-a" }); assert.equal(args.take, 20); assert.equal(args.skip, 20);
    assert.deepEqual(args.select, { id: true, eventType: true, createdAt: true, actor: { select: { name: true } } });
    return [{ id: "event-a", eventType: "DOCUMENT_REVIEW_STARTED", createdAt: new Date(), actor: { name: "Synthetic" } }];
  });
  mock(t, prisma.documentationEvent, "count", async () => 21);
  const request = new Request("https://flyimob.test/api/client?page=2"); const context = { params: Promise.resolve({ id: "folder-a" }) };
  const response = await requestContext(token("CORRESPONDENTE"), () => clientDetails(request, context));
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.folder.people[0].cpf, undefined); assert.equal(result.folder.people[0].cpfDisplay, "529.982.247-25"); assert.equal(result.eventCount, 21);
  visible = false; assert.equal((await requestContext(token("CORRESPONDENTE"), () => clientDetails(request, context))).status, 404); assert.equal(eventsRead, 1);
  assert.equal((await requestContext(undefined, () => clientDetails(request, context))).status, 401);
  mock(t, prisma.user, "findFirst", async () => account("OWNER"));
  assert.equal((await requestContext(token("OWNER"), () => clientDetails(request, context))).status, 403);
});
test("home renders task links, masked CPF and pagination preserving active search", async t => {
  const fake = listDB(); mock(t, prisma.user, "findFirst", async () => account("CORRESPONDENTE"));
  for (const key of ["findMany", "count", "groupBy"] as const) mock(t, prisma.documentationFolder, key, fake.folder[key]);
  const page = await requestContext(token("CORRESPONDENTE"), () => CorrespondentePage({ searchParams: Promise.resolve({ q: "Pessoa", queue: "issues", page: "2" }) }));
  const html = renderToStaticMarkup(page);
  for (const expected of ["Seus clientes", "Buscar cliente", "Nome ou CPF", "529.982.247-25", "Ver e baixar documentos", "Reanalisar", "tab=pendencias", "Próxima", "page=3", "queue=issues", "q=Pessoa"]) assert.ok(html.includes(expected), expected);
  assert.equal(html.includes("52998224725"), false); assert.equal(html.includes("Abrir pasta"), false); assert.equal(html.includes("Rodada"), false);
});
