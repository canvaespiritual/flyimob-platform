-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('CONTATO_INICIAL', 'STANDBY', 'APROVADO', 'VENDIDO', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "LeadOrigin" AS ENUM ('CAMPANHA_TRAFego', 'INDICACAO', 'LISTA', 'ACAO_EXTERNA');

-- CreateTable
CREATE TABLE "CRMLead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "rendaBruta" DOUBLE PRECISION,
    "entrada" DOUBLE PRECISION,
    "fgts" DOUBLE PRECISION,
    "dataNascimento" TIMESTAMP(3),
    "origem" "LeadOrigin",
    "interesse" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'CONTATO_INICIAL',
    "contextoGeral" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CRMLead_tenantId_idx" ON "CRMLead"("tenantId");

-- CreateIndex
CREATE INDEX "CRMLead_ownerId_idx" ON "CRMLead"("ownerId");

-- CreateIndex
CREATE INDEX "CRMLead_status_idx" ON "CRMLead"("status");

-- AddForeignKey
ALTER TABLE "CRMLead" ADD CONSTRAINT "CRMLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMLead" ADD CONSTRAINT "CRMLead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
