/*
  Warnings:

  - You are about to drop the column `entregaPrev` on the `Empreendimento` table. All the data in the column will be lost.
  - You are about to drop the column `precoMax` on the `Empreendimento` table. All the data in the column will be lost.
  - You are about to drop the column `precoMin` on the `Empreendimento` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Empreendimento` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tenantId,name]` on the table `Construtora` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EmpreendimentoTipo" AS ENUM ('CONDOMINIO_VERTICAL', 'CONDOMINIO_CASAS', 'CONDOMINIO_LOTES', 'LOTEAMENTO', 'APARTAMENTO', 'CASA', 'LOTE', 'COMERCIAL', 'GALPAO', 'AREA', 'FAZENDA', 'OUTRO');

-- CreateEnum
CREATE TYPE "FinancingModel" AS ENUM ('CREDITO_ASSOCIATIVO', 'FLUXO_ATE_CHAVES');

-- AlterTable
ALTER TABLE "Construtora" ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "responsavelComercial" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "whatsappComercial" TEXT;

-- AlterTable
ALTER TABLE "Empreendimento" DROP COLUMN "entregaPrev",
DROP COLUMN "precoMax",
DROP COLUMN "precoMin",
DROP COLUMN "status",
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "contatoNome" TEXT,
ADD COLUMN     "contatoTelefone" TEXT,
ADD COLUMN     "contatoWhatsapp" TEXT,
ADD COLUMN     "dataEntrega" TIMESTAMP(3),
ADD COLUMN     "dataLancamento" TIMESTAMP(3),
ADD COLUMN     "tipo" "EmpreendimentoTipo" NOT NULL DEFAULT 'OUTRO';

-- CreateTable
CREATE TABLE "EmpreendimentoAnexo" (
    "id" TEXT NOT NULL,
    "empreendimentoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpreendimentoAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpreendimentoTipologia" (
    "id" TEXT NOT NULL,
    "empreendimentoId" TEXT NOT NULL,
    "nome" TEXT,
    "areaPrivativa" DOUBLE PRECISION,
    "areaTerreno" DOUBLE PRECISION,
    "quartos" INTEGER,
    "suites" INTEGER,
    "vagas" INTEGER,
    "totalUnidades" INTEGER,
    "disponiveis" INTEGER,
    "precoInicial" INTEGER,
    "precoPorM2" INTEGER,
    "atualizadoEm" TIMESTAMP(3),
    "financingModel" "FinancingModel",
    "percentualAteChaves" INTEGER,
    "valorAvaliacaoBanco" INTEGER,
    "entradaMinima" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmpreendimentoTipologia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmpreendimentoAnexo_empreendimentoId_idx" ON "EmpreendimentoAnexo"("empreendimentoId");

-- CreateIndex
CREATE INDEX "EmpreendimentoTipologia_empreendimentoId_idx" ON "EmpreendimentoTipologia"("empreendimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Construtora_tenantId_name_key" ON "Construtora"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "EmpreendimentoAnexo" ADD CONSTRAINT "EmpreendimentoAnexo_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "Empreendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpreendimentoTipologia" ADD CONSTRAINT "EmpreendimentoTipologia_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "Empreendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
