-- CreateEnum
CREATE TYPE "AcademySaleProvider" AS ENUM ('HOTMART');

-- CreateEnum
CREATE TYPE "AcademySaleStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "AcademyWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "AcademyLead" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "funnelKey" VARCHAR(80),
    "vslKey" VARCHAR(80),
    "videoId" VARCHAR(200),
    "utmSource" VARCHAR(200),
    "utmMedium" VARCHAR(200),
    "utmCampaign" VARCHAR(200),
    "utmContent" VARCHAR(200),
    "utmTerm" VARCHAR(200),
    "utmId" VARCHAR(200),
    "fbclid" VARCHAR(500),
    "fbp" VARCHAR(256),
    "fbc" VARCHAR(512),
    "gclid" VARCHAR(500),
    "wbraid" VARCHAR(500),
    "gbraid" VARCHAR(500),
    "campaignId" VARCHAR(120),
    "adsetId" VARCHAR(120),
    "adId" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademySale" (
    "id" TEXT NOT NULL,
    "provider" "AcademySaleProvider" NOT NULL DEFAULT 'HOTMART',
    "providerTransactionId" TEXT,
    "providerOrderId" TEXT,
    "leadId" TEXT,
    "sessionId" TEXT,
    "buyerName" VARCHAR(160),
    "buyerEmail" VARCHAR(320),
    "buyerPhone" VARCHAR(40),
    "productId" VARCHAR(120),
    "productName" VARCHAR(200),
    "offerId" VARCHAR(120),
    "status" "AcademySaleStatus" NOT NULL,
    "currency" VARCHAR(10),
    "grossAmount" DECIMAL(18,2),
    "netAmount" DECIMAL(18,2),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademySale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "AcademySaleProvider" NOT NULL DEFAULT 'HOTMART',
    "providerEventId" TEXT,
    "transactionId" TEXT,
    "orderId" TEXT,
    "eventType" VARCHAR(100) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingStatus" "AcademyWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "processingError" VARCHAR(1000),
    "saleId" TEXT,

    CONSTRAINT "AcademyWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyLead_sessionId_idx" ON "AcademyLead"("sessionId");

-- CreateIndex
CREATE INDEX "AcademyLead_email_idx" ON "AcademyLead"("email");

-- CreateIndex
CREATE INDEX "AcademyLead_phone_idx" ON "AcademyLead"("phone");

-- CreateIndex
CREATE INDEX "AcademyLead_createdAt_idx" ON "AcademyLead"("createdAt");

-- CreateIndex
CREATE INDEX "AcademySale_leadId_idx" ON "AcademySale"("leadId");

-- CreateIndex
CREATE INDEX "AcademySale_sessionId_idx" ON "AcademySale"("sessionId");

-- CreateIndex
CREATE INDEX "AcademySale_status_approvedAt_idx" ON "AcademySale"("status", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademySale_provider_providerTransactionId_key" ON "AcademySale"("provider", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademySale_provider_providerOrderId_key" ON "AcademySale"("provider", "providerOrderId");

-- CreateIndex
CREATE INDEX "AcademyWebhookEvent_processingStatus_receivedAt_idx" ON "AcademyWebhookEvent"("processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "AcademyWebhookEvent_saleId_idx" ON "AcademyWebhookEvent"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyWebhookEvent_provider_providerEventId_key" ON "AcademyWebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyWebhookEvent_provider_transactionId_eventType_key" ON "AcademyWebhookEvent"("provider", "transactionId", "eventType");

-- AddForeignKey
ALTER TABLE "AcademyLead" ADD CONSTRAINT "AcademyLead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademySession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademySale" ADD CONSTRAINT "AcademySale_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AcademyLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademySale" ADD CONSTRAINT "AcademySale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyWebhookEvent" ADD CONSTRAINT "AcademyWebhookEvent_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AcademySale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
