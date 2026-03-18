-- CreateEnum
CREATE TYPE "LeadHeat" AS ENUM ('FRIO', 'MORNO', 'QUENTE', 'MUITO_QUENTE');

-- AlterTable
ALTER TABLE "CRMLead" ADD COLUMN     "calorVenda" "LeadHeat";
