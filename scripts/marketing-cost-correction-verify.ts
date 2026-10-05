import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";

loadDocumentationEnv();
const db = new PrismaClient(), schema = `cost_verify_${randomBytes(8).toString("hex")}`;
const rollback = new Error("EXPECTED_ROLLBACK");
let checks = 0;
async function main() {
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      for (const table of ["Tenant", "User", "MarketingCostRule", "MarketingAuditEvent", "MarketingDailyMetric"]) {
        // Clone structure only: never copy secrets, accounts or real business records.
        await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
      }
      const migration = readFileSync("prisma/migrations/20261005140000_marketing_cost_validity_correction/migration.sql", "utf8").replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "");
      await tx.$executeRawUnsafe(migration);
      await tx.$executeRawUnsafe(`CREATE TRIGGER preserve_cost BEFORE UPDATE OR DELETE ON "MarketingCostRule" FOR EACH ROW EXECUTE FUNCTION "${schema}".marketing_cost_rule_preserve()`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER preserve_audit BEFORE UPDATE OR DELETE ON "MarketingAuditEvent" FOR EACH ROW EXECUTE FUNCTION public.marketing_audit_immutable()`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER preserve_metric BEFORE UPDATE ON "MarketingDailyMetric" FOR EACH ROW EXECUTE FUNCTION public.marketing_metric_preserve()`);
      await tx.$executeRawUnsafe(`INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt") VALUES ('test-a', 'Synthetic', 'test-a', now()), ('test-b', 'Synthetic', 'test-b', now())`);
      await tx.$executeRawUnsafe(`INSERT INTO "User" ("id", "tenantId", "name", "email", "role", "updatedAt") VALUES ('owner', 'test-a', 'Synthetic owner', 'owner@example.test', 'OWNER', now()), ('director', 'test-a', 'Synthetic director', 'director@example.test', 'DIRECTOR', now()), ('foreign-owner', 'test-b', 'Synthetic foreign', 'foreign@example.test', 'OWNER', now())`);
      await tx.$executeRawUnsafe(`INSERT INTO "MarketingCostRule" ("id", "tenantId", "percentage", "validFrom", "createdById") VALUES ('rule', 'test-a', 12.15, '2026-10-05', 'owner')`);
      await tx.$executeRawUnsafe(`INSERT INTO "MarketingDailyMetric" ("id", "tenantId", "campaignId", "date", "metaSpend", "leads", "currency", "state", "costPercentage", "effectiveSpend", "sourceObservedAt", "syncedAt", "updatedAt", "impressions", "clicks", "linkClicks") VALUES ('metric', 'test-a', 'campaign', '2026-04-01', 5311.88, 100, 'BRL', 'CONFIRMED', 0, 5311.88, now(), now(), now(), 1000, 10, 5)`);
      const original = await tx.$queryRawUnsafe(`SELECT md5(to_jsonb(m)::text) AS hash FROM "MarketingDailyMetric" m`);
      const rejected = async (statement: string) => {
        await tx.$executeRawUnsafe("SAVEPOINT expected_failure");
        let blocked = false; try { await tx.$executeRawUnsafe(statement); } catch { blocked = true; }
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_failure");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_failure");
        assert.equal(blocked, true); checks++;
      };
      const change = `UPDATE "MarketingCostRule" SET "validFrom" = '2026-04-01' WHERE "id" = 'rule'`;
      await rejected(change);
      const record = (before: string, after: string, end: string | null = null) => ({ percentage: "12.15", before: { validFrom: before, validTo: end }, after: { validFrom: after, validTo: end, affectedFrom: before < after ? before : after, affectedTo: before < after ? after : before, reason: "Synthetic correction reason" } });
      const addAudit = async (id: string, actor: string, metadata: unknown) => tx.$executeRaw`INSERT INTO "MarketingAuditEvent" ("id", "tenantId", "actorId", "eventType", "entityId", "metadata") VALUES (${id}, 'test-a', ${actor}, 'COST_RULE_VALIDITY_CORRECTED', 'rule', ${JSON.stringify(metadata)}::jsonb)`;
      await addAudit("director-audit", "director", record("2026-10-05", "2026-04-01")); await rejected(change);
      await addAudit("foreign-audit", "foreign-owner", record("2026-10-05", "2026-04-01")); await rejected(change);
      await addAudit("wrong-audit", "owner", record("2026-10-05", "2026-03-01")); await rejected(change);
      await addAudit("owner-audit", "owner", record("2026-10-05", "2026-04-01"));
      await tx.$executeRawUnsafe(change); checks++;
      const audit = await tx.$queryRawUnsafe<{ actorId: string; createdAt: Date; metadata: unknown }[]>(`SELECT "actorId", "createdAt", "metadata" FROM "MarketingAuditEvent" WHERE "id" = 'owner-audit'`);
      assert.equal(audit[0].actorId, "owner"); assert.ok(audit[0].createdAt instanceof Date); assert.deepEqual(audit[0].metadata, record("2026-10-05", "2026-04-01")); checks++;
      const current = await tx.$queryRawUnsafe(`SELECT md5(to_jsonb(m)::text) AS hash FROM "MarketingDailyMetric" m`);
      assert.deepEqual(current, original); checks++;
      await rejected(`UPDATE "MarketingCostRule" SET "percentage" = 20 WHERE "id" = 'rule'`);
      await rejected(`DELETE FROM "MarketingCostRule" WHERE "id" = 'rule'`);
      await rejected(`UPDATE "MarketingAuditEvent" SET "metadata" = '{}' WHERE "id" = 'owner-audit'`);
      await rejected(`DELETE FROM "MarketingAuditEvent" WHERE "id" = 'owner-audit'`);
      await rejected(`UPDATE "MarketingDailyMetric" SET "costPercentage" = 12.15 WHERE "id" = 'metric'`);
      // The existing GiST constraint still rejects overlapping corrected intervals.
      await tx.$executeRawUnsafe(`INSERT INTO "MarketingCostRule" ("id", "tenantId", "percentage", "validFrom", "validTo", "createdById") VALUES ('previous', 'test-a', 10, '2026-03-01', '2026-04-01', 'owner')`);
      await addAudit("overlap-audit", "owner", record("2026-04-01", "2026-03-15"));
      await rejected(`UPDATE "MarketingCostRule" SET "validFrom" = '2026-03-15' WHERE "id" = 'rule'`);
      throw rollback;
    }, { timeout: 180000, maxWait: 10000 });
  } catch (error) { if (error !== rollback) throw error; }
  const remaining = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM information_schema.schemata WHERE schema_name = ${schema}`;
  assert.equal(remaining[0].count, 0n); checks++;
  console.log(JSON.stringify({ checks, isolatedSchemaRolledBack: true, externalCalls: 0, realRulesChanged: 0 }));
}
main().catch(error => { console.error(JSON.stringify({ verificationFailed: true, checksCompleted: checks, code: typeof error?.code === "string" ? error.code : "ASSERTION_OR_RUNTIME" })); process.exitCode = 1; }).finally(() => db.$disconnect());
