CREATE UNIQUE INDEX "DocumentationEvent_tenantId_folderId_id_key" ON "DocumentationEvent"("tenantId", "folderId", "id");

CREATE TABLE "DocumentationNotificationRead" (
  "tenantId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentationNotificationRead_pkey" PRIMARY KEY ("tenantId", "userId", "eventId"),
  CONSTRAINT "DocumentationNotificationRead_event_fkey" FOREIGN KEY ("tenantId", "folderId", "eventId") REFERENCES "DocumentationEvent"("tenantId", "folderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentationNotificationRead_user_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DocumentationNotificationRead_tenantId_folderId_eventId_idx" ON "DocumentationNotificationRead"("tenantId", "folderId", "eventId");
