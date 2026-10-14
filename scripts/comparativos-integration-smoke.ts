// Uses a named, isolated PostgreSQL schema with synthetic records only.
// Public tables and real accounts are never changed; the isolated schema is removed in finally.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";
import { createSessionToken, sessionCookieName } from "../src/lib/auth.server";
import { PLANO_VAZIO } from "../src/lib/comparativos/plano";

let stage = "initialization";
async function main() {
  loadDocumentationEnv();
  const schema = `comparativo_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^comparativo_test_[a-f0-9]{32}$/);
  const base = new PrismaClient();
  const url = new URL(process.env.DATABASE_URL!); url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  let server: ReturnType<typeof spawn> | undefined;
  let schemaCreated = false;
  let syntheticTenantId: string | undefined;
  const origin = "http://localhost:3115";
  try {
    stage = "create isolated schema";
    await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
    stage = "clone isolated enums and tables";
    const tableNames = ["Tenant", "User", "Construtora", "Empreendimento", "EmpreendimentoFoto", "EmpreendimentoTipologia", "Comparativo", "ComparativoItem"];
    const columns = await base.$queryRawUnsafe<{table_name: string;column_name: string;udt_name: string;column_default: string|null}[]>(`SELECT table_name,column_name,udt_name,column_default FROM information_schema.columns WHERE table_schema='public' AND data_type='USER-DEFINED' AND table_name IN (${tableNames.map(n=>"'"+n+"'").join(",")})`);
    const enums = await base.$queryRawUnsafe<{typname:string;enumlabel:string}[]>(`SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`);
    const sql = await readFile("prisma/migrations/20261014150000_comparativo_direcionamento/migration.sql", "utf8");
    await base.$transaction(async tx => {
      for (const type of [...new Set(columns.map(c=>c.udt_name))]) {
        assert.match(type,/^[A-Za-z][A-Za-z0-9_]*$/);
        const labels = enums.filter(e=>e.typname===type).map(e=>"'"+e.enumlabel.replaceAll("'","''")+"'");
        assert.ok(labels.length);
        await tx.$executeRawUnsafe(`CREATE TYPE "${schema}"."${type}" AS ENUM (${labels.join(",")})`);
      }
      for (const name of tableNames) await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."${name}" (LIKE public."${name}" INCLUDING ALL)`);
      for (const c of columns) {
        assert.match(c.column_name,/^[A-Za-z][A-Za-z0-9_]*$/);
        if(c.column_default) await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."${c.table_name}" ALTER COLUMN "${c.column_name}" DROP DEFAULT`);
        await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."${c.table_name}" ALTER COLUMN "${c.column_name}" TYPE "${schema}"."${c.udt_name}" USING "${c.column_name}"::text::"${schema}"."${c.udt_name}"`);
        if(c.column_default) { const label=c.column_default.match(/^'([^']+)'/)?.[1]; assert.ok(label); await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."${c.table_name}" ALTER COLUMN "${c.column_name}" SET DEFAULT '${label}'::"${schema}"."${c.udt_name}"`); }
      }
      for (const [table, names] of [["Comparativo", ["modoDirecionamento", "resumoCredito", "publicadoEm", "revisao"]], ["ComparativoItem", ["planoPagamento", "planoRascunho", "extracaoOriginal", "estadoExtracao", "extracaoToken", "extracaoIniciadaEm", "revisao"]]] as const) {
        for (const name of names) await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."${table}" DROP COLUMN IF EXISTS "${name}"`);
      }
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      for (const statement of sql.split(";").map(s=>s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    },{timeout:45000});
    stage = "seed isolated tenant";
    const tenant = await db.tenant.create({ data: { name: "Teste comparativo", slug: "comparativo-fixture" } });
    syntheticTenantId = tenant.id;
    const other = await db.tenant.create({ data: { name: "Outro tenant sintético", slug: "comparativo-other" } });
    stage = "seed isolated user";
    const user = await db.user.create({ data: { tenantId: tenant.id, name: "Usuário sintético", email: "comparativo-fixture@example.invalid", role: "OWNER" } });
    const outsider = await db.user.create({ data: { tenantId: other.id, name: "Outro usuário sintético", email: "comparativo-other@example.invalid", role: "OWNER" } });
    stage = "seed isolated project";
    const project = await db.empreendimento.create({ data: { tenantId: tenant.id, name: "Projeto sintético", slug: "project-fixture", dataEntrega: new Date("2028-04-01") } });
    const type = await db.empreendimentoTipologia.create({ data: { empreendimentoId: project.id, nome: "2 quartos", areaPrivativa: 45, vagas: 0, precoInicial: 300000 } });
    const outsiderProject = await db.empreendimento.create({ data: { tenantId: other.id, name: "Projeto externo sintético", slug: "other-project" } });
    const outsiderType = await db.empreendimentoTipologia.create({ data: { empreendimentoId: outsiderProject.id, nome: "Externa" } });
    stage = "start local server";
    let logs = "";
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3115"], { windowsHide: true, env: { ...process.env, DATABASE_URL: url.toString(), APP_URL: origin, NEXT_PUBLIC_SITE_URL: origin, OPENAI_API_KEY: "", NODE_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", data => { logs = (logs + data.toString()).slice(-10000); });
    server.stderr?.on("data", data => { logs = (logs + data.toString()).slice(-10000); });
    for (let i = 0; i < 120; i++) {
      if (logs.includes("Ready in")) break;
      if (server.exitCode !== null) throw new Error("Servidor local não iniciou.");
      await new Promise(r => setTimeout(r, 500));
    }
    const cookie = (u: typeof user) => `${sessionCookieName}=${createSessionToken({ uid: u.id, tid: u.tenantId, role: u.role, sv: u.sessionVersion })}`;
    const call = async (path: string, expected: number, data?: unknown, account: typeof user | null = user, method?: string) => {
      const response = await fetch(origin + path, { method: method ?? (data ? "POST" : "GET"), headers: { ...(account ? { cookie: cookie(account) } : {}), ...(data ? { "Content-Type": "application/json", Origin: origin } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(90000), redirect: "manual" });
      assert.equal(response.status, expected, `${path}: expected ${expected}, received ${response.status}`);
      return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
    };
    stage = "HTTP checks";
    await call("/api/comparativos/create", 401, { titulo: "Teste", clienteNome: "Cliente sintético" }, null);
    const created = await call("/api/comparativos/create", 200, { titulo: "Teste direcionamento", clienteNome: "Cliente sintético", modoDirecionamento: true });
    const id = created.comparativo.id;
    const added = await call("/api/comparativos/items/add", 200, { comparativoId: id, tipologiaId: type.id });
    const itemId = added.item.id;
    stage = "private attachment checks";
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
    const upload = async (scope: string, expected = 200) => {
      const response = await fetch(`${origin}/api/comparativos/anexos?comparativoId=${id}&${scope}`, { method: "POST", headers: { cookie: cookie(user), Origin: origin, "Content-Type": "application/pdf", "x-file-name": "synthetic-test.pdf", "x-file-size": String(bytes.length) }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(90000) });
      const value = await response.json(); assert.equal(response.status, expected, `synthetic attachment: ${value.error ?? response.status}`); return value;
    };
    const globalFile = (await upload("slot=0")).anexo;
    await upload("slot=1"); await upload("slot=2", 400); await upload(`itemId=${itemId}`);
    const files = (await call(`/api/comparativos/get?id=${id}`, 200)).comparativo;
    assert.equal(files.anexos.length, 2); assert.equal(files.items[0].anexos.length, 1);
    await call("/api/comparativos/anexos", 404, { id: globalFile.id, titulo: "Intrusão" }, outsider, "PATCH");
    await call("/api/comparativos/anexos", 200, { id: globalFile.id, titulo: "Aprovação sintética" }, user, "PATCH");
    await call(`/api/comparativos/anexos?id=${globalFile.id}`, 404, undefined, outsider);
    await call(`/api/comparativos/anexos?id=${globalFile.id}&slug=wrong`, 401, undefined, null);
    stage = "review and publication checks";
    await call("/api/comparativos/items/add", 404, { comparativoId: id, tipologiaId: outsiderType.id });
    await call(`/api/comparativos/get?id=${id}`, 404, undefined, outsider);
    await call("/api/comparativos/update", 404, { id, titulo: "Intrusão", clienteNome: "Intrusão" }, outsider);
    await call("/api/comparativos/planos/salvar", 404, { itemId, revisao: 0, plano: PLANO_VAZIO }, outsider);
    await call("/api/comparativos/planos/extrair", 503, { itemId });
    await call("/api/comparativos/finalize/save", 409, { id, revisao: 1, configExibicao: {} });
    await call(`/api/comparativos/public?slug=${created.comparativo.slugPublico}`, 404, undefined, null);
    let c = (await call(`/api/comparativos/get?id=${id}`, 200)).comparativo;
    const plan = { ...PLANO_VAZIO, titulo: "Proposta sintética", empreendimento: project.name, unidade: "101", valorTotal: 217885.36, financiamento: null, grupos: [{ tipo: "mensais_sem_fase", titulo: "Mensais", quantidade: 48, primeiraParcela: 1172.14, ultimaParcela: 562.11, totalInformado: 43160, inicio: null, fim: null, variacao: "decrescente", resumo: "", pagina: null }] };
    await call("/api/comparativos/planos/salvar", 200, { itemId, revisao: c.items[0].revisao, plano: plan, aprovar: true });
    await call("/api/comparativos/planos/salvar", 409, { itemId, revisao: c.items[0].revisao, plano: plan, aprovar: true });
    c = (await call(`/api/comparativos/get?id=${id}`, 200)).comparativo;
    await call("/api/comparativos/credito", 200, { id, revisao: c.revisao, resumoCredito: { valorAprovado: 142000, parcela: null, recursosProprios: null, fgts: 0, observacoes: "Resumo sintético", proximosPassos: "Visitar duas opções" } });
    c = (await call(`/api/comparativos/get?id=${id}`, 200)).comparativo;
    await call("/api/comparativos/finalize/save", 200, { id, revisao: c.revisao, configExibicao: { blocks: { mapa: false } } });
    const published = (await call(`/api/comparativos/public?slug=${c.slugPublico}`, 200, undefined, null)).comparativo;
    assert.equal(published.items[0].planoPagamento.grupos[0].ultimaParcela, 562.11);
    assert.equal(published.items[0].saldoFinanciamento, null);
    assert.equal("planoRascunho" in published.items[0], false);
    assert.equal("extracaoOriginal" in published.items[0], false);
    assert.equal(published.anexos.length, 2); assert.equal("storageKey" in published.anexos[0], false);
    const original = await fetch(`${origin}/api/comparativos/anexos?id=${globalFile.id}&slug=${c.slugPublico}`, { signal: AbortSignal.timeout(90000) });
    assert.equal(original.status, 200); assert.equal(original.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
    const duplicate = await call("/api/comparativos/duplicate", 200, { id });
    const copied = (await call(`/api/comparativos/get?id=${duplicate.id}`, 200)).comparativo;
    assert.equal(copied.modoDirecionamento, true); assert.equal(copied.publicadoEm, null); assert.equal(copied.items[0].estadoExtracao, "REVISAR"); assert.equal(copied.anexos.length, 0);
    await call("/api/comparativos/planos/salvar", 200, { itemId, revisao: c.items[0].revisao, plano: plan, aprovar: false });
    await call(`/api/comparativos/public?slug=${c.slugPublico}`, 404, undefined, null);
    const legacy = await call("/api/comparativos/create", 200, { titulo: "Teste legado", clienteNome: "Cliente sintético" });
    await call(`/api/comparativos/public?slug=${legacy.comparativo.slugPublico}`, 200, undefined, null);
    console.log(JSON.stringify({ isolatedMigration: "OK", tenantIsolation: "OK", staleRevision: "OK", reviewAndPublish: "OK", privateDraft: "OK", privateAttachments: "OK", twoGlobalSlots: "OK", duplication: "OK", legacyComparativos: "OK" }));
  } finally {
    if (server) { server.kill(); await new Promise<void>(resolve => { if (server!.exitCode !== null) return resolve(); server!.once("exit", () => resolve()); setTimeout(resolve, 5000); }); }
    if (schemaCreated && syntheticTenantId) {
      const uploaded = await db.comparativoAnexo.findMany({ select: { storageKey: true } }).catch(() => []);
      const { s3 } = await import("../src/lib/s3");
      for (const a of uploaded) {
        assert.ok(a.storageKey.startsWith(`private/comparativos/${syntheticTenantId}/`));
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_DOCUMENTATION_BUCKET!, Key: a.storageKey }));
      }
      console.log("Anexos sintéticos removidos do storage privado.");
    }
    await db.$disconnect();
    if (schemaCreated) { await base.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); console.log("Schema de teste removido; tabelas públicas não foram alteradas."); }
    await base.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error && !e.name.startsWith("Prisma") ? e.message : `Falha na etapa ${stage}; código ${e.code ?? "unknown"}; código SQL ${e.meta?.code ?? "unknown"}; dados sensíveis omitidos.`); process.exitCode = 1; });
