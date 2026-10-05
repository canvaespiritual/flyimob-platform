BEGIN;
ALTER TABLE "DocumentationFolder" ADD COLUMN "responsiblePersonId" TEXT;
ALTER TABLE "DocumentationFolder" ALTER COLUMN "brokerId" DROP NOT NULL;
UPDATE "DocumentationFolder" f SET "responsiblePersonId" = u."personId" FROM "User" u WHERE f."tenantId" = u."tenantId" AND f."brokerId" = u."id";
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "DocumentationFolder_tenantId_responsiblePersonId_fkey" FOREIGN KEY ("tenantId", "responsiblePersonId") REFERENCES "OperationPerson"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentationFolder_tenantId_responsiblePersonId_idx" ON "DocumentationFolder"("tenantId", "responsiblePersonId");
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "documentation_responsible_identity" CHECK ("responsiblePersonId" IS NOT NULL OR "brokerId" IS NOT NULL);
CREATE OR REPLACE FUNCTION flyimob_participant_person() RETURNS trigger LANGUAGE plpgsql AS $$
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
     UPDATE "DocumentationFolder" SET "responsiblePersonId" = target_person WHERE "tenantId" = NEW."tenantId" AND "responsiblePersonId" = source_person;
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

COMMIT;
