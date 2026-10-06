BEGIN;
-- CreateTable
CREATE TABLE "MarketingMoneyMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "personId" TEXT,
    "kind" VARCHAR(20) NOT NULL,
    "origin" VARCHAR(20) NOT NULL,
    "adjustmentType" VARCHAR(30),
    "affectsPhysicalBalance" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "effectiveDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "note" VARCHAR(1000),
    "reason" VARCHAR(1000),
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingMoneyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingMoneyReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingMoneyReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "observationKey" VARCHAR(160) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "availableBalance" DECIMAL(18,2),
    "currency" CHAR(3) NOT NULL,
    "state" VARCHAR(30) NOT NULL,
    "fundingSourceId" VARCHAR(120),
    "fundingSourceType" INTEGER,
    "displayString" VARCHAR(1000),
    "safeErrorCode" VARCHAR(80),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingReconciliationMark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "tolerance" DECIMAL(18,2) NOT NULL DEFAULT 0.02,
    "note" VARCHAR(1000) NOT NULL,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingReconciliationMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingMoneyMovement_tenantId_accountId_effectiveDate_idx" ON "MarketingMoneyMovement"("tenantId", "accountId", "effectiveDate");

-- CreateIndex
CREATE INDEX "MarketingMoneyMovement_tenantId_personId_effectiveDate_idx" ON "MarketingMoneyMovement"("tenantId", "personId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingMoneyMovement_tenantId_id_key" ON "MarketingMoneyMovement"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingMoneyMovement_tenantId_idempotencyKey_key" ON "MarketingMoneyMovement"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingMoneyReceipt_storageKey_key" ON "MarketingMoneyReceipt"("storageKey");

-- CreateIndex
CREATE INDEX "MarketingMoneyReceipt_tenantId_movementId_idx" ON "MarketingMoneyReceipt"("tenantId", "movementId");

-- CreateIndex
CREATE INDEX "MarketingBalanceSnapshot_tenantId_accountId_observedAt_idx" ON "MarketingBalanceSnapshot"("tenantId", "accountId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBalanceSnapshot_tenantId_accountId_observationKey_key" ON "MarketingBalanceSnapshot"("tenantId", "accountId", "observationKey");

-- CreateIndex
CREATE INDEX "MarketingReconciliationMark_tenantId_accountId_effectiveAt_idx" ON "MarketingReconciliationMark"("tenantId", "accountId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingReconciliationMark_tenantId_idempotencyKey_key" ON "MarketingReconciliationMark"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "MarketingMoneyMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "MarketingMoneyMovement_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "MetaAdAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "MarketingMoneyMovement_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "OperationPerson"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "MarketingMoneyMovement_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMoneyReceipt" ADD CONSTRAINT "MarketingMoneyReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMoneyReceipt" ADD CONSTRAINT "MarketingMoneyReceipt_tenantId_movementId_fkey" FOREIGN KEY ("tenantId", "movementId") REFERENCES "MarketingMoneyMovement"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingMoneyReceipt" ADD CONSTRAINT "MarketingMoneyReceipt_tenantId_uploadedById_fkey" FOREIGN KEY ("tenantId", "uploadedById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBalanceSnapshot" ADD CONSTRAINT "MarketingBalanceSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBalanceSnapshot" ADD CONSTRAINT "MarketingBalanceSnapshot_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "MetaAdAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingReconciliationMark" ADD CONSTRAINT "MarketingReconciliationMark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingReconciliationMark" ADD CONSTRAINT "MarketingReconciliationMark_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "MetaAdAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingReconciliationMark" ADD CONSTRAINT "MarketingReconciliationMark_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingMoneyMovement" ADD CONSTRAINT "marketing_money_values" CHECK (
  kind IN ('CONTRIBUTION','ADJUSTMENT') AND origin IN ('PERSON','FLYIMOB','OTHER') AND status IN ('PENDING','CONFIRMED','CANCELLED')
  AND currency ~ '^[A-Z]{3}$' AND amount <> 'NaN'::numeric AND amount <> 0 AND version >= 0
  AND ((origin='PERSON' AND "personId" IS NOT NULL) OR (origin<>'PERSON' AND "personId" IS NULL))
  AND ((kind='CONTRIBUTION' AND "affectsPhysicalBalance"=true AND amount>0 AND "adjustmentType" IS NULL AND reason IS NULL)
    OR (kind='ADJUSTMENT' AND "adjustmentType" IS NOT NULL AND reason IS NOT NULL AND "adjustmentType" IN ('REFUND','PROMOTIONAL_CREDIT','CORRECTION','COMPENSATION','OTHER') AND length(trim(reason))>0))
);
ALTER TABLE "MarketingBalanceSnapshot" ADD CONSTRAINT "marketing_balance_values" CHECK (
  currency ~ '^[A-Z]{3}$' AND state IN ('AVAILABLE','UNSUPPORTED','UNAVAILABLE')
  AND ((state='AVAILABLE' AND "availableBalance" IS NOT NULL AND "availableBalance">=0 AND "availableBalance" <> 'NaN'::numeric AND "displayString" IS NOT NULL)
     OR (state<>'AVAILABLE' AND "availableBalance" IS NULL))
  AND jsonb_typeof(payload)='object'
);
ALTER TABLE "MarketingReconciliationMark" ADD CONSTRAINT "marketing_mark_values" CHECK ("openingBalance">=0 AND "openingBalance" <> 'NaN'::numeric AND tolerance <> 'NaN'::numeric AND tolerance BETWEEN 0 AND 1 AND currency ~ '^[A-Z]{3}$' AND length(trim(note))>0);
ALTER TABLE "MarketingMoneyReceipt" ADD CONSTRAINT "marketing_receipt_values" CHECK ("fileSize" BETWEEN 1 AND 15728640 AND checksum ~ '^[a-f0-9]{64}$');
CREATE FUNCTION "marketing_finance_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Marketing financial history is append-only' USING ERRCODE='23000';
END; $$;
CREATE TRIGGER "MarketingBalanceSnapshot_immutable" BEFORE UPDATE OR DELETE ON "MarketingBalanceSnapshot" FOR EACH ROW EXECUTE FUNCTION "marketing_finance_immutable"();
CREATE TRIGGER "MarketingReconciliationMark_immutable" BEFORE UPDATE OR DELETE ON "MarketingReconciliationMark" FOR EACH ROW EXECUTE FUNCTION "marketing_finance_immutable"();
CREATE TRIGGER "MarketingMoneyReceipt_immutable" BEFORE UPDATE OR DELETE ON "MarketingMoneyReceipt" FOR EACH ROW EXECUTE FUNCTION "marketing_finance_immutable"();
CREATE FUNCTION "marketing_money_preserve"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Money movements cannot be deleted' USING ERRCODE='23000'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedAt'])
 OR NEW.version<>OLD.version+1 OR NOT ((OLD.status='PENDING' AND NEW.status IN ('CONFIRMED','CANCELLED')) OR (OLD.status='CONFIRMED' AND NEW.status='CANCELLED'))
 OR NOT EXISTS (SELECT 1 FROM "MarketingAuditEvent" e JOIN "User" u ON u.id=e."actorId" AND u."tenantId"=e."tenantId"
 WHERE e."tenantId"=OLD."tenantId" AND e."entityId"=OLD.id AND e."eventType"='MARKETING_MONEY_STATUS_CHANGED' AND u.role='OWNER'
 AND e.metadata->'before'->>'status'=OLD.status AND e.metadata->'after'->>'status'=NEW.status
 AND (e.metadata->'before'->>'version')::int=OLD.version AND (e.metadata->'after'->>'version')::int=NEW.version
 AND length(trim(e.metadata->'after'->>'reason'))>0 AND e.xmin::text::bigint=(txid_current() % 4294967296))
 THEN RAISE EXCEPTION 'Money movement transition requires immutable payload and same-transaction OWNER audit' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "MarketingMoneyMovement_preserve" BEFORE UPDATE OR DELETE ON "MarketingMoneyMovement" FOR EACH ROW EXECUTE FUNCTION "marketing_money_preserve"();
