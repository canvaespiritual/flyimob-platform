import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { loadDocumentationEnv } from "./documentacoes-env.mjs";
import { savePerson, enableAccess, people } from "../src/lib/team/service.server";
import { options, campaignList, overview } from "../src/lib/marketing/queries.server";
import { updateCampaign } from "../src/lib/marketing/admin.server";
import { storeDailyMetric } from "../src/lib/marketing/metrics.server";
import { type MarketingViewer } from "../src/lib/marketing/policy";

loadDocumentationEnv();
const marker = `team-qa-${randomUUID()}`;
const datasource = new URL(process.env.DATABASE_URL!);
if (process.argv.includes("--migration-rollback")) datasource.searchParams.set("schema", marker);
const db = new PrismaClient({ log: [], datasourceUrl: datasource.toString() });
const rollback = new Error("MANDATORY_TEAM_ROLLBACK"), checks: string[] = [];
globalThis.fetch = async () => { throw new Error("External calls forbidden in team verification"); };
function statements(sql: string) {
  const result: string[] = []; let start = 0, quote = "", dollar = false;
  const clean = sql.replace(/--[^\n]*/g, "");
  for (let i = 0; i < clean.length; i++) {
    if (!quote && clean.slice(i, i + 2) === "$$") { dollar = !dollar; i++; continue; }
    if (dollar) continue;
    if (quote) { if (clean[i] === quote) { if (clean[i + 1] === quote) i++; else quote = ""; } continue; }
    if (clean[i] === "'" || clean[i] === '"') { quote = clean[i]; continue; }
    if (clean[i] === ";") { const part = clean.slice(start, i).trim(); if (part) result.push(part); start = i + 1; }
  }
  if (clean.slice(start).trim()) result.push(clean.slice(start).trim()); return result;
}
async function baseline(tx: Prisma.TransactionClient) {
  const tables = ["User", "FinancialParticipant", "FinancialSale", "FinancialEntitlement", "FinancialPayment", "FinancialAdjustment", "FinancialSettlement", "FinancialParticipantAccount", "MarketingCampaign", "MarketingDailyMetric", "MarketingAdDailyMetric", "CampaignBrokerAssignment"];
  const hashes = [];
  for (const table of tables) hashes.push(await tx.$queryRawUnsafe<{ digest: string | null }[]>(`SELECT md5(string_agg((to_jsonb(t) - 'personId')::text, '' ORDER BY "id")) AS digest FROM "${table}" t`));
  return hashes;
}
async function main() {
  const migrationTest = process.argv.includes("--migration-rollback");
  try {
    await db.$transaction(async tx => {
      if (migrationTest) {
        // Rehearse against an isolated, transaction-local copy: originals are only read.
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${marker}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${marker}", public`);
        await tx.$executeRawUnsafe(`DO $$ DECLARE item record; col record; default_value text; shadow text := current_schema(); BEGIN
          -- Prisma qualifies enum casts with its datasource schema. Clone enum types too.
          FOR item IN SELECT t.typname, string_agg(quote_literal(e.enumlabel), ',' ORDER BY e.enumsortorder) AS labels
            FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
            WHERE n.nspname='public' GROUP BY t.typname LOOP
            EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', shadow, item.typname, item.labels);
          END LOOP;
          FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
            EXECUTE format('CREATE TABLE %I.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY)', shadow, item.tablename, item.tablename);
            FOR col IN SELECT a.attname, t.typname, pg_get_expr(d.adbin,d.adrelid) AS default_expr
              FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
              JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
              WHERE n.nspname='public' AND c.relname=item.tablename AND a.attnum>0 AND NOT a.attisdropped AND t.typtype='e' LOOP
              EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',shadow,item.tablename,col.attname);
              EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I USING %I::text::%I.%I',shadow,item.tablename,col.attname,shadow,col.typname,col.attname,shadow,col.typname);
              IF col.default_expr IS NOT NULL THEN
                EXECUTE 'SELECT (' || col.default_expr || ')::text' INTO default_value;
                EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %L::%I.%I',shadow,item.tablename,col.attname,default_value,shadow,col.typname);
              END IF;
            END LOOP;
            -- JSON conversion casts enum labels into the isolated schema's enum types.
            EXECUTE format('INSERT INTO %I.%I SELECT (json_populate_record(NULL::%I.%I, row_to_json(original))).* FROM public.%I original',shadow,item.tablename,shadow,item.tablename,item.tablename);
          END LOOP;
          FOR item IN SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
            EXECUTE replace(item.indexdef, 'public.', quote_ident(shadow) || '.');
          END LOOP;
          FOR item IN SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition
            FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND con.contype='c' LOOP
            EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',shadow,item.relname,item.conname,replace(item.definition,'public.',quote_ident(shadow)||'.'));
          END LOOP;
        END $$`);
        const before = await baseline(tx);
        for (const sql of statements(readFileSync("prisma/migrations/20261005120000_operation_people/migration.sql", "utf8"))) {
          if (!/^(BEGIN|COMMIT)$/i.test(sql)) await tx.$executeRawUnsafe(sql);
        }
        assert.deepEqual(await baseline(tx), before); checks.push("migration_preserves_all_existing_ids_and_business_values");
        const invalid = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "User" u LEFT JOIN "OperationPerson" p ON u."personId"=p."id" AND u."tenantId"=p."tenantId" WHERE p."id" IS NULL`;
        assert.equal(Number(invalid[0].count), 0); checks.push("backfill_all_users_have_scoped_identity");
        const unmatched = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "FinancialParticipant" f LEFT JOIN "User" u ON f."userId"=u."id" AND f."tenantId"=u."tenantId" WHERE f."personId" IS NULL OR (u."id" IS NOT NULL AND f."personId" <> u."personId")`;
        assert.equal(Number(unmatched[0].count), 0); checks.push("backfill_only_explicit_financial_user_links_deduplicate");
      }
      const adapter = Object.assign(Object.create(tx), { $transaction: async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => run(tx) }) as typeof db;
      await tx.tenant.create({ data: { id: marker, name: "Synthetic team", slug: marker } });
      await tx.tenant.create({ data: { id: `${marker}-foreign`, name: "Synthetic foreign", slug: `${marker}-foreign` } });
      const ownerUser = await tx.user.create({ data: { tenantId: marker, name: "Direction", email: `${marker}-owner@example.test`, role: "OWNER" } });
      const owner: MarketingViewer = { tenant: { id: marker, isPlatform: false }, user: { id: ownerUser.id, tenantId: marker, role: "OWNER" } };
      const participant = await tx.financialParticipant.create({ data: { tenantId: marker, name: "No login" } });
      assert.ok(participant.personId); assert.ok(ownerUser.personId); checks.push("legacy_create_flows_materialize_people");
      const beforeCount = await tx.operationPerson.count({ where: { tenantId: marker, mergedIntoId: null } });
      await savePerson(owner, null, { name: participant.name, email: null, operationalRole: "BROKER", active: true, participantId: participant.id }, adapter);
      assert.equal(await tx.operationPerson.count({ where: { tenantId: marker, mergedIntoId: null } }), beforeCount); checks.push("existing_participant_reused_no_duplicate");
      const choices = await options(owner, adapter);
      assert.equal(choices.brokers.filter(p => p.isActive).length, 2); checks.push("user_owner_without_financial_and_participant_without_login_eligible");
      const account = await tx.metaAdAccount.create({ data: { tenantId: marker, externalId: marker, name: "Synthetic", currency: "BRL", timezone: "America/Sao_Paulo" } });
      const campaign = await tx.marketingCampaign.create({ data: { tenantId: marker, accountId: account.id, externalId: marker, name: "Find me", sourceStatus: "PAUSED", effectiveStatus: "ACTIVE", purpose: "CLIENTES" } });
      await updateCampaign(owner, campaign.id, { version: 0, assignment: { personId: participant.personId, validFrom: "2026-10-01" } }, adapter);
      await updateCampaign(owner, campaign.id, { version: 1, assignment: { personId: ownerUser.personId, validFrom: "2026-10-15" } }, adapter);
      const assignments = await tx.campaignBrokerAssignment.findMany({ where: { tenantId: marker }, orderBy: { validFrom: "asc" } });
      assert.equal(assignments[0].brokerId, null); assert.equal(assignments[0].validTo?.toISOString().slice(0, 10), "2026-10-15");
      assert.equal(assignments[1].personId, ownerUser.personId); checks.push("responsible_change_preserves_exclusive_validity_without_login");
      for (const date of ["2026-10-14", "2026-10-15"]) await storeDailyMetric(marker, campaign.id, { date, metaSpend: "10", leads: 1, currency: "BRL", sourceObservedAt: new Date() }, adapter);
      const report = await overview(owner, new URLSearchParams("period=custom&from=2026-10-14&to=2026-10-15"), adapter);
      assert.equal(report.brokers.length, 2); assert.equal(report.brokers.find(p => p.id === participant.personId)?.metaSpend, "10.00"); checks.push("daily_consolidation_uses_historical_responsible");
      await tx.marketingCampaign.createMany({ data: ["PAUSED", "ARCHIVED"].map(status => ({ tenantId: marker, accountId: account.id, externalId: status, name: `Find me ${status}`, effectiveStatus: status })) });
      const all = await campaignList(owner, new URLSearchParams("metaStatus=ALL"), adapter);
      assert.deepEqual(all.items.map(c => c.effectiveStatus), ["ACTIVE", "PAUSED", "ARCHIVED"]); checks.push("meta_order_active_paused_other_before_pagination");
      assert.equal((await campaignList(owner, new URLSearchParams(), adapter)).total, 1);
      assert.equal((await campaignList(owner, new URLSearchParams("metaStatus=PAUSED"), adapter)).total, 1);
      assert.equal((await campaignList(owner, new URLSearchParams("metaStatus=OTHER"), adapter)).total, 1);
      assert.equal((await campaignList(owner, new URLSearchParams("q=Find"), adapter)).total, 3); checks.push("meta_filters_and_search_independent_from_default_active");
      const filterCampaign = await tx.marketingCampaign.create({ data: { tenantId: marker, accountId: account.id, externalId: "current-filter", name: "Current filter", effectiveStatus: "ACTIVE" } });
      await updateCampaign(owner, filterCampaign.id, { version: 0, assignment: { personId: participant.personId, validFrom: "2000-01-01" } }, adapter);
      await updateCampaign(owner, filterCampaign.id, { version: 1, assignment: { personId: ownerUser.personId, validFrom: "2999-01-01" } }, adapter);
      assert.equal((await campaignList(owner, new URLSearchParams(`q=Current&brokerId=${participant.personId}`), adapter)).total, 1);
      assert.equal((await campaignList(owner, new URLSearchParams(`q=Current&brokerId=${ownerUser.personId}`), adapter)).total, 0); checks.push("current_responsible_filter_ignores_future_assignment");
      await tx.marketingCampaign.createMany({ data: [
        { tenantId: marker, accountId: account.id, externalId: "fallback", name: "State fallback", sourceStatus: "ACTIVE" },
        { tenantId: marker, accountId: account.id, externalId: "unknown", name: "State unknown" },
        { tenantId: marker, accountId: account.id, externalId: "inherited", name: "State inherited", sourceStatus: "ACTIVE", effectiveStatus: "CAMPAIGN_PAUSED" },
      ] });
      assert.equal((await campaignList(owner, new URLSearchParams("q=State&metaStatus=ACTIVE"), adapter)).total, 1);
      assert.equal((await campaignList(owner, new URLSearchParams("q=State&metaStatus=OTHER"), adapter)).total, 2); checks.push("null_source_fallback_and_unknown_effective_states_partition_correctly");
      await updateCampaign(owner, campaign.id, { version: 2, trackingStatus: "ARCHIVED" }, adapter);
      assert.equal((await campaignList(owner, new URLSearchParams(), adapter)).items.find(c => c.id === campaign.id)?.trackingStatus, "ARCHIVED"); checks.push("meta_active_independent_of_internal_archived");
      const otherUser = await tx.user.create({ data: { tenantId: marker, name: "Linked explicitly", email: `${marker}-linked@example.test`, role: "DIRECTOR" } });
      const identity = await savePerson(owner, otherUser.personId, { name: "Linked identity", email: null, operationalRole: "DIRECTOR", active: true, participantId: participant.id, userId: otherUser.id }, adapter);
      const updatedParticipant = await tx.financialParticipant.findUniqueOrThrow({ where: { id: participant.id } });
      assert.equal(updatedParticipant.userId, otherUser.id); assert.equal(updatedParticipant.personId, identity.id);
      assert.equal((await tx.campaignBrokerAssignment.findUniqueOrThrow({ where: { id: assignments[0].id } })).personId, identity.id);
      assert.equal((await people(marker, adapter)).filter(p => p.financialParticipant?.id === participant.id || p.user?.id === otherUser.id).length, 1); checks.push("manual_link_deduplicates_and_preserves_assignment_ids");
      const legacyParticipant = await tx.financialParticipant.create({ data: { tenantId: marker, name: "Legacy explicit link" } });
      const legacyUser = await tx.user.create({ data: { tenantId: marker, name: "Legacy user", email: `${marker}-legacy@example.test`, role: "BROKER", isActive: false } });
      await tx.financialParticipant.update({ where: { id: legacyParticipant.id }, data: { userId: legacyUser.id } });
      assert.equal((await tx.financialParticipant.findUniqueOrThrow({ where: { id: legacyParticipant.id } })).personId, legacyUser.personId);
      assert.equal((await tx.operationPerson.findUniqueOrThrow({ where: { id: legacyParticipant.personId! } })).mergedIntoId, legacyUser.personId); checks.push("legacy_financial_explicit_link_uses_same_identity_union");
      assert.equal((await options(owner, adapter)).brokers.find(p => p.id === legacyUser.personId)?.isActive, true); checks.push("active_financial_identity_eligible_despite_inactive_login");
      const inactive = await tx.financialParticipant.create({ data: { tenantId: marker, name: "Inactive", active: false } });
      const inactiveUser = await tx.user.create({ data: { tenantId: marker, name: "Inactive access", email: `${marker}-inactive@example.test`, isActive: false } });
      const activeOnly = (await options(owner, adapter)).brokers.filter(p => p.isActive);
      assert.equal(activeOnly.some(p => p.id === inactive.personId || p.id === inactiveUser.personId), false); checks.push("inactive_sources_not_eligible");
      await assert.rejects(savePerson({ ...owner, user: { ...owner.user, role: "DIRECTOR" } }, null, {}, adapter), /OWNER/);
      const foreign = await tx.user.create({ data: { tenantId: `${marker}-foreign`, name: "Foreign", email: `${marker}-foreign@example.test` } });
      await assert.rejects(savePerson(owner, null, { name: "Wrong", email: null, operationalRole: "OTHER", active: true, userId: foreign.id }, adapter), /fora/); checks.push("owner_only_and_cross_tenant_link_rejected");
      const newPerson = await savePerson(owner, null, { name: "Independent", email: null, operationalRole: "PARTNER", active: true }, adapter);
      assert.equal((await people(marker, adapter)).find(p => p.id === newPerson.id)?.eligible, true); checks.push("independent_person_no_financial_or_login");
      const access = await enableAccess(owner, newPerson.id, { email: `${marker}-new@example.test`, systemRole: "BROKER" }, adapter);
      const newUser = await tx.user.findFirstOrThrow({ where: { tenantId: marker, personId: newPerson.id } });
      assert.equal(newUser.passwordHash, null);
      const token = await tx.passwordResetToken.findFirstOrThrow({ where: { userId: newUser.id } });
      assert.equal(access.path, `/reset-password/${token.token}`); assert.equal(token.token.length, 64); assert.ok(token.expiresAt.getTime() > Date.now());
      await enableAccess(owner, newPerson.id, { email: newUser.email, systemRole: "BROKER" }, adapter);
      assert.equal(await tx.passwordResetToken.count({ where: { userId: newUser.id, usedAt: null } }), 1); checks.push("first_access_no_plain_password_one_expiring_active_token");
      assert.equal(await tx.marketingDailyMetric.count({ where: { tenantId: marker } }), 2); checks.push("historical_metrics_unchanged_after_linking");
      throw rollback;
    }, { timeout: 300000, maxWait: 10000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) { if (error !== rollback) throw error; }
  const fixtures = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM public."Tenant" WHERE "id" LIKE ${`${marker}%`}`;
  assert.equal(Number(fixtures[0].count), 0);
  if (migrationTest) { const schema = await db.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=${marker}) AS exists`; assert.equal(schema[0].exists, false); }
  console.log(JSON.stringify({ passed: checks.length, checks, rolledBack: true, externalCalls: 0 }));
}
main().catch(error => { console.error(JSON.stringify({ failed: true, name: error?.name, code: error?.code, lastCheck: checks.at(-1),
  missingType: /type.*does not exist/i.test(error?.message ?? ""), databaseCode: /code: "(\w+)"/.exec(error?.message ?? "")?.[1],
  message: error instanceof assert.AssertionError ? error.message : "Verification failed; no secrets printed" })); process.exitCode = 1; }).finally(() => db.$disconnect());
