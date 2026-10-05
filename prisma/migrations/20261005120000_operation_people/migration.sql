BEGIN;

-- CreateEnum
CREATE TYPE "OperationalRole" AS ENUM ('DIRECTION', 'DIRECTOR', 'MANAGER', 'BROKER', 'ADMINISTRATIVE', 'PARTNER', 'OTHER');

-- AlterTable
ALTER TABLE "CampaignBrokerAssignment" ADD COLUMN     "personId" TEXT,
ALTER COLUMN "brokerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "personId" TEXT;

-- AlterTable
ALTER TABLE "FinancialParticipant" ADD COLUMN     "personId" TEXT;

-- CreateTable
CREATE TABLE "OperationPerson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "operationalRole" "OperationalRole" NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationPerson_tenantId_active_idx" ON "OperationPerson"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OperationPerson_tenantId_id_key" ON "OperationPerson"("tenantId", "id");

-- CreateIndex
CREATE INDEX "CampaignBrokerAssignment_tenantId_personId_validFrom_validT_idx" ON "CampaignBrokerAssignment"("tenantId", "personId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_personId_key" ON "User"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialParticipant_personId_key" ON "FinancialParticipant"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialParticipant_tenantId_personId_key" ON "FinancialParticipant"("tenantId", "personId");

-- AddForeignKey
ALTER TABLE "OperationPerson" ADD CONSTRAINT "OperationPerson_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPerson" ADD CONSTRAINT "OperationPerson_tenantId_mergedIntoId_fkey" FOREIGN KEY ("tenantId", "mergedIntoId") REFERENCES "OperationPerson"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "CampaignBrokerAssignment_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "OperationPerson"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "OperationPerson"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialParticipant" ADD CONSTRAINT "FinancialParticipant_tenantId_personId_fkey" FOREIGN KEY ("tenantId", "personId") REFERENCES "OperationPerson"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill uses existing IDs and explicit same-tenant financial User FK only.
INSERT INTO "OperationPerson" ("id", "tenantId", "name", "email", "operationalRole", "active", "updatedAt")
SELECT 'person:user:' || "id", "tenantId", "name", "email",
 CASE "role"::text WHEN 'OWNER' THEN 'DIRECTION' WHEN 'DIRECTOR' THEN 'DIRECTOR'
 WHEN 'MANAGER' THEN 'MANAGER' WHEN 'BROKER' THEN 'BROKER' WHEN 'DATA_ENTRY' THEN 'ADMINISTRATIVE' ELSE 'OTHER' END::"OperationalRole",
 "isActive", CURRENT_TIMESTAMP FROM "User";
UPDATE "User" SET "personId" = 'person:user:' || "id";
UPDATE "FinancialParticipant" p SET "personId" = u."personId"
 FROM "User" u WHERE p."userId" = u."id" AND p."tenantId" = u."tenantId";
INSERT INTO "OperationPerson" ("id", "tenantId", "name", "email", "active", "updatedAt")
SELECT 'person:participant:' || "id", "tenantId", "name", "email", "active", CURRENT_TIMESTAMP
 FROM "FinancialParticipant" WHERE "personId" IS NULL;
UPDATE "FinancialParticipant" SET "personId" = 'person:participant:' || "id" WHERE "personId" IS NULL;
UPDATE "OperationPerson" o SET "active" = true FROM "FinancialParticipant" p
 WHERE p."personId" = o."id" AND p."active" = true;
UPDATE "CampaignBrokerAssignment" a SET "personId" = u."personId" FROM "User" u
 WHERE a."brokerId" = u."id" AND a."tenantId" = u."tenantId";
ALTER TABLE "CampaignBrokerAssignment" ADD CONSTRAINT "marketing_assignment_identity"
 CHECK ("personId" IS NOT NULL OR "brokerId" IS NOT NULL);
ALTER TABLE "OperationPerson" ADD CONSTRAINT "person_no_self_merge" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");

-- Additive materialization for all existing user/participant creation flows.
CREATE FUNCTION flyimob_user_person() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."personId" IS NULL THEN
  NEW."personId" := 'person:user:' || NEW."id";
  INSERT INTO "OperationPerson" ("id", "tenantId", "name", "email", "operationalRole", "active", "updatedAt")
  VALUES (NEW."personId", NEW."tenantId", NEW."name", NEW."email",
   (CASE NEW."role"::text WHEN 'OWNER' THEN 'DIRECTION' WHEN 'DIRECTOR' THEN 'DIRECTOR'
    WHEN 'MANAGER' THEN 'MANAGER' WHEN 'BROKER' THEN 'BROKER' WHEN 'DATA_ENTRY' THEN 'ADMINISTRATIVE' ELSE 'OTHER' END)::"OperationalRole",
   NEW."isActive", CURRENT_TIMESTAMP);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_person_insert BEFORE INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION flyimob_user_person();

CREATE FUNCTION flyimob_participant_person() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_person text; source_person text; source_has_user boolean;
BEGIN
 IF NEW."userId" IS NOT NULL THEN
  SELECT "personId" INTO target_person FROM "User" WHERE "id" = NEW."userId" AND "tenantId" = NEW."tenantId";
  IF target_person IS NULL THEN RAISE EXCEPTION 'Participant user must belong to operation'; END IF;
  IF TG_OP = 'INSERT' OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
   source_person := NEW."personId";
   IF source_person IS NOT NULL AND source_person <> target_person THEN
    SELECT EXISTS(SELECT 1 FROM "User" WHERE "personId" = source_person) INTO source_has_user;
    IF NOT source_has_user THEN
     UPDATE "OperationPerson" target SET "independent" = target."independent" OR source."independent",
      "active" = target."active" OR source."active", "updatedAt" = CURRENT_TIMESTAMP
      FROM "OperationPerson" source WHERE target."id" = target_person AND source."id" = source_person
      AND target."tenantId" = NEW."tenantId" AND source."tenantId" = NEW."tenantId";
     UPDATE "CampaignBrokerAssignment" SET "personId" = target_person WHERE "tenantId" = NEW."tenantId" AND "personId" = source_person;
     UPDATE "OperationPerson" SET "active" = false, "mergedIntoId" = target_person, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = source_person AND "tenantId" = NEW."tenantId";
    END IF;
   END IF;
   NEW."personId" := target_person;
   IF NEW."active" THEN
    UPDATE "OperationPerson" SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = target_person AND "tenantId" = NEW."tenantId";
   END IF;
  END IF;
 END IF;
 IF NEW."personId" IS NULL THEN
  NEW."personId" := 'person:participant:' || NEW."id";
  INSERT INTO "OperationPerson" ("id", "tenantId", "name", "email", "active", "updatedAt")
  VALUES (NEW."personId", NEW."tenantId", NEW."name", NEW."email", NEW."active", CURRENT_TIMESTAMP);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER participant_person_write BEFORE INSERT OR UPDATE OF "userId", "personId" ON "FinancialParticipant"
 FOR EACH ROW EXECUTE FUNCTION flyimob_participant_person();

-- Expression matches the effective status displayed/filtered. Internal tracking remains independent.
CREATE INDEX marketing_meta_operational_order ON "MarketingCampaign" ("tenantId",
 (CASE COALESCE("effectiveStatus", "sourceStatus", 'UNKNOWN') WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END), "updatedAt" DESC, "id");

COMMIT;
