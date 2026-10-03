import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");
function databaseValue(path) {
  if (!existsSync(path)) return null;
  const match = readFileSync(path, "utf8").match(/^DATABASE_URL\s*=\s*(.*)$/m);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
}
loadEnvConfig(process.cwd());
const configured = process.env.DATABASE_URL;
const env = databaseValue(".env"), local = databaseValue(".env.local");
console.log(JSON.stringify({ envAndLocalSame: !local || env === local,
  appAndPrismaEnvSame: configured === env, classification: process.argv.includes("--production-confirmed") ? "PRODUCTION_CONFIRMED_BY_OPERATOR" : "UNCONFIRMED_RAILWAY_ENVIRONMENT" }));
const db = new PrismaClient({ datasources: { db: { url: configured } } });
try {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const migrations = await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
    const localNames = readdirSync("prisma/migrations").filter(name => existsSync(`prisma/migrations/${name}/migration.sql`));
    const checksums = migrations.map(row => ({ name: row.migration_name,
      finished: !!row.finished_at, rolledBack: !!row.rolled_back_at,
      localChecksumMatches: localNames.includes(row.migration_name) && createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex") === row.checksum,
      normalizedLFMatches: localNames.includes(row.migration_name) && createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`, "utf8").replace(/\r\n/g, "\n")).digest("hex") === row.checksum }));
    const tables = await tx.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'Documentation%' ORDER BY table_name");
    const columns = await tx.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='sessionVersion'");
    const roles = await tx.$queryRawUnsafe("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid WHERE typname='UserRole' AND enumlabel='CORRESPONDENTE'");
    return { checksums, pending: localNames.filter(name => !migrations.some(row => row.migration_name === name && row.finished_at && !row.rolled_back_at)),
      unknownApplied: migrations.filter(row => !localNames.includes(row.migration_name)).map(row => row.migration_name),
      documentationTables: tables.map(row => row.table_name), sessionVersionPresent: columns.length === 1, correspondentRolePresent: roles.length === 1 };
  });
  console.log(JSON.stringify(result, null, 2));
} catch { console.error("Read-only inspection failed; no migration or data change attempted."); process.exitCode = 1; }
finally { await db.$disconnect(); }
