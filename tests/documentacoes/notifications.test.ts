import { requestContext } from "./request-context";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { prisma } from "../../src/lib/prisma";
import type { DocumentationViewer } from "../../src/lib/documentacoes/access-policy";
import { DocumentationError } from "../../src/lib/documentacoes/validation";
import { documentationNotifications, notificationScope, readDocumentationNotification } from "../../src/lib/documentacoes/notifications.server";
import { GET, POST } from "../../src/app/api/documentacoes/notificacoes/route";

const owner: DocumentationViewer = { user: { id: "o", tenantId: "t", role: "OWNER" }, tenant: { id: "t", isPlatform: false } };
const broker: DocumentationViewer = { ...owner, user: { id: "b", tenantId: "t", role: "BROKER" } };
const errorStatus = (status: number) => (error: unknown) => error instanceof DocumentationError && error.status === status;

test("notification scope uses tenant and current commercial assignment, denying other profiles and platform", () => {
  assert.deepEqual(notificationScope(broker).folder, { tenantId: "t", OR: [{ responsiblePerson: { user: { id: "b" } } }, { responsiblePersonId: null, brokerId: "b" }] });
  assert.equal(notificationScope(owner).actorRole, "CORRESPONDENTE");
  for (const session of [
    { ...owner, tenant: { id: "t", isPlatform: true } },
    { ...broker, user: { ...broker.user, tenantId: "other" } },
    { ...owner, user: { ...owner.user, role: "CORRESPONDENTE" as const } },
  ]) assert.throws(() => notificationScope(session));
});

test("unread feed is per user, bounded and projects only safe notification data", async () => {
  const calls: Record<string, unknown>[] = [];
  const db = { documentationEvent: {
    count: async ({ where }: { where: Record<string, unknown> }) => { calls.push(where); return 21; },
    findMany: async (args: Record<string, unknown>) => { calls.push(args); return [{ id: "e", folderId: "f", eventType: "DOCUMENT_REVIEW_REJECTED", createdAt: new Date(0), actor: { name: "CREDONLINE" }, folder: { people: [{ name: "Cliente" }] }, notificationReads: [] }]; },
  } } as unknown as typeof prisma;
  const feed = await documentationNotifications(broker, new URLSearchParams({ page: "2", tenantId: "forged" }), db);
  assert.equal(feed.unreadCount, 21); assert.equal(feed.items[0].readAt, null);
  assert.equal(feed.items[0].title, "Documentação reprovada");
  assert.equal(feed.items[0].href, "/documentacoes/pastas/f");
  assert.deepEqual(calls[0].notificationReads, { none: { tenantId: "t", userId: "b" } });
  assert.equal(calls[2].skip, 20); assert.equal(calls[2].take, 20);
  const projection = JSON.stringify(calls[2].select);
  assert.ok(!/cpf|storageKey|administrativeObservation|metadata/.test(projection));
  const all = await documentationNotifications(owner, new URLSearchParams({ filter: "all" }), db);
  assert.equal(all.items[0].href, "/admin/documentacoes/pastas/f?tab=analise");
  await assert.rejects(documentationNotifications(owner, new URLSearchParams({ page: "0" }), db), errorStatus(400));
});

test("marking read verifies access before an idempotent receipt and never updates the source event", async () => {
  let allowed = true; let reads = 0; const receipts = new Map<string, Date>();
  const tx = {
    documentationEvent: { findFirst: async ({ where }: { where: Record<string, unknown> }) => { assert.equal(where.tenantId, "t"); assert.equal(where.id, "e"); assert.ok(where.folder); return allowed ? { id: "e", folderId: "f" } : null; } },
    documentationNotificationRead: { upsert: async ({ where, create, update }: { where: { tenantId_userId_eventId: { tenantId: string; userId: string; eventId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      assert.deepEqual(update, {}); assert.equal(create.folderId, "f");
      const key = JSON.stringify(where); if (!receipts.has(key)) receipts.set(key, new Date()); reads++;
      return { readAt: receipts.get(key) };
    } },
  };
  const db = { $transaction: async (run: (value: typeof tx) => unknown) => run(tx) } as unknown as typeof prisma;
  const first = await readDocumentationNotification(owner, "e", db);
  assert.deepEqual(await readDocumentationNotification(owner, "e", db), first);
  assert.equal(receipts.size, 1);
  await readDocumentationNotification(broker, "e", db); assert.equal(receipts.size, 2);
  allowed = false;
  await assert.rejects(readDocumentationNotification(owner, "e", db), errorStatus(404)); assert.equal(reads, 3);
});

test("notification routes deny anonymous access without touching the database", async () => {
  assert.equal((await requestContext(undefined, () => GET(new Request("https://local.test/api/documentacoes/notificacoes")))).status, 401);
  assert.equal((await requestContext(undefined, () => POST(new Request("https://local.test/api/documentacoes/notificacoes", { method: "POST", body: "{}" })))).status, 401);
});
