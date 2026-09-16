-- CreateTable
CREATE TABLE "AcademyPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpointHash" CHAR(64) NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(128) NOT NULL,
    "auth" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyPushNotification" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPushNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyPushDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastStatus" INTEGER,

    CONSTRAINT "AcademyPushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademyPushSubscription_endpointHash_key" ON "AcademyPushSubscription"("endpointHash");

-- CreateIndex
CREATE INDEX "AcademyPushSubscription_userId_active_idx" ON "AcademyPushSubscription"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyPushNotification_eventKey_key" ON "AcademyPushNotification"("eventKey");

-- CreateIndex
CREATE INDEX "AcademyPushDelivery_state_nextAttemptAt_idx" ON "AcademyPushDelivery"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyPushDelivery_notificationId_subscriptionId_key" ON "AcademyPushDelivery"("notificationId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "AcademyPushDelivery" ADD CONSTRAINT "AcademyPushDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AcademyPushNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyPushDelivery" ADD CONSTRAINT "AcademyPushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AcademyPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
