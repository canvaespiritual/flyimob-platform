ALTER TABLE "Comparativo" ADD COLUMN "modoDirecionamento" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resumoCredito" JSONB, ADD COLUMN "publicadoEm" TIMESTAMP(3), ADD COLUMN "revisao" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComparativoItem" ADD COLUMN "planoPagamento" JSONB, ADD COLUMN "planoRascunho" JSONB,
ADD COLUMN "extracaoOriginal" JSONB, ADD COLUMN "estadoExtracao" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "extracaoToken" TEXT, ADD COLUMN "extracaoIniciadaEm" TIMESTAMP(3), ADD COLUMN "revisao" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ComparativoAnexo" (
 "id" TEXT NOT NULL, "comparativoId" TEXT NOT NULL, "itemId" TEXT, "escopo" TEXT NOT NULL,
 "titulo" TEXT NOT NULL, "nomeOriginal" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
 "fileSize" BIGINT NOT NULL, "storageKey" TEXT NOT NULL, "checksum" TEXT NOT NULL,
 "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ComparativoAnexo_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ComparativoAnexo_comparativoId_fkey" FOREIGN KEY ("comparativoId") REFERENCES "Comparativo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ComparativoAnexo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ComparativoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ComparativoAnexo_storageKey_key" ON "ComparativoAnexo"("storageKey");
CREATE UNIQUE INDEX "ComparativoAnexo_comparativoId_escopo_key" ON "ComparativoAnexo"("comparativoId", "escopo");
CREATE INDEX "ComparativoAnexo_itemId_idx" ON "ComparativoAnexo"("itemId");
