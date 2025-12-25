-- CreateEnum
CREATE TYPE "BrokerLevel" AS ENUM ('ATENDENTE', 'ESTAGIARIO', 'INTERMEDIARIO', 'SENIOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "brokerLevel" "BrokerLevel",
ADD COLUMN     "supervisorId" TEXT;

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_supervisorId_idx" ON "User"("supervisorId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
