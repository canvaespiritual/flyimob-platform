BEGIN;
-- Additive: existing Marketing rows, assignments, cost snapshots and audit history are preserved.
ALTER TABLE "MetaConnection" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MetaAdAccount" ADD COLUMN "sourceAccountStatus" INTEGER;
ALTER TABLE "MarketingCampaign" ADD COLUMN "effectiveStatus" VARCHAR(40);
ALTER TABLE "MarketingDailyMetric" ADD COLUMN "impressions" BIGINT,
  ADD COLUMN "clicks" BIGINT, ADD COLUMN "linkClicks" BIGINT;
ALTER TABLE "MarketingDailyMetric" ADD CONSTRAINT "Marketing_delivery_nonnegative" CHECK (
  ("impressions" IS NULL OR "impressions" >= 0) AND ("clicks" IS NULL OR "clicks" >= 0)
  AND ("linkClicks" IS NULL OR "linkClicks" >= 0));

CREATE TABLE "MarketingOAuthState" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL, "credentialVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingOAuthState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingOAuthState_hash" CHECK ("id" ~ '^[a-f0-9]{64}$' AND "credentialVersion" >= 0),
  CONSTRAINT "MarketingOAuthState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketingOAuthState_tenantId_actorId_fkey" FOREIGN KEY ("tenantId", "actorId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketingOAuthState_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "MetaConnection"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MarketingOAuthState_expiresAt_idx" ON "MarketingOAuthState"("expiresAt");

CREATE TABLE "MarketingAdDailyMetric" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "campaignId" TEXT NOT NULL,
  "adSetExternalId" VARCHAR(120) NOT NULL, "adExternalId" VARCHAR(120) NOT NULL,
  "creativeExternalId" VARCHAR(120), "date" DATE NOT NULL, "currency" CHAR(3) NOT NULL,
  "metaSpend" DECIMAL(18,2) NOT NULL, "conversations" INTEGER NOT NULL,
  "sourceObservedAt" TIMESTAMP(3) NOT NULL, "syncRunId" TEXT NOT NULL,
  CONSTRAINT "MarketingAdDailyMetric_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingAdDailyMetric_values" CHECK ("metaSpend" >= 0 AND "conversations" >= 0 AND "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "MarketingAdDailyMetric_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "MarketingCampaign"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketingAdDailyMetric_tenantId_syncRunId_fkey" FOREIGN KEY ("tenantId", "syncRunId") REFERENCES "MarketingSyncRun"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketingAdDailyMetric_tenantId_adExternalId_date_key" ON "MarketingAdDailyMetric"("tenantId", "adExternalId", "date");
CREATE INDEX "MarketingAdDailyMetric_tenantId_campaignId_date_idx" ON "MarketingAdDailyMetric"("tenantId", "campaignId", "date");
CREATE INDEX "MarketingAdDailyMetric_tenantId_creativeExternalId_date_idx" ON "MarketingAdDailyMetric"("tenantId", "creativeExternalId", "date");
COMMIT;
