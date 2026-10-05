BEGIN;

-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'AUTHORIZED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "MarketingTrackingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingPurpose" AS ENUM ('CLIENTES', 'RECRUTAMENTO', 'INSTITUCIONAL_OUTRO', 'NAO_CLASSIFICADA');

-- CreateEnum
CREATE TYPE "MarketingMetricState" AS ENUM ('CONFIRMED', 'MISSING', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalAuthorizationId" TEXT,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "authorizedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "safeErrorCode" VARCHAR(80),
    "credentialCiphertext" BYTEA,
    "credentialNonce" BYTEA,
    "credentialAuthTag" BYTEA,
    "credentialKeyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "businessExternalId" VARCHAR(120),
    "businessName" TEXT,
    "status" "MarketingTrackingStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaConnectionAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "accessible" BOOLEAN NOT NULL DEFAULT true,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnectionAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "name" TEXT NOT NULL,
    "sourceStatus" VARCHAR(40),
    "trackingStatus" "MarketingTrackingStatus" NOT NULL DEFAULT 'ACTIVE',
    "purpose" "MarketingPurpose" NOT NULL DEFAULT 'NAO_CLASSIFICADA',
    "version" INTEGER NOT NULL DEFAULT 0,
    "sourceCreatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBrokerAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdById" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBrokerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCostRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "percentage" DECIMAL(10,6) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingCostRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingDailyMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metaSpend" DECIMAL(18,2),
    "leads" INTEGER,
    "currency" CHAR(3) NOT NULL,
    "state" "MarketingMetricState" NOT NULL DEFAULT 'MISSING',
    "costRuleId" TEXT,
    "costPercentage" DECIMAL(10,6),
    "effectiveSpend" DECIMAL(18,2),
    "sourceObservedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "syncRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "MarketingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "safeErrorCode" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaConnection_tenantId_status_idx" ON "MetaConnection"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_tenantId_id_key" ON "MetaConnection"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_tenantId_id_key" ON "MetaAdAccount"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_tenantId_externalId_key" ON "MetaAdAccount"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "MetaConnectionAccount_tenantId_accountId_idx" ON "MetaConnectionAccount"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnectionAccount_tenantId_connectionId_accountId_key" ON "MetaConnectionAccount"("tenantId", "connectionId", "accountId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_trackingStatus_purpose_idx" ON "MarketingCampaign"("tenantId", "trackingStatus", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_tenantId_id_key" ON "MarketingCampaign"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_tenantId_accountId_externalId_key" ON "MarketingCampaign"("tenantId", "accountId", "externalId");

-- CreateIndex
CREATE INDEX "CampaignBrokerAssignment_tenantId_campaignId_validFrom_idx" ON "CampaignBrokerAssignment"("tenantId", "campaignId", "validFrom");

-- CreateIndex
CREATE INDEX "CampaignBrokerAssignment_tenantId_brokerId_validFrom_validT_idx" ON "CampaignBrokerAssignment"("tenantId", "brokerId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCostRule_tenantId_id_key" ON "MarketingCostRule"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCostRule_tenantId_validFrom_key" ON "MarketingCostRule"("tenantId", "validFrom");

-- CreateIndex
CREATE INDEX "MarketingDailyMetric_tenantId_date_state_idx" ON "MarketingDailyMetric"("tenantId", "date", "state");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDailyMetric_tenantId_campaignId_date_key" ON "MarketingDailyMetric"("tenantId", "campaignId", "date");

-- CreateIndex
CREATE INDEX "MarketingSyncRun_status_nextAttemptAt_idx" ON "MarketingSyncRun"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSyncRun_tenantId_id_key" ON "MarketingSyncRun"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSyncRun_tenantId_accountId_idempotencyKey_key" ON "MarketingSyncRun"("tenantId", "accountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingAuditEvent_tenantId_createdAt_idx" ON "MarketingAuditEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnectionAccount" ADD CONSTRAINT "MetaConnectionAccount_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "MetaConnection"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnectionAccount" ADD CONSTRAINT "MetaConnectionAccount_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "MetaAdAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "MetaAdAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "CampaignBrokerAssignment_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "MarketingCampaign"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "CampaignBrokerAssignment_tenantId_brokerId_fkey" FOREIGN KEY ("tenantId", "brokerId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "CampaignBrokerAssignment_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCostRule" ADD CONSTRAINT "MarketingCostRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCostRule" ADD CONSTRAINT "MarketingCostRule_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDailyMetric" ADD CONSTRAINT "MarketingDailyMetric_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "MarketingCampaign"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDailyMetric" ADD CONSTRAINT "MarketingDailyMetric_tenantId_costRuleId_fkey" FOREIGN KEY ("tenantId", "costRuleId") REFERENCES "MarketingCostRule"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDailyMetric" ADD CONSTRAINT "MarketingDailyMetric_tenantId_syncRunId_fkey" FOREIGN KEY ("tenantId", "syncRunId") REFERENCES "MarketingSyncRun"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSyncRun" ADD CONSTRAINT "MarketingSyncRun_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "MetaConnection"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSyncRun" ADD CONSTRAINT "MarketingSyncRun_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "MetaAdAccount"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAuditEvent" ADD CONSTRAINT "MarketingAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAuditEvent" ADD CONSTRAINT "MarketingAuditEvent_tenantId_actorId_fkey" FOREIGN KEY ("tenantId", "actorId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Additional invariants: only new Marketing tables are changed.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "Marketing_assignment_dates" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "Marketing_assignment_no_overlap"
  EXCLUDE USING gist ("tenantId" WITH =, "campaignId" WITH =, daterange("validFrom", "validTo", '[)') WITH &&)
  WHERE ("cancelledAt" IS NULL);
ALTER TABLE "MarketingCostRule" ADD CONSTRAINT "Marketing_cost_dates" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "MarketingCostRule" ADD CONSTRAINT "Marketing_cost_percentage" CHECK ("percentage" >= 0 AND "percentage" <= 1000);
ALTER TABLE "MarketingCostRule" ADD CONSTRAINT "Marketing_cost_no_overlap"
  EXCLUDE USING gist ("tenantId" WITH =, daterange("validFrom", "validTo", '[)') WITH &&);
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "Marketing_campaign_version" CHECK ("version" >= 0);
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "Marketing_account_currency" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "MetaConnection" ADD CONSTRAINT "Marketing_credential_envelope" CHECK (
  ("credentialCiphertext" IS NULL AND "credentialNonce" IS NULL AND "credentialAuthTag" IS NULL AND "credentialKeyVersion" IS NULL)
  OR ("credentialCiphertext" IS NOT NULL AND octet_length("credentialCiphertext") > 0
      AND "credentialNonce" IS NOT NULL AND octet_length("credentialNonce") = 12
      AND "credentialAuthTag" IS NOT NULL AND octet_length("credentialAuthTag") = 16
      AND "credentialKeyVersion" IS NOT NULL AND length("credentialKeyVersion") > 0)
);
ALTER TABLE "MarketingDailyMetric" ADD CONSTRAINT "Marketing_metric_values" CHECK (
  "currency" ~ '^[A-Z]{3}$' AND ("metaSpend" IS NULL OR "metaSpend" >= 0)
  AND ("effectiveSpend" IS NULL OR "effectiveSpend" >= 0) AND ("leads" IS NULL OR "leads" >= 0)
  AND ("costPercentage" IS NULL OR ("costPercentage" >= 0 AND "costPercentage" <= 1000))
  AND (("state" = 'CONFIRMED' AND "metaSpend" IS NOT NULL AND "leads" IS NOT NULL AND "effectiveSpend" IS NOT NULL
       AND "costPercentage" IS NOT NULL AND "sourceObservedAt" IS NOT NULL AND "syncedAt" IS NOT NULL)
       OR ("state" <> 'CONFIRMED' AND "metaSpend" IS NULL AND "leads" IS NULL AND "effectiveSpend" IS NULL))
);
ALTER TABLE "MarketingSyncRun" ADD CONSTRAINT "Marketing_sync_values" CHECK (
  "periodTo" >= "periodFrom" AND "attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attempts" <= "maxAttempts"
  AND (("status" = 'RUNNING' AND "leaseToken" IS NOT NULL AND "claimedAt" IS NOT NULL) OR ("status" <> 'RUNNING' AND "leaseToken" IS NULL))
  AND ("safeErrorCode" IS NULL OR "safeErrorCode" IN ('AUTHORIZATION_REQUIRED', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'INVALID_RESPONSE', 'LEASE_EXPIRED'))
);
CREATE UNIQUE INDEX "Marketing_sync_one_running_per_account" ON "MarketingSyncRun" ("tenantId", "accountId") WHERE "status" = 'RUNNING';
ALTER TABLE "MarketingAuditEvent" ADD CONSTRAINT "Marketing_audit_metadata" CHECK (
  jsonb_typeof("metadata") = 'object'
  AND ("metadata" - ARRAY['connectionId','selected','before','after','brokerId','previousBrokerId','previousAssignmentId','validFrom','percentage','previousRuleId']) = '{}'::jsonb
);
CREATE FUNCTION "marketing_audit_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MarketingAuditEvent is append-only' USING ERRCODE = '23000';
END;
$$;
CREATE TRIGGER "MarketingAuditEvent_immutable" BEFORE UPDATE OR DELETE ON "MarketingAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "marketing_audit_immutable"();

CREATE FUNCTION "marketing_cost_rule_preserve"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Marketing cost history cannot be deleted' USING ERRCODE = '23000'; END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."percentage" IS DISTINCT FROM OLD."percentage"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom" OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'Marketing cost history is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "MarketingCostRule_preserve" BEFORE UPDATE OR DELETE ON "MarketingCostRule"
FOR EACH ROW EXECUTE FUNCTION "marketing_cost_rule_preserve"();

CREATE FUNCTION "marketing_metric_preserve"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" = 'CONFIRMED' AND (
    NEW."costRuleId" IS DISTINCT FROM OLD."costRuleId" OR NEW."costPercentage" IS DISTINCT FROM OLD."costPercentage"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId"
    OR NEW."date" IS DISTINCT FROM OLD."date" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."state" <> 'CONFIRMED' OR NEW."sourceObservedAt" < OLD."sourceObservedAt"
  ) THEN RAISE EXCEPTION 'Confirmed metric history must be preserved' USING ERRCODE = '23000'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "MarketingDailyMetric_preserve" BEFORE UPDATE ON "MarketingDailyMetric"
FOR EACH ROW EXECUTE FUNCTION "marketing_metric_preserve"();

COMMIT;
