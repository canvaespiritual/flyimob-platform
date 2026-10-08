BEGIN;
-- Existing personId remains the original economic funder. No historical row is updated.
ALTER TABLE "MarketingMoneyMovement"
 ADD COLUMN "beneficiaryPersonId" TEXT,
 ADD COLUMN "fundingNature" VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
 ADD COLUMN "fundingMovementId" TEXT;
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "marketing_movement_beneficiary_fkey"
 FOREIGN KEY ("tenantId","beneficiaryPersonId") REFERENCES "OperationPerson"("tenantId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "MarketingMoneyMovement_tenantId_fundingMovementId_fkey"
 FOREIGN KEY ("tenantId","fundingMovementId") REFERENCES "MarketingMoneyMovement"("tenantId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "marketing_movement_beneficiary_date_idx" ON "MarketingMoneyMovement"("tenantId","beneficiaryPersonId","effectiveDate");
CREATE INDEX "MarketingMoneyMovement_tenantId_fundingMovementId_idx" ON "MarketingMoneyMovement"("tenantId","fundingMovementId");
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "marketing_funding_values" CHECK (
 ("fundingNature"='STANDARD' AND "fundingMovementId" IS NULL AND (kind='CONTRIBUTION' OR "beneficiaryPersonId" IS NULL OR ("personId" IS NOT NULL AND "beneficiaryPersonId"="personId")))
 OR ("fundingNature"='RECOVERABLE' AND kind='CONTRIBUTION' AND origin='FLYIMOB' AND "beneficiaryPersonId" IS NOT NULL AND "fundingMovementId" IS NULL)
 OR ("fundingNature" IN ('SETTLEMENT_META','SETTLEMENT_EXTERNAL') AND kind='ADJUSTMENT' AND origin='PERSON'
  AND "adjustmentType"='COMPENSATION' AND "affectsPhysicalBalance"=false AND amount>0
  AND "beneficiaryPersonId" IS NOT NULL AND "beneficiaryPersonId"="personId" AND "fundingMovementId" IS NOT NULL AND "fundingMovementId"<>id)
);
-- Lock the parent to serialize competing settlements even outside the application.
-- Deferred check verifies final state, allowing cancellations in any transaction order.
CREATE FUNCTION "marketing_funding_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE funding_id TEXT; funding "MarketingMoneyMovement"%ROWTYPE; total NUMERIC;
BEGIN
 IF NEW."fundingMovementId" IS NULL AND NEW."fundingNature"<>'RECOVERABLE' THEN RETURN NEW; END IF;
 funding_id:=coalesce(NEW."fundingMovementId",NEW.id);
 SELECT * INTO funding FROM "MarketingMoneyMovement" WHERE "tenantId"=NEW."tenantId" AND id=funding_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Funding not found in operation' USING ERRCODE='23000'; END IF;
 IF EXISTS(SELECT 1 FROM "MarketingMoneyMovement" s WHERE s."tenantId"=funding."tenantId" AND s."fundingMovementId"=funding.id AND s.status<>'CANCELLED'
  AND (funding.status<>'CONFIRMED' OR funding."fundingNature"<>'RECOVERABLE' OR funding.origin<>'FLYIMOB'
   OR s."accountId"<>funding."accountId" OR s.currency<>funding.currency OR s."beneficiaryPersonId" IS DISTINCT FROM funding."beneficiaryPersonId"
   OR s."effectiveDate"<funding."effectiveDate"))
 THEN RAISE EXCEPTION 'Settlement requires confirmed matching historical funding' USING ERRCODE='23000'; END IF;
 SELECT coalesce(sum(s.amount),0) INTO total FROM "MarketingMoneyMovement" s WHERE s."tenantId"=funding."tenantId" AND s."fundingMovementId"=funding.id AND s.status<>'CANCELLED';
 IF total>funding.amount THEN RAISE EXCEPTION 'Funding recovery exceeds original principal' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER "MarketingMoneyMovement_funding_integrity" AFTER INSERT OR UPDATE ON "MarketingMoneyMovement"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "marketing_funding_integrity"();
COMMIT;