CREATE FUNCTION "marketing_finance_currency"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "MetaAdAccount" a WHERE a.id=NEW."accountId" AND a."tenantId"=NEW."tenantId" AND a.currency=NEW.currency)
 THEN RAISE EXCEPTION 'Account currency mismatch' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "MarketingMoneyMovement_currency" BEFORE INSERT ON "MarketingMoneyMovement" FOR EACH ROW EXECUTE FUNCTION "marketing_finance_currency"();
CREATE TRIGGER "MarketingBalanceSnapshot_currency" BEFORE INSERT ON "MarketingBalanceSnapshot" FOR EACH ROW EXECUTE FUNCTION "marketing_finance_currency"();
CREATE TRIGGER "MarketingReconciliationMark_currency" BEFORE INSERT ON "MarketingReconciliationMark" FOR EACH ROW EXECUTE FUNCTION "marketing_finance_currency"();
CREATE FUNCTION "marketing_finance_creation_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_id TEXT; event_type TEXT; entity_id TEXT;
BEGIN
 IF TG_TABLE_NAME='MarketingMoneyReceipt' THEN actor_id:=NEW."uploadedById"; entity_id:=NEW."movementId"; event_type:='MARKETING_RECEIPT_ATTACHED';
 ELSIF TG_TABLE_NAME='MarketingMoneyMovement' THEN actor_id:=NEW."createdById"; entity_id:=NEW.id; event_type:='MARKETING_MONEY_CREATED';
 ELSE actor_id:=NEW."createdById"; entity_id:=NEW.id; event_type:='MARKETING_RECONCILIATION_MARK_CREATED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "MarketingAuditEvent" e JOIN "User" u ON u.id=e."actorId" AND u."tenantId"=e."tenantId"
 WHERE e."actorId"=actor_id AND e."tenantId"=NEW."tenantId" AND e."entityId"=entity_id AND e."eventType"=event_type AND u.role='OWNER'
 AND e.xmin::text::bigint=(txid_current() % 4294967296))
 THEN RAISE EXCEPTION 'Financial insert requires same-transaction OWNER audit' USING ERRCODE='23000'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER "MarketingMoneyMovement_creation_audit" AFTER INSERT ON "MarketingMoneyMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "marketing_finance_creation_audit"();
CREATE CONSTRAINT TRIGGER "MarketingMoneyReceipt_creation_audit" AFTER INSERT ON "MarketingMoneyReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "marketing_finance_creation_audit"();
CREATE CONSTRAINT TRIGGER "MarketingReconciliationMark_creation_audit" AFTER INSERT ON "MarketingReconciliationMark" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "marketing_finance_creation_audit"();
COMMIT;
