/*
  Warnings:

  - The values [CAMPANHA_TRAFego] on the enum `LeadOrigin` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LeadOrigin_new" AS ENUM ('CAMPANHA_TRAFEGO', 'INDICACAO', 'LISTA', 'ACAO_EXTERNA');
ALTER TABLE "CRMLead" ALTER COLUMN "origem" TYPE "LeadOrigin_new" USING ("origem"::text::"LeadOrigin_new");
ALTER TYPE "LeadOrigin" RENAME TO "LeadOrigin_old";
ALTER TYPE "LeadOrigin_new" RENAME TO "LeadOrigin";
DROP TYPE "public"."LeadOrigin_old";
COMMIT;
