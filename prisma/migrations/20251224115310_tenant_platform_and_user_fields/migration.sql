-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "isPlatform" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creci" TEXT,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
