BEGIN;
-- A validity correction requires an immutable, matching OWNER audit in this transaction.
-- No metrics, snapshots, percentages or existing rules are changed by this migration.
CREATE OR REPLACE FUNCTION "marketing_cost_rule_preserve"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Marketing cost history cannot be deleted' USING ERRCODE = '23000'; END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."percentage" IS DISTINCT FROM OLD."percentage"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById" OR NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'Marketing cost history is immutable' USING ERRCODE = '23000';
  END IF;
  IF NEW."validFrom" IS DISTINCT FROM OLD."validFrom" AND NOT EXISTS (
    SELECT 1 FROM "MarketingAuditEvent" e JOIN "User" u ON u."id" = e."actorId" AND u."tenantId" = e."tenantId"
    JOIN "Tenant" t ON t."id" = e."tenantId"
    WHERE e."tenantId" = OLD."tenantId" AND e."entityId" = OLD."id" AND e."eventType" = 'COST_RULE_VALIDITY_CORRECTED'
      AND e.xmin::text::bigint = (txid_current() % 4294967296)
      AND u."role" = 'OWNER' AND u."isActive" AND NOT t."isPlatform"
      AND (e."metadata"->>'percentage')::numeric = OLD."percentage"
      AND e."metadata"#>>'{before,validFrom}' = OLD."validFrom"::text
      AND e."metadata"#>>'{after,validFrom}' = NEW."validFrom"::text
      AND (e."metadata"#>>'{before,validTo}') IS NOT DISTINCT FROM OLD."validTo"::text
      AND (e."metadata"#>>'{after,validTo}') IS NOT DISTINCT FROM NEW."validTo"::text
      AND e."metadata"#>>'{after,affectedFrom}' = LEAST(OLD."validFrom", NEW."validFrom")::text
      AND e."metadata"#>>'{after,affectedTo}' = GREATEST(OLD."validFrom", NEW."validFrom")::text
      AND length(btrim(e."metadata"#>>'{after,reason}')) BETWEEN 1 AND 1000
  ) THEN RAISE EXCEPTION 'Validity correction requires matching OWNER audit' USING ERRCODE = '23000'; END IF;
  RETURN NEW;
END;
$$;
COMMIT;
