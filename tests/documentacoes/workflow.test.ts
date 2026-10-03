import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../src/lib/prisma";
import { workflowMutation, workflowView, type WorkflowAction } from "../../src/lib/documentacoes/workflow.server";
import { DocumentationError } from "../../src/lib/documentacoes/validation";
import type { DocumentationViewer } from "../../src/lib/documentacoes/access-policy";
import { GET, POST } from "../../src/app/api/documentacoes/pastas/[id]/workflow/route";
type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row; orderBy?: Row; include?: Row };
const owner: DocumentationViewer = { user: { id: "o", tenantId: "t", role: "OWNER" }, tenant: { id: "t", isPlatform: false } };
const correspondent: DocumentationViewer = { ...owner, user: { id: "c", tenantId: "t", role: "CORRESPONDENTE" } };
const broker: DocumentationViewer = { ...owner, user: { id: "b", tenantId: "t", role: "BROKER" } };
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      const filter = expected as Row;
      if ("in" in filter) return (filter.in as unknown[]).includes(actual);
      if ("not" in filter) return actual !== filter.not;
      if ("gt" in filter) return (actual as Date) > (filter.gt as Date);
    }
    return actual === expected;
  });
}
function fixture() {
  let tables: Record<string, Row[]> = {
    documentationFolder: [{ id: "f", tenantId: "t", brokerId: "b", correspondentId: "c", version: 0, status: "EM_MONTAGEM" }],
    user: [{ id: "c", tenantId: "t", role: "CORRESPONDENTE", isActive: true }],
    documentationDocument: [{ id: "d", tenantId: "t", folderId: "f", personId: "p", documentTypeId: "type", status: "ACTIVE", checksum: "valid" }],
    documentationPerson: [{ id: "p", tenantId: "t", folderId: "f" }], documentationDocumentType: [{ id: "type", tenantId: "t", isActive: true }],
    documentationAnalysisRound: [], documentationRoundDocument: [], documentationPendingItem: [], documentationAnalysis: [], documentationAnalysisDocument: [], documentationEvent: [], documentationComment: [],
  };
  let serial = 0; let failEvent = false; let queue = Promise.resolve();
  const delegates: Record<string, unknown> = {};
  for (const model of Object.keys(tables)) {
    const rows = (where?: Row) => tables[model].filter(row => matches(row, where));
    const ordered = (args: Args) => rows(args.where).sort((a, b) => args.orderBy?.sequence === "desc" ? Number(b.sequence) - Number(a.sequence) : 0);
    const create = async ({ data = {} }: Args) => {
      if (model === "documentationEvent" && failEvent) throw new Error("synthetic event failure");
      const row: Row = { id: `synthetic-${++serial}`, status: "OPEN", createdAt: new Date(), closedAt: null, ...data }; tables[model].push(row); return structuredClone(row);
    };
    const updateRows = ({ where, data = {} }: Args) => { const selected = rows(where); for (const row of selected) for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? Number(row[key]) + Number((value as Row).increment) : value; return selected; };
    delegates[model] = {
      findFirst: async (args: Args) => { const row = ordered(args)[0]; if (!row) return null; return structuredClone({ ...row, ...(args.include?.document ? { document: tables.documentationDocument.find(document => document.id === row.documentId) } : {}) }); },
      findMany: async (args: Args) => structuredClone(ordered(args)), count: async (args: Args) => rows(args.where).length,
      create, createMany: async ({ data }: { data: Row[] }) => { for (const row of data) await create({ data: row }); return { count: data.length }; },
      updateMany: async (args: Args) => ({ count: updateRows(args).length }), update: async (args: Args) => structuredClone(updateRows(args)[0]),
    };
  }
  delegates.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    const previous = queue; let release!: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
    const snapshot = structuredClone(tables); try { return await callback(delegates); } catch (error) { tables = snapshot; throw error; } finally { release(); }
  };
  const db = delegates as unknown as typeof prisma;
  const rows = (name: string) => tables[name];
  const step = (action: WorkflowAction, values: Row = {}, viewer = owner) => workflowMutation(viewer, "f", action, { version: rows("documentationFolder")[0].version, roundId: rows("documentationAnalysisRound").at(-1)?.id, ...values }, db);
  return { db, rows, step, failEvents: () => { failEvent = true; } };
}
const errorStatus = (status: number) => (error: unknown) => error instanceof DocumentationError && error.status === status;
async function analyzing() { const h = fixture(); await h.step("submit"); await h.step("start", {}, correspondent); return h; }

