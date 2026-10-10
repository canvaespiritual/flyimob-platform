// Explicit read-only inventory. Never writes env files, credentials, users or enrollments.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { readFileSync, readdirSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const cli = join(process.env.APPDATA, 'npm/node_modules/@railway/cli/bin/railway.js');
function variables(project, service, environment) {
  const raw = execFileSync(process.execPath, [cli, 'variable', 'list', '-p', project, '-s', service, '-e', environment, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  return JSON.parse(raw);
}
async function readDatabase(app, dbVars, query) {
  const publicUrl = dbVars.DATABASE_PUBLIC_URL;
  if (!publicUrl) return { available: false, reason: 'no_existing_public_read_connection' };
  const appUrl = new URL(app.DATABASE_URL), privateUrl = new URL(dbVars.DATABASE_URL), remote = new URL(publicUrl);
  if (![privateUrl.hostname, remote.hostname].includes(appUrl.hostname) || appUrl.pathname !== privateUrl.pathname || appUrl.username !== privateUrl.username || appUrl.password !== privateUrl.password)
    return { available: false, reason: 'database_target_not_confirmed' };
  const db = new PrismaClient({ datasources: { db: { url: publicUrl } }, log: [] });
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'");
      return await query(tx);
    }, { timeout: 15000 });
  } finally { await db.$disconnect(); }
}
function migrationInventory(rows) {
  const root = join(process.cwd(), 'prisma/migrations');
  const local = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  const lineEndingOnly = [];
  const checksumMismatch = rows.filter(row => {
    if (!local.includes(row.migration_name)) return true;
    const script = readFileSync(join(root, row.migration_name, 'migration.sql'), 'utf8');
    const hash = text => createHash('sha256').update(text).digest('hex');
    if (hash(script) === row.checksum) return false;
    const lf = script.replace(/\r\n/g, '\n');
    if ([lf, lf.replace(/\n/g, '\r\n')].some(text => hash(text) === row.checksum)) { lineEndingOnly.push(row.migration_name); return false; }
    return true;
  }).map(row => row.migration_name);
  return { pending: local.filter(name => !rows.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at)), checksumMismatch, lineEndingOnly };
}
async function main() {
  const hProject = 'a9c574c7-2e2a-4f23-ba3a-09b42df2b0d2';
  const h = variables(hProject, '84f19bcd-a157-4f4d-92da-87ac04ee8492', 'production');
  console.log(JSON.stringify({ application: 'Horizonte', origin: h.APP_URL, integrationEnabled: h.INTEGRATIONS_ENABLED === 'true', mediaStorage: h.MEDIA_STORAGE, writes: 0 }));
  const hDb = variables(hProject, '035097e1-660b-47a1-a7d0-dd13628f1126', 'production');
  console.log(JSON.stringify({ application: 'Horizonte', inventory: await readDatabase(h, hDb, async tx => ({
    courses: await tx.$queryRawUnsafe(`SELECT c.id AS "courseId", c.title AS "courseTitle", c.published AS "coursePublished", m.id AS "moduleId", m.title AS "moduleTitle", m.position AS "modulePosition", l.id AS "lessonId", l.title AS "lessonTitle", l.position AS "lessonPosition", l.published AS "lessonPublished", l."videoSource", l."activeMediaId", a.state AS "mediaState", a.metadata AS "mediaMetadata" FROM "Course" c JOIN "Module" m ON m."courseId"=c.id JOIN "Lesson" l ON l."moduleId"=m.id LEFT JOIN "MediaAsset" a ON a.id=l."activeMediaId" WHERE c.title=$1 ORDER BY m.position,m.id,l.position,l.id`, 'Curso Iniciação Flyimob'),
    clients: await tx.$queryRawUnsafe('SELECT id,enabled,"allowedCourseIds" FROM "IntegrationClient"'),
  })) }));
  const f = variables('a214a6b3-5fae-491d-91c6-e9b194d2e857', 'b133c3a0-3c13-4a54-9c34-f3b229f1ff80', 'production');
  console.log(JSON.stringify({ application: 'Flyimob', origin: f.APP_URL, integrationEnabled: f.HORIZONTE_ENABLED === 'true', settingsPresent: ['HORIZONTE_ORIGIN', 'HORIZONTE_CLIENT_ID', 'HORIZONTE_PRIVATE_KEY', 'HORIZONTE_COURSE_IDS'].map(name => ({ name, configured: !!f[name] })), writes: 0 }));
  const fDb = variables('2dada5aa-4cd1-44ba-a48a-aa262a7e2892', 'b908224d-f38b-4a31-9bd2-ddf1f8104de9', 'production');
  console.log(JSON.stringify({ application: 'Flyimob', inventory: await readDatabase(f, fDb, async tx => ({
    trainingTable: await tx.$queryRawUnsafe(`SELECT to_regclass('public."TrainingAccess"')::text AS name`),
    userTenantUnique: await tx.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE tablename='User' AND indexname='User_tenantId_id_key'`),
    brokerCount: await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId" WHERE u.role='BROKER' AND u."isActive"=true AND t."isPlatform"=false`),
    migrations: migrationInventory(await tx.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at')),
    sessionColumn: await tx.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name='sessionVersion'`),
  })) }));
  for (const path of ['/api/health', '/api/v1/courses']) {
    const r = await fetch(new URL(path, h.APP_URL), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    console.log(JSON.stringify({ application: 'Horizonte', path, status: r.status, writes: 0 }));
  }
}
main().catch(() => { console.error('Read-only preflight failed; sensitive diagnostics suppressed.'); process.exitCode = 1; });
