CREATE TABLE "TrainingAccess" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "courseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "syncPending" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMP(3),
  "lastLessonId" TEXT,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingAccess_user_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TrainingAccess_course_limit" CHECK (cardinality("courseIds") <= 100)
);
CREATE INDEX "TrainingAccess_tenantId_syncPending_idx" ON "TrainingAccess"("tenantId", "syncPending");
CREATE UNIQUE INDEX "TrainingAccess_tenantId_userId_key" ON "TrainingAccess"("tenantId", "userId");
