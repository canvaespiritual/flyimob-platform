BEGIN;
-- Append-only extension of the same ledger. No historical payload is updated.
ALTER TABLE "MarketingMoneyMovement" ADD COLUMN "distributionMovementId" TEXT,
 ADD COLUMN "externalReference" VARCHAR(200), ADD COLUMN "recoveryMethod" VARCHAR(30);
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "MarketingMoneyMovement_tenantId_distributionMovementId_fkey"
 FOREIGN KEY ("tenantId","distributionMovementId") REFERENCES "MarketingMoneyMovement"("tenantId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MarketingMoneyMovement_tenantId_distributionMovementId_idx" ON "MarketingMoneyMovement"("tenantId","distributionMovementId");
ALTER TABLE "MarketingMoneyMovement" DROP CONSTRAINT "marketing_funding_values";
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "marketing_funding_values" CHECK (
 ("fundingNature"='STANDARD' AND "fundingMovementId" IS NULL AND "distributionMovementId" IS NULL AND (kind='CONTRIBUTION' OR "beneficiaryPersonId" IS NULL OR ("personId" IS NOT NULL AND "beneficiaryPersonId"="personId")))
 OR ("fundingNature" IN ('GLOBAL','RECOMPOSE_CASH') AND kind='CONTRIBUTION' AND "beneficiaryPersonId" IS NULL AND "fundingMovementId" IS NULL AND "distributionMovementId" IS NULL AND ("fundingNature"='GLOBAL' OR (origin='FLYIMOB' AND coalesce("externalReference" ~ '^campaign:[^[:space:]:]+$',false))))
 OR ("fundingNature" IN ('RECOVERABLE','BONUS') AND kind='CONTRIBUTION' AND origin='FLYIMOB' AND "beneficiaryPersonId" IS NOT NULL AND "fundingMovementId" IS NULL AND "distributionMovementId" IS NULL)
 OR ("fundingNature" IN ('ALLOCATION','ALLOCATION_LOAN','ALLOCATION_BONUS','RECOMPOSE_LOAN','RECOMPOSE_BONUS') AND kind='ADJUSTMENT' AND "adjustmentType"='COMPENSATION' AND NOT "affectsPhysicalBalance" AND amount>0 AND "fundingMovementId" IS NULL AND "distributionMovementId" IS NOT NULL AND "distributionMovementId"<>id AND coalesce(length(trim(reason)),0)>0
  AND ("fundingNature"='ALLOCATION' OR (origin='FLYIMOB' AND "beneficiaryPersonId" IS NOT NULL)) AND ("fundingNature" NOT IN ('RECOMPOSE_LOAN','RECOMPOSE_BONUS') OR coalesce("externalReference" ~ '^campaign:[^[:space:]:]+$',false)))
 OR ("fundingNature" IN ('SETTLEMENT_META','SETTLEMENT_EXTERNAL','SETTLEMENT_BONUS','SETTLEMENT_LOSS') AND kind='ADJUSTMENT' AND origin='PERSON' AND "adjustmentType"='COMPENSATION' AND NOT "affectsPhysicalBalance" AND amount>0 AND "beneficiaryPersonId" IS NOT NULL AND "beneficiaryPersonId"="personId" AND "fundingMovementId" IS NOT NULL AND "fundingMovementId"<>id AND "distributionMovementId" IS NULL AND coalesce(length(trim(reason)),0)>0)
);
-- Optional references preserve compatibility. New external recoveries validate their method in the API.
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "marketing_recovery_method" CHECK ("recoveryMethod" IS NULL OR ("fundingNature"='SETTLEMENT_EXTERNAL' AND "recoveryMethod" IN ('PAYMENT','COMMISSION','OTHER') AND coalesce(length(trim("externalReference")),0)>0));
CREATE OR REPLACE FUNCTION "marketing_funding_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE funding_id TEXT; funding "MarketingMoneyMovement"%ROWTYPE; total NUMERIC;
BEGIN
 IF NEW."fundingMovementId" IS NULL AND NEW."fundingNature" NOT IN ('RECOVERABLE','ALLOCATION_LOAN','RECOMPOSE_LOAN') THEN RETURN NEW; END IF;
 funding_id:=coalesce(NEW."fundingMovementId",NEW.id);
 SELECT * INTO funding FROM "MarketingMoneyMovement" WHERE "tenantId"=NEW."tenantId" AND id=funding_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Funding not found in operation' USING ERRCODE='23000'; END IF;
 IF EXISTS(SELECT 1 FROM "MarketingMoneyMovement" s WHERE s."tenantId"=funding."tenantId" AND s."fundingMovementId"=funding.id AND s.status<>'CANCELLED'
  AND (funding.status<>'CONFIRMED' OR funding."fundingNature" NOT IN ('RECOVERABLE','ALLOCATION_LOAN','RECOMPOSE_LOAN') OR funding.origin<>'FLYIMOB'
   OR s."accountId"<>funding."accountId" OR s.currency<>funding.currency OR s."beneficiaryPersonId" IS DISTINCT FROM funding."beneficiaryPersonId" OR s."effectiveDate"<funding."effectiveDate"))
 THEN RAISE EXCEPTION 'Settlement requires confirmed matching historical funding' USING ERRCODE='23000'; END IF;
 SELECT coalesce(sum(s.amount),0) INTO total FROM "MarketingMoneyMovement" s WHERE s."tenantId"=funding."tenantId" AND s."fundingMovementId"=funding.id AND s.status<>'CANCELLED';
 IF total>funding.amount THEN RAISE EXCEPTION 'Funding recovery exceeds original principal' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION "marketing_distribution_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id TEXT; parent "MarketingMoneyMovement"%ROWTYPE; total NUMERIC;
BEGIN
 IF NEW."distributionMovementId" IS NULL AND NEW.kind<>'CONTRIBUTION' THEN RETURN NEW; END IF;
 parent_id:=coalesce(NEW."distributionMovementId",NEW.id);
 SELECT * INTO parent FROM "MarketingMoneyMovement" WHERE "tenantId"=NEW."tenantId" AND id=parent_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM "MarketingMoneyMovement" s WHERE s."tenantId"=parent."tenantId" AND s."distributionMovementId"=parent.id AND s.status<>'CANCELLED'
 AND (parent.status<>'CONFIRMED' OR parent.kind<>'CONTRIBUTION' OR parent."beneficiaryPersonId" IS NOT NULL
 OR parent."fundingNature" NOT IN ('GLOBAL','RECOMPOSE_CASH','STANDARD') OR (parent."fundingNature"='STANDARD' AND parent.origin<>'FLYIMOB')
 OR s."accountId"<>parent."accountId" OR s.currency<>parent.currency OR s.origin<>parent.origin OR s."personId" IS DISTINCT FROM parent."personId" OR s."effectiveDate"<parent."effectiveDate" OR (parent."fundingNature"='RECOMPOSE_CASH' AND s."fundingNature" NOT IN ('RECOMPOSE_LOAN','RECOMPOSE_BONUS'))))
 THEN RAISE EXCEPTION 'Distribution requires confirmed matching unallocated contribution' USING ERRCODE='23000'; END IF;
 SELECT coalesce(sum(s.amount),0) INTO total FROM "MarketingMoneyMovement" s WHERE s."tenantId"=parent."tenantId" AND s."distributionMovementId"=parent.id AND s.status<>'CANCELLED';
 IF total>parent.amount THEN RAISE EXCEPTION 'Distributions exceed physical contribution' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER "MarketingMoneyMovement_distribution_integrity" AFTER INSERT OR UPDATE ON "MarketingMoneyMovement"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "marketing_distribution_integrity"();
COMMIT;
