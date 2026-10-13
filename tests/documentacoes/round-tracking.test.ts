import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { prisma } from "../../src/lib/prisma";
import type { DocumentationViewer } from "../../src/lib/documentacoes/access-policy";
import { recordCorrespondentView } from "../../src/lib/documentacoes/round-tracking.server";
import { correspondentNotificationEvents } from "../../src/lib/documentacoes/notifications.server";
import { DocumentationError } from "../../src/lib/documentacoes/validation";
import DocumentationTracking from "../../src/components/DocumentationTracking";
import { POST } from "../../src/app/api/documentacoes/correspondente/pastas/[id]/visualizacao/route";
Object.assign(globalThis, { React });
const correspondent: DocumentationViewer = { user: { id: "c", tenantId: "t", role: "CORRESPONDENTE" }, tenant: { id: "t", isPlatform: false } };
const errorStatus = (status: number) => (error: unknown) => error instanceof DocumentationError && error.status === status;
function fixture() {
  const folder = { id: "f", tenantId: "t", correspondentId: "c", status: "AGUARDANDO_CORRESPONDENTE", version: 7 };
  let round = { id: "r1", correspondentId: "c", firstViewedAt: null as Date | null, closedAt: null as Date | null };
  const events: Record<string, unknown>[] = []; let failed = false; let queue = Promise.resolve();
  const tx = {
    $queryRaw: async (query: { values: unknown[] }) => { assert.deepEqual(query.values, ["f", "t", "c"]); return folder.correspondentId === "c" ? [folder] : []; },
    documentationAnalysisRound: { findFirst: async () => structuredClone(round), update: async ({ data }: { data: { firstViewedAt: Date } }) => Object.assign(round, data) },
    documentationEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { if (failed) throw new Error("audit failure"); events.push(data); } },
  };
  const db = { $transaction: async (run: (tx: unknown) => unknown) => {
    const prior = queue; let release!: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await prior;
    const previous = structuredClone(round); const size = events.length;
    try { return await run(tx); } catch (error) { round = previous; events.length = size; throw error; } finally { release(); }
  } } as unknown as typeof prisma;
  return { folder, events, db, round: () => round, fail: () => { failed = true; } };
}
test("concurrent/repeated opens record one view and notification without changing workflow status/version", async () => {
  const h = fixture();
  const replies = await Promise.all(Array.from({ length: 4 }, () => recordCorrespondentView(correspondent, "f", "r1", h.db)));
  assert.equal(replies.filter(item => item.recorded).length, 1); assert.equal(h.events.length, 1);
  assert.equal(h.events[0].eventType, "DOCUMENT_REVIEW_VIEWED"); assert.equal(h.events[0].actorId, "c");
  assert.equal(h.folder.version, 7); assert.equal(h.folder.status, "AGUARDANDO_CORRESPONDENTE");
  assert.ok(h.round().firstViewedAt instanceof Date);
  h.round().id = "r2"; h.round().firstViewedAt = null; h.folder.status = "EM_REANALISE";
  await assert.rejects(recordCorrespondentView(correspondent, "f", "r1", h.db), errorStatus(409));
  await recordCorrespondentView(correspondent, "f", "r2", h.db);
  assert.equal(h.events.length, 2); assert.equal(h.events[1].roundId, "r2");
});
test("views reject wrong role/tenant/assignment/round and do not invent historical views", async () => {
  const h = fixture();
  await assert.rejects(recordCorrespondentView({ ...correspondent, user: { ...correspondent.user, role: "OWNER" } }, "f", "r1", h.db), errorStatus(403));
  await assert.rejects(recordCorrespondentView({ ...correspondent, tenant: { id: "foreign", isPlatform: false } }, "f", "r1", h.db), errorStatus(403));
  await assert.rejects(recordCorrespondentView({ ...correspondent, tenant: { id: "t", isPlatform: true } }, "f", "r1", h.db), errorStatus(403));
  h.folder.correspondentId = "other"; await assert.rejects(recordCorrespondentView(correspondent, "f", "r1", h.db), errorStatus(404)); h.folder.correspondentId = "c";
  h.round().correspondentId = "previous"; await assert.rejects(recordCorrespondentView(correspondent, "f", "r1", h.db), errorStatus(409)); h.round().correspondentId = "c";
  h.round().closedAt = new Date(); assert.equal((await recordCorrespondentView(correspondent, "f", "r1", h.db)).recorded, false);
  h.round().closedAt = null; h.folder.status = "PENDENCIA_DOCUMENTAL";
  assert.equal((await recordCorrespondentView(correspondent, "f", "r1", h.db)).recorded, false); assert.equal(h.events.length, 0);
});
test("audit failure rolls back first-view timestamp", async () => {
  const h = fixture(); h.fail(); await assert.rejects(recordCorrespondentView(correspondent, "f", "r1", h.db));
  assert.equal(h.round().firstViewedAt, null); assert.equal(h.events.length, 0);
});
test("tracking distinguishes visualized, started and historical unrecorded openings", () => {
  const base = { id: "r", sequence: 2, sentAt: new Date(0), firstViewedAt: null, closedAt: null, events: [] };
  const render = (round: Parameters<typeof DocumentationTracking>[0]["round"]) => renderToStaticMarkup(React.createElement(DocumentationTracking, { round }));
  assert.ok(render(base).includes("Aguardando visualização"));
  assert.ok(render({ ...base, firstViewedAt: new Date(1000) }).includes("Visualizada pelo correspondente"));
  assert.ok(render({ ...base, events: [{ createdAt: new Date(2000) }] }).includes("Visualização não registrada"));
  assert.ok(render({ ...base, closedAt: new Date(3000) }).includes("Rodada concluída"));
  assert.ok(correspondentNotificationEvents.includes("DOCUMENT_REVIEW_VIEWED")); assert.ok(correspondentNotificationEvents.includes("DOCUMENT_REVIEW_STARTED"));
});
test("view receipt route denies anonymous requests before database access", async () => {
  const request = new Request("https://local.test/visualizacao", { method: "POST", body: JSON.stringify({ roundId: "r1" }) });
  assert.equal((await requestContext(undefined, () => POST(request, { params: Promise.resolve({ id: "f" }) }))).status, 401);
});
