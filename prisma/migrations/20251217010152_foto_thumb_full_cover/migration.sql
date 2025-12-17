/*
  Warnings:

  - You are about to drop the column `url` on the `EmpreendimentoFoto` table. All the data in the column will be lost.
  - Added the required column `urlFull` to the `EmpreendimentoFoto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `urlThumb` to the `EmpreendimentoFoto` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmpreendimentoFoto" DROP COLUMN "url",
ADD COLUMN     "isCover" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urlFull" TEXT NOT NULL,
ADD COLUMN     "urlThumb" TEXT NOT NULL;
