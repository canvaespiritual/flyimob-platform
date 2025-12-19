-- CreateTable
CREATE TABLE "Comparativo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "slugPublico" TEXT NOT NULL,
    "showGeral" BOOLEAN NOT NULL DEFAULT true,
    "showEntrada" BOOLEAN NOT NULL DEFAULT true,
    "showFinanciamento" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comparativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparativoItem" (
    "id" TEXT NOT NULL,
    "comparativoId" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "valorTotal" DOUBLE PRECISION,
    "sinalEntrada" DOUBLE PRECISION,
    "parcelaEntrada" DOUBLE PRECISION,
    "parcelaFinanciamento" DOUBLE PRECISION,
    "fgts" DOUBLE PRECISION,
    "subsidio" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComparativoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comparativo_slugPublico_key" ON "Comparativo"("slugPublico");

-- CreateIndex
CREATE INDEX "Comparativo_tenantId_idx" ON "Comparativo"("tenantId");

-- CreateIndex
CREATE INDEX "ComparativoItem_comparativoId_idx" ON "ComparativoItem"("comparativoId");

-- CreateIndex
CREATE INDEX "ComparativoItem_tipologiaId_idx" ON "ComparativoItem"("tipologiaId");

-- AddForeignKey
ALTER TABLE "Comparativo" ADD CONSTRAINT "Comparativo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparativoItem" ADD CONSTRAINT "ComparativoItem_comparativoId_fkey" FOREIGN KEY ("comparativoId") REFERENCES "Comparativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparativoItem" ADD CONSTRAINT "ComparativoItem_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "EmpreendimentoTipologia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
