-- CreateEnum
CREATE TYPE "EmpreendimentoStatus" AS ENUM ('ATIVO', 'INATIVO');

-- AlterTable
ALTER TABLE "Empreendimento" ADD COLUMN     "status" "EmpreendimentoStatus" NOT NULL DEFAULT 'INATIVO';
