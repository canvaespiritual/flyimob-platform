import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";

// Feed `railway variables --json` through stdin. Never print remote variables or connection URLs.
loadDocumentationEnv();
const expected = ["20261014150000_comparativo_direcionamento"];
const hash = value => createHash("sha256").update(value).digest("hex");
const fingerprint = value => { const url = new URL(value); return hash([url.username, url.password, url.pathname].join("\n")); };
let db;
try {
  const remote = JSON.parse(readFileSync(0, "utf8"));
  if (remote.RAILWAY_PROJECT_ID !== "a214a6b3-5fae-491d-91c6-e9b194d2e857" || remote.RAILWAY_SERVICE_ID !== "b133c3a0-3c13-4a54-9c34-f3b229f1ff80" || remote.RAILWAY_ENVIRONMENT_NAME !== "production") throw new Error("O alvo Railway não corresponde à Flyimob de produção.");
  if (!remote.DATABASE_URL || !process.env.DATABASE_URL || fingerprint(remote.DATABASE_URL) !== fingerprint(process.env.DATABASE_URL)) throw new Error("A conexão local não corresponde ao banco usado pelo serviço publicado.");
  console.log("Alvo e identidade da conexão conferidos com o serviço Flyimob de produção (sem expor variáveis).");
  if (!remote.OPENAI_API_KEY || !remote.OPENAI_COMPARATIVOS_MODEL || !remote.AWS_S3_DOCUMENTATION_BUCKET) throw new Error("A integração não está configurada no serviço publicado.");
  db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const applied = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
  }, { timeout: 45000, maxWait: 10000 });
  const active = applied.filter(row => !row.rolled_back_at);
  if (active.some(row => !row.finished_at)) throw new Error("Existe migration não concluída; publicação interrompida.");
  const local = readdirSync("prisma/migrations", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const row of active) {
    if (!local.includes(row.migration_name)) throw new Error(`Migration remota desconhecida: ${row.migration_name}`);
    const sql = readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`, "utf8");
    if (![hash(sql), hash(sql.replace(/\r\n/g, "\n")), hash(sql.replace(/\r?\n/g, "\r\n"))].includes(row.checksum)) throw new Error(`Checksum divergente: ${row.migration_name}`);
  }
  const pending = local.filter(name => !active.some(row => row.migration_name === name));
  console.log(JSON.stringify({ applied: active.length, pending }));
  if (pending.some(name => !expected.includes(name))) throw new Error("Há migrations pendentes fora desta entrega.");
  if (process.argv.includes("--apply") && pending.length) {
    const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit", env: process.env });
    if (result.status !== 0) throw new Error("Migration não concluída com sucesso.");
  }
  if (!pending.length || process.argv.includes("--apply")) {
    const columns = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Comparativo' AND column_name = 'modoDirecionamento'`);
    const constraints = await db.$queryRawUnsafe(`SELECT conname, convalidated FROM pg_constraint WHERE conrelid = to_regclass('public."ComparativoAnexo"')`);
    if (!columns.length || constraints.length !== 3 || constraints.some(item => !item.convalidated)) throw new Error("Estrutura do comparativo não passou na verificação de coluna/FKs/PK.");
    const remaining = await db.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    if (local.some(name => !remaining.some(row => row.migration_name === name))) throw new Error("Ainda há migrations pendentes.");
    console.log("Migration de comparativos aplicada e estrutura validada.");
  }
} catch (error) {
  // Suppress connection/Prisma messages which can contain credentials or query parameters.
  console.error(error?.name?.startsWith("Prisma") || error instanceof SyntaxError || error instanceof TypeError ? `Falha na verificação (${error?.code ?? error?.name ?? "unknown"}); detalhes sensíveis omitidos.` : error.message);
  process.exitCode = 1;
} finally { if (db) await db.$disconnect(); }
