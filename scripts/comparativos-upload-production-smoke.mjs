// A short-lived, unpublished QA comparativo tests the same HTTPS browser upload path.
// It never changes the user's comparativo. Its own record and private object are removed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";
loadDocumentationEnv();
const db = new PrismaClient();
let fixtureId, fixtureTenant;
const title = `QA upload temporário ${randomUUID()}`;
try {
  const remote = JSON.parse(readFileSync(0, "utf8"));
  assert.equal(remote.RAILWAY_SERVICE_ID, "b133c3a0-3c13-4a54-9c34-f3b229f1ff80");
  process.env.SESSION_SECRET = remote.SESSION_SECRET;
  const { createSessionToken, sessionCookieName } = await import("../src/lib/auth.server.ts");
  const type = await db.empreendimentoTipologia.findFirst({ where: { empreendimento: { name: { contains: "Aurora", mode: "insensitive" } } }, select: { id: true, empreendimento: { select: { tenantId: true } } } });
  assert.ok(type);
  const user = await db.user.findFirst({ where: { tenantId: type.empreendimento.tenantId, isActive: true, role: { in: ["OWNER", "DIRECTOR", "MANAGER"] } }, select: { id: true, tenantId: true, role: true, sessionVersion: true } });
  assert.ok(user); fixtureTenant = user.tenantId;
  const cookie = `${sessionCookieName}=${createSessionToken({ uid: user.id, tid: user.tenantId, role: user.role, sv: user.sessionVersion })}`;
  const origin = "https://flyimob.com";
  const call = async (path, body) => {
    const r = await fetch(origin + path, { method: "POST", headers: { cookie, origin, "sec-fetch-site": "same-origin", "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    const json = await r.json(); assert.equal(r.status, 200, `${path}: ${json.error ?? r.status}`); assert.equal(json.ok, true); return json;
  };
  const created = await call("/api/comparativos/create", { titulo: title, clienteNome: "Teste técnico temporário", modoDirecionamento: true });
  fixtureId = created.comparativo.id;
  const added = await call("/api/comparativos/items/add", { comparativoId: fixtureId, tipologiaId: type.id });
  const directory = join(homedir(), "Downloads");
  const name = (await readdir(directory)).find(n => n.startsWith("GRAN AURORA - GRAN AURORA - BLOCO 20") && n.endsWith("(1).pdf"));
  assert.ok(name);
  const bytes = await readFile(join(directory, name));
  const r = await fetch(`${origin}/api/comparativos/anexos?comparativoId=${fixtureId}&itemId=${added.item.id}`, { method: "POST", headers: { cookie, origin, "sec-fetch-site": "same-origin", "Content-Type": "application/pdf", "x-file-name": encodeURIComponent(name), "x-file-size": String(bytes.length) }, body: bytes, signal: AbortSignal.timeout(90000) });
  const upload = await r.json(); assert.equal(r.status, 200, upload.error ?? "Upload falhou."); assert.equal(upload.ok, true);
  console.log("Upload do PDF real com Origin HTTPS: OK.");
  await call("/api/comparativos/planos/extrair", { itemId: added.item.id });
  const item = await db.comparativoItem.findUnique({ where: { id: added.item.id }, select: { planoRascunho: true, estadoExtracao: true } });
  assert.equal(item.estadoExtracao, "REVISAR"); assert.equal(item.planoRascunho.valorTotal, 218900);
  assert.ok(item.planoRascunho.grupos.some(g => g.quantidade === 48 && g.primeiraParcela === 1172.14 && g.ultimaParcela === 562.11));
  console.log("Extração em produção: preço, quantidade e extremos das parcelas conferidos. Rascunho não publicado.");
} catch (e) {
  console.error(e?.name?.startsWith("Prisma") || e instanceof SyntaxError ? "Falha no teste; dados sensíveis omitidos." : e.message);
  process.exitCode = 1;
} finally {
  if (fixtureId) {
    const own = await db.comparativo.findUnique({ where: { id: fixtureId }, select: { titulo: true, tenantId: true, publicadoEm: true, anexos: { select: { storageKey: true } } } });
    assert.equal(own.titulo, title); assert.equal(own.tenantId, fixtureTenant); assert.equal(own.publicadoEm, null);
    const { s3 } = await import("../src/lib/s3.ts");
    for (const a of own.anexos) {
      assert.ok(a.storageKey.startsWith(`private/comparativos/${fixtureTenant}/${fixtureId}/`));
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_DOCUMENTATION_BUCKET, Key: a.storageKey }));
    }
    await db.$transaction([db.comparativoItem.deleteMany({ where: { comparativoId: fixtureId } }), db.comparativo.delete({ where: { id: fixtureId } })]);
    console.log("Comparativo técnico e anexo removidos. Comparativo do usuário preservado.");
  }
  await db.$disconnect();
}
