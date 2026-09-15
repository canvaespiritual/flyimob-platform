-- Prepared offline. Applying this migration requires explicit database approval.
BEGIN;

-- CreateEnum
CREATE TYPE "AcademyEventType" AS ENUM ('PLAYER_READY', 'PLAY', 'PAUSE', 'PROGRESS', 'SEEK', 'ENDED', 'PITCH_REACHED', 'CHECKOUT_OPEN', 'CHECKOUT_CLICK');

-- CreateTable
CREATE TABLE "AcademyVisitor" (
    "id" TEXT NOT NULL,
    "identityTokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademySession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "collectorTokenHash" CHAR(64) NOT NULL,
    "funnelKey" VARCHAR(80) NOT NULL,
    "vslKey" VARCHAR(80),
    "videoId" VARCHAR(200),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(200),
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
    "landingPage" VARCHAR(2048),
    "referrer" VARCHAR(2048),
    "currentSecond" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxReachedSecond" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "watchedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uniqueWatchedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPositionSequence" INTEGER NOT NULL DEFAULT -1,
    "playStartedAt" TIMESTAMP(3),
    "pitchReachedAt" TIMESTAMP(3),
    "checkoutOpenedAt" TIMESTAMP(3),
    "checkoutClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventKey" VARCHAR(80) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "AcademyEventType" NOT NULL,
    "clientAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "positionSecond" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,

    CONSTRAINT "AcademyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyWatchRange" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventKey" VARCHAR(80) NOT NULL,
    "rangeKey" VARCHAR(80) NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "observedStartAt" TIMESTAMP(3) NOT NULL,
    "observedEndAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyWatchRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademyVisitor_identityTokenHash_key" ON "AcademyVisitor"("identityTokenHash");

-- CreateIndex
CREATE INDEX "AcademyVisitor_lastSeenAt_idx" ON "AcademyVisitor"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademySession_collectorTokenHash_key" ON "AcademySession"("collectorTokenHash");

-- CreateIndex
CREATE INDEX "AcademySession_visitorId_lastActivityAt_idx" ON "AcademySession"("visitorId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "AcademySession_funnelKey_startedAt_idx" ON "AcademySession"("funnelKey", "startedAt");

-- CreateIndex
CREATE INDEX "AcademySession_expiresAt_idx" ON "AcademySession"("expiresAt");

-- CreateIndex
CREATE INDEX "AcademyEvent_sessionId_receivedAt_idx" ON "AcademyEvent"("sessionId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyEvent_sessionId_eventKey_key" ON "AcademyEvent"("sessionId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyEvent_sessionId_sequence_key" ON "AcademyEvent"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "AcademyWatchRange_sessionId_startMs_endMs_idx" ON "AcademyWatchRange"("sessionId", "startMs", "endMs");

-- CreateIndex
CREATE INDEX "AcademyWatchRange_sessionId_eventKey_idx" ON "AcademyWatchRange"("sessionId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyWatchRange_sessionId_rangeKey_key" ON "AcademyWatchRange"("sessionId", "rangeKey");

-- AddForeignKey
ALTER TABLE "AcademySession" ADD CONSTRAINT "AcademySession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "AcademyVisitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyEvent" ADD CONSTRAINT "AcademyEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyWatchRange" ADD CONSTRAINT "AcademyWatchRange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyWatchRange" ADD CONSTRAINT "AcademyWatchRange_sessionId_eventKey_fkey" FOREIGN KEY ("sessionId", "eventKey") REFERENCES "AcademyEvent"("sessionId", "eventKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- Additional invariants, not expressible as CHECK constraints in Prisma schema.
ALTER TABLE "AcademySession" ADD CONSTRAINT "AcademySession_metrics_check" CHECK (
    "currentSecond" >= 0 AND "currentSecond" <= 21600
    AND "maxReachedSecond" >= "currentSecond" AND "maxReachedSecond" <= 21600
    AND "watchedSeconds" >= 0 AND "watchedSeconds" <= 90000
    AND "uniqueWatchedSeconds" >= 0 AND "uniqueWatchedSeconds" <= "maxReachedSecond"
    AND "lastPositionSequence" >= -1
);
ALTER TABLE "AcademySession" ADD CONSTRAINT "AcademySession_expiry_check" CHECK (
    "expiresAt" > "startedAt" AND "lastActivityAt" >= "startedAt"
);
ALTER TABLE "AcademyEvent" ADD CONSTRAINT "AcademyEvent_values_check" CHECK (
    "sequence" >= 0
    AND ("positionSecond" IS NULL OR ("positionSecond" >= 0 AND "positionSecond" <= 21600))
    AND jsonb_typeof("metadata") = 'object'
    -- JSONB's textual form includes formatting; application limit is 1024 minified UTF-8 bytes.
    AND octet_length("metadata"::text) <= 4096
);
ALTER TABLE "AcademyWatchRange" ADD CONSTRAINT "AcademyWatchRange_observation_check" CHECK (
    "startMs" >= 0 AND "endMs" > "startMs" AND "endMs" <= 21600000
    AND "observedEndAt" > "observedStartAt"
    AND "observedEndAt" - "observedStartAt" <= INTERVAL '30 seconds'
    AND "endMs" - "startMs" <= EXTRACT(EPOCH FROM ("observedEndAt" - "observedStartAt")) * 2000 + 250
);

COMMIT;