test("pending corrections, resolution and resubmission preserve both rounds and immutable document snapshots", async () => {
  const h = await analyzing(); await h.step("issue", { message: "Unreadable", documentId: "d", personId: "p", documentTypeId: "type" }, correspondent);
  const issueId = h.rows("documentationPendingItem")[0].id;
  await h.step("finish", { result: "PENDENCIA_DOCUMENTAL", observation: "Fix readability" }, correspondent);
  await assert.rejects(h.step("submit"), errorStatus(409));
  await h.step("resolve", { issueId }, broker);
  assert.equal(h.rows("documentationPendingItem")[0].resolvedById, "b"); assert.ok(h.rows("documentationPendingItem")[0].resolvedAt instanceof Date);
  await assert.rejects(h.step("resolve", { issueId }), errorStatus(409));
  await h.step("submit", {}, broker); assert.equal(h.rows("documentationFolder")[0].status, "EM_REANALISE");
  assert.deepEqual(h.rows("documentationAnalysisRound").map(round => round.sequence), [1, 2]);
  await h.step("start", {}, correspondent); await h.step("finish", { result: "APROVADO" }, correspondent);
  assert.deepEqual(h.rows("documentationAnalysis").map(analysis => analysis.result), ["PENDENCIA_DOCUMENTAL", "APROVADO"]);
  assert.equal(h.rows("documentationRoundDocument").length, 2); assert.equal(h.rows("documentationAnalysisDocument").length, 2);
  assert.equal(h.rows("documentationPendingItem")[0].status, "RESOLVED");
  assert.ok(h.rows("documentationEvent").some(event => event.eventType === "DOCUMENT_REVIEW_RESUBMITTED"));
});
for (const result of ["APROVADO", "CONDICIONADO", "REPROVADO"]) test(`terminal ${result} records result and rejects every subsequent transition`, async () => {
  const h = await analyzing(); if (result !== "APROVADO") await assert.rejects(h.step("finish", { result }, correspondent), errorStatus(400));
  await h.step("finish", { result, observation: "Required conditions or reason" }, correspondent);
  assert.equal(h.rows("documentationFolder")[0].status, result); assert.ok(h.rows("documentationAnalysisRound")[0].closedAt instanceof Date);
  for (const action of ["submit", "start", "issue", "finish", "resolve"] as WorkflowAction[]) await assert.rejects(h.step(action, { result, message: "test", issueId: "none" }, action === "submit" || action === "resolve" ? owner : correspondent));
  assert.equal(h.rows("documentationAnalysis").length, 1);
});
test("pending result needs an open issue and terminal results cannot silently drop open issues", async () => {
  const h = await analyzing(); await assert.rejects(h.step("finish", { result: "PENDENCIA_DOCUMENTAL" }, correspondent), errorStatus(409));
  await h.step("issue", { message: "General missing information" }, correspondent);
  await assert.rejects(h.step("finish", { result: "APROVADO" }, correspondent), errorStatus(409));
  const issueId = h.rows("documentationPendingItem")[0].id;
  await h.step("editIssue", { issueId, message: "Revised description" }, correspondent); assert.equal(h.rows("documentationPendingItem")[0].message, "Revised description");
  await h.step("cancelIssue", { issueId }, correspondent); assert.equal(h.rows("documentationPendingItem")[0].status, "CANCELLED");
  await h.step("finish", { result: "APROVADO" }, correspondent);
});
test("duplicate concurrent submissions create exactly one round and a stale conflict", async () => {
  const h = fixture(); const settled = await Promise.allSettled([h.step("submit", { version: 0 }), h.step("submit", { version: 0 })]);
  assert.equal(settled.filter(value => value.status === "fulfilled").length, 1); assert.equal(h.rows("documentationAnalysisRound").length, 1); assert.equal(h.rows("documentationFolder")[0].version, 1);
  assert.ok(settled.some(value => value.status === "rejected" && errorStatus(409)(value.reason)));
});
test("duplicate starts and conclusions cannot overwrite the current analysis", async () => {
  const h = await analyzing(); await assert.rejects(h.step("start", {}, correspondent), errorStatus(409));
  await h.step("finish", { result: "APROVADO" }, correspondent); await assert.rejects(h.step("finish", { result: "REPROVADO", observation: "another" }, correspondent), errorStatus(409));
  assert.equal(h.rows("documentationAnalysis")[0].result, "APROVADO");
});
test("assignment, tenant, broker and role boundaries are enforced server-side", async () => {
  for (const viewer of [{ ...owner, tenant: { ...owner.tenant, isPlatform: true } }, { ...owner, user: { ...owner.user, tenantId: "foreign" } }, { ...broker, user: { ...broker.user, id: "other" } }, { ...correspondent, user: { ...correspondent.user, id: "other" } }]) {
    const h = fixture(); await assert.rejects(h.step("submit", {}, viewer)); assert.equal(h.rows("documentationFolder")[0].version, 0);
  }
  const h = fixture(); await assert.rejects(h.step("submit", {}, correspondent), errorStatus(403)); await h.step("submit", {}, broker);
  await assert.rejects(h.step("start", {}, owner), errorStatus(403)); await h.step("start", {}, correspondent);
  await assert.rejects(h.step("issue", { message: "test" }, broker), errorStatus(403));
  h.rows("documentationFolder")[0].correspondentId = "replacement";
  await assert.rejects(h.step("finish", { result: "APROVADO" }, correspondent), errorStatus(404));
});
test("submission rejects missing/inactive correspondent, empty files and in-flight uploads", async () => {
  for (const mode of ["missing", "inactive", "empty", "processing"]) {
    const h = fixture(); if (mode === "missing") h.rows("documentationFolder")[0].correspondentId = null;
    if (mode === "inactive") h.rows("user")[0].isActive = false;
    if (mode === "empty") h.rows("documentationDocument").splice(0);
    if (mode === "processing") h.rows("documentationDocument").push({ id: "processing", tenantId: "t", folderId: "f", status: "PROCESSING", createdAt: new Date() });
    await assert.rejects(h.step("submit")); assert.equal(h.rows("documentationAnalysisRound").length, 0); assert.equal(h.rows("documentationFolder")[0].version, 0);
  }
});
test("issues accept general, person/type or snapshot document links and reject foreign references", async () => {
  const h = await analyzing(); for (const values of [{ personId: "foreign" }, { documentTypeId: "foreign" }, { documentId: "foreign" }, { documentId: "d", personId: "another" }]) await assert.rejects(h.step("issue", { message: "test", ...values }, correspondent), errorStatus(400));
  await h.step("issue", { message: "General" }, correspondent); await h.step("issue", { message: "Missing type", personId: "p", documentTypeId: "type" }, correspondent);
  assert.equal(h.rows("documentationPendingItem").length, 2);
});
test("prior-round and foreign-folder issue resolution is refused without changes", async () => {
  const h = await analyzing(); await h.step("issue", { message: "test" }, correspondent); await h.step("finish", { result: "PENDENCIA_DOCUMENTAL" }, correspondent);
  const issue = h.rows("documentationPendingItem")[0]; await assert.rejects(h.step("resolve", { issueId: issue.id, roundId: "other" }), errorStatus(409));
  await assert.rejects(h.step("resolve", { issueId: "foreign" }), errorStatus(409));
  await assert.rejects(h.step("resolve", { issueId: issue.id }, correspondent), errorStatus(403)); assert.equal(h.rows("documentationPendingItem")[0].status, "OPEN");
});
test("saved draft opinions use shared comments and ID-only round events", async () => {
  const h = await analyzing(); await h.step("note", { observation: "First opinion" }, correspondent); await h.step("note", { observation: "Updated opinion" }, correspondent);
  assert.equal(h.rows("documentationComment").length, 2); assert.equal(h.rows("documentationComment")[0].visibility, "SHARED");
  for (const event of h.rows("documentationEvent").filter(row => row.eventType === "DOCUMENT_REVIEW_NOTE_SAVED")) assert.deepEqual(Object.keys(event.metadata as Row), ["commentId"]);
});
test("event failures roll back submission and analysis completion atomically", async () => {
  const first = fixture(); first.failEvents(); await assert.rejects(first.step("submit")); assert.equal(first.rows("documentationAnalysisRound").length, 0); assert.equal(first.rows("documentationFolder")[0].version, 0);
  const h = await analyzing(); const version = h.rows("documentationFolder")[0].version; h.failEvents(); await assert.rejects(h.step("finish", { result: "APROVADO" }, correspondent));
  assert.equal(h.rows("documentationAnalysis").length, 0); assert.equal(h.rows("documentationFolder")[0].status, "EM_ANALISE"); assert.equal(h.rows("documentationFolder")[0].version, version); assert.equal(h.rows("documentationAnalysisRound")[0].closedAt, null);
});
test("workflow routes reject missing sessions before database access", async () => {
  const context = { params: Promise.resolve({ id: "f" }) };
  assert.equal((await requestContext(undefined, () => GET(new Request("https://local.test/workflow"), context))).status, 401);
  assert.equal((await requestContext(undefined, () => POST(new Request("https://local.test/workflow", { method: "POST", body: "{}" }), context))).status, 401);
});
test("workflow read uses broker assignment and explicit public projections, with bounded history", async () => {
  const calls: Args[] = [];
  const db = {
    documentationFolder: { findFirst: async (args: Args & { select: Row }) => {
      assert.equal(args.where?.tenantId, "t"); assert.equal(args.where?.brokerId, "b");
      assert.equal(args.select.administrativeObservation, undefined); assert.equal((args.select.people as { select: Row }).select.cpf, undefined);
      return { id: "f", status: "EM_MONTAGEM", version: 0, correspondentId: "c", broker: { name: "Synthetic" }, people: [] };
    } },
    documentationAnalysisRound: { findFirst: async () => null, findMany: async (args: Args) => { calls.push(args); return []; }, count: async () => 0 },
    documentationDocument: { findMany: async (args: Args & { select: Row }) => { assert.equal(args.select.storageKey, undefined); return []; } },
    documentationDocumentType: { findMany: async () => [] },
    documentationPendingItem: { count: async () => 0 },
  } as unknown as typeof prisma;
  const value = await workflowView(broker, "f", new URLSearchParams(), db);
  assert.equal(value.canSubmit, true); assert.equal(value.canAnalyze, false); assert.equal(value.total, 0);
  assert.ok(!JSON.stringify(value).match(/storageKey|administrativeObservation|amazonaws|cpf/));
  assert.equal((calls[0] as Args & { take: number }).take, 10);
  await assert.rejects(workflowView(broker, "f", new URLSearchParams({ page: "0" }), db), errorStatus(400));
});
