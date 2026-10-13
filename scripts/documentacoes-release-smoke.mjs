import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";
loadDocumentationEnv();
Object.assign(globalThis, { AsyncLocalStorage });
const db = new PrismaClient();
let stage = "imports";
try {
  const remote = JSON.parse(readFileSync(0, "utf8"));
  assert.equal(remote.RAILWAY_SERVICE_ID, "b133c3a0-3c13-4a54-9c34-f3b229f1ff80");
  const { documentationNotifications } = await import("../src/lib/documentacoes/notifications.server.ts");
  const { workflowView } = await import("../src/lib/documentacoes/workflow.server.ts");
  const { folderListSelect } = await import("../src/lib/documentacoes/folders.server.ts");
  stage = "read-only-queries";
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const folder = await tx.documentationFolder.findFirst({ where: { tenant: { isPlatform: false } }, orderBy: { updatedAt: "desc" }, select: { id: true, tenantId: true } });
    assert.ok(folder);
    const owner = await tx.user.findFirst({ where: { tenantId: folder.tenantId, role: "OWNER", isActive: true }, select: { id: true, tenantId: true, role: true, sessionVersion: true } });
    assert.ok(owner);
    const session = { user: owner, tenant: { id: owner.tenantId, isPlatform: false } };
    const feed = await documentationNotifications(session, new URLSearchParams(), tx);
    const workflow = await workflowView(session, folder.id, new URLSearchParams(), tx);
    const row = await tx.documentationFolder.findFirst({ where: { id: folder.id, tenantId: owner.tenantId }, select: folderListSelect });
    assert.ok(row && Array.isArray(row.rounds));
    if (workflow.latest) assert.ok(Object.hasOwn(workflow.latest, "firstViewedAt"));
    console.log(JSON.stringify({ readOnlyQueries: "OK", unreadCount: feed.unreadCount, roundTracking: "OK", folderList: "OK" }));
    return { owner, folderId: folder.id };
  }, { timeout: 45000, maxWait: 10000 });
  if (process.argv.includes("--http")) {
    assert.ok(remote.SESSION_SECRET);
    process.env.SESSION_SECRET = remote.SESSION_SECRET;
    const { createSessionToken, sessionCookieName } = await import("../src/lib/auth.server.ts");
    const token = createSessionToken({ uid: result.owner.id, tid: result.owner.tenantId, role: result.owner.role, sv: result.owner.sessionVersion });
    const origin = "https://flyimob.com";
    for (const [label, path, authenticated, method, expected] of [
      ["login", "/login", false, "GET", 200],
      ["notifications-anonymous", "/api/documentacoes/notificacoes", false, "GET", 401],
      ["view-anonymous", `/api/documentacoes/correspondente/pastas/${result.folderId}/visualizacao`, false, "POST", 401],
      ["notifications-owner", "/api/documentacoes/notificacoes", true, "GET", 200],
      ["folder-list-owner", "/api/documentacoes/pastas", true, "GET", 200],
      ["workflow-owner", `/api/documentacoes/pastas/${result.folderId}/workflow`, true, "GET", 200],
      ["summary-owner", `/admin/documentacoes/pastas/${result.folderId}`, true, "GET", 200],
    ]) {
      stage = label;
      const response = await fetch(origin + path, { method, headers: authenticated ? { cookie: `${sessionCookieName}=${token}` } : {}, redirect: "manual", signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, expected, label);
      if (label === "notifications-owner") { const value = await response.json(); assert.ok(Array.isArray(value.items)); }
      if (label === "folder-list-owner") { const value = await response.json(); assert.ok(value.items.every(row => Array.isArray(row.rounds))); }
      if (label === "workflow-owner") { const value = await response.json(); assert.equal(typeof value.canReopen, "boolean"); if (value.latest) assert.ok(Object.hasOwn(value.latest, "firstViewedAt")); }
      // The detail UI loads after hydration. HTTP smoke verifies its authenticated shell, not browser rendering.
      if (label === "summary-owner") assert.ok((await response.text()).includes("Carregando pasta"));
      console.log(JSON.stringify({ endpoint: label, status: response.status }));
    }
    console.log("Smoke HTTP publicado aprovado. Nenhuma pasta foi reaberta, lida ou visualizada em nome do correspondente.");
  }
} catch (error) { console.error(JSON.stringify({ smoke: "failed", stage, kind: error.name, code: error.code ?? null })); process.exitCode = 1; }
finally { await db.$disconnect(); }
