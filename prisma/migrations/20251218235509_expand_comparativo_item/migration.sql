/*
  Warnings:

  - You are about to drop the column `subsidio` on the `ComparativoItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ComparativoItem" DROP COLUMN "subsidio",
ADD COLUMN     "entradaTotal" DOUBLE PRECISION,
ADD COLUMN     "estimativaDocumentacao" DOUBLE PRECISION,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "parcelaEspecial" TEXT,
ADD COLUMN     "parcelaUnica" TEXT,
ADD COLUMN     "parcelasAnuais" TEXT,
ADD COLUMN     "parcelasEntradaQtd" INTEGER,
ADD COLUMN     "parcelasIntermediarias" TEXT,
ADD COLUMN     "rendaBrutaFamiliar" DOUBLE PRECISION,
ADD COLUMN     "saldoFinanciamento" DOUBLE PRECISION,
ADD COLUMN     "subsidioEstadual" DOUBLE PRECISION,
ADD COLUMN     "subsidioFederal" DOUBLE PRECISION,
ADD COLUMN     "subsidioMunicipal" DOUBLE PRECISION,
ADD COLUMN     "taxaJuros" DOUBLE PRECISION;
