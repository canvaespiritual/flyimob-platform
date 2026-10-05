import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";

loadDocumentationEnv();
const db = new PrismaClient();
const schema = `commercial_verify_${randomBytes(8).toString("hex")}`;
const rollback = new Error("EXPECTED_ROLLBACK");
let checks = 0;
async function main() {
  try {
    await db.$transaction(async tx => {
      // All DDL and fixture writes live in an isolated schema and always roll back.
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      for (const table of ["OperationPerson", "User", "FinancialParticipant", "CampaignBrokerAssignment", "DocumentationFolder"]) {
        await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
        await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."${table}" SELECT * FROM public."${table}"`);
      }
      const before = await tx.$queryRawUnsafe<{ count: bigint; hash: string | null }[]>(`SELECT count(*)::bigint AS count, md5(string_agg(to_jsonb(f)::text, '' ORDER BY "id")) AS hash FROM "${schema}"."DocumentationFolder" f`);
      const sql = readFileSync("prisma/migrations/20261005130000_commercial_responsibility/migration.sql", "utf8");
      // Prisma raw execution uses one statement; preserve the function body intact.
      const functionStart = sql.indexOf("CREATE OR REPLACE FUNCTION");
      for (const statement of sql.slice(0, functionStart).replace(/^BEGIN;\s*/, "").split(";").filter(s => s.trim())) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(sql.slice(functionStart).replace(/COMMIT;\s*$/, ""));
      const after = await tx.$queryRawUnsafe<{ count: bigint; hash: string | null }[]>(`SELECT count(*)::bigint AS count, md5(string_agg((to_jsonb(f) - 'responsiblePersonId')::text, '' ORDER BY "id")) AS hash FROM "${schema}"."DocumentationFolder" f`);
      assert.deepEqual(after, before); checks++;
      const missing = await tx.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint AS count FROM "${schema}"."DocumentationFolder" f JOIN "${schema}"."User" u ON u."tenantId" = f."tenantId" AND u."id" = f."brokerId" WHERE f."responsiblePersonId" IS DISTINCT FROM u."personId"`);
      assert.equal(missing[0].count, 0n); checks++;
      await tx.$executeRawUnsafe(`INSERT INTO "OperationPerson" ("id", "tenantId", "name", "operationalRole", "active", "updatedAt") VALUES ('test-director', 'test-operation', 'Synthetic director', 'DIRECTOR', true, now()), ('foreign-person', 'foreign-operation', 'Synthetic foreign', 'MANAGER', true, now())`);
      await tx.$executeRawUnsafe(`INSERT INTO "DocumentationFolder" ("id", "tenantId", "responsiblePersonId", "brokerId", "createdById", "updatedAt") VALUES ('test-folder', 'test-operation', 'test-director', NULL, 'synthetic-owner', now())`);
      checks++;
      await tx.$executeRawUnsafe(`UPDATE "OperationPerson" SET "active" = false, "operationalRole" = 'OTHER' WHERE "id" = 'test-director'`);
      const linked = await tx.$queryRawUnsafe<{ responsiblePersonId: string; brokerId: null }[]>(`SELECT "responsiblePersonId", "brokerId" FROM "DocumentationFolder" WHERE "id" = 'test-folder'`);
      assert.deepEqual(linked, [{ responsiblePersonId: "test-director", brokerId: null }]); checks++;
      for (const [label, statement] of [
        ["tenant isolation", `UPDATE "DocumentationFolder" SET "responsiblePersonId" = 'foreign-person' WHERE "id" = 'test-folder'`],
        ["required identity", `UPDATE "DocumentationFolder" SET "responsiblePersonId" = NULL WHERE "id" = 'test-folder'`],
        ["restricted deletion", `DELETE FROM "OperationPerson" WHERE "id" = 'test-director'`],
      ]) {
        await tx.$executeRawUnsafe("SAVEPOINT expected_failure");
        let rejected = false;
        try { await tx.$executeRawUnsafe(statement); } catch { rejected = true; }
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_failure");
        assert.equal(rejected, true, label); checks++;
      }
      await tx.$executeRawUnsafe(`CREATE TRIGGER participant_person_write BEFORE INSERT OR UPDATE OF "userId", "personId" ON "FinancialParticipant" FOR EACH ROW EXECUTE FUNCTION "${schema}".flyimob_participant_person()`);
      await tx.$executeRawUnsafe(`INSERT INTO "OperationPerson" ("id", "tenantId", "name", "operationalRole", "active", "updatedAt") VALUES ('test-target', 'test-operation', 'Synthetic login identity', 'DIRECTOR', true, now())`);
      await tx.$executeRawUnsafe(`INSERT INTO "User" ("id", "tenantId", "personId", "name", "email", "role", "updatedAt") VALUES ('test-user', 'test-operation', 'test-target', 'Synthetic user', 'commercial-verify@example.test', 'DIRECTOR', now())`);
      await tx.$executeRawUnsafe(`INSERT INTO "FinancialParticipant" ("id", "tenantId", "personId", "name", "updatedAt") VALUES ('test-participant', 'test-operation', 'test-director', 'Synthetic participant', now())`);
      await tx.$executeRawUnsafe(`INSERT INTO "CampaignBrokerAssignment" ("id", "tenantId", "campaignId", "personId", "validFrom", "createdById", "updatedAt") VALUES ('test-assignment', 'test-operation', 'test-campaign', 'test-director', '2026-10-01', 'synthetic-owner', now())`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialParticipant" SET "userId" = 'test-user' WHERE "id" = 'test-participant'`);
      const merged = await tx.$queryRawUnsafe<{ person: string; assignment: string; role: string }[]>(`SELECT f."responsiblePersonId" AS person, a."personId" AS assignment, p."operationalRole"::text AS role FROM "DocumentationFolder" f JOIN "CampaignBrokerAssignment" a ON a."id" = 'test-assignment' JOIN "OperationPerson" p ON p."id" = f."responsiblePersonId" WHERE f."id" = 'test-folder'`);
      assert.deepEqual(merged, [{ person: "test-target", assignment: "test-target", role: "DIRECTOR" }]); checks++;
      throw rollback;
    }, { timeout: 180000, maxWait: 10000 });
  } catch (error) { if (error !== rollback) throw error; }
  const schemas = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM information_schema.schemata WHERE schema_name = ${schema}`;
  assert.equal(schemas[0].count, 0n); checks++;
  console.log(JSON.stringify({ checks, isolatedSchemaRolledBack: true, externalCalls: 0 }));
}
main().catch(error => { console.error(JSON.stringify({ verificationFailed: true, checksCompleted: checks, code: typeof error?.code === "string" ? error.code : "ASSERTION_OR_RUNTIME" })); process.exitCode = 1; }).finally(() => db.$disconnect());
