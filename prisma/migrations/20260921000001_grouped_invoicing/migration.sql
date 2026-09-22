-- Existing individual invoices retain their stageId. No data is rewritten.
ALTER TABLE "FinancialInvoice" ALTER COLUMN "stageId" DROP NOT NULL;
ALTER TABLE "FinancialInvoice" ADD COLUMN "construtoraId" TEXT;

CREATE TABLE "FinancialInvoiceAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialInvoiceAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinancialInvoiceAllocation_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "FinancialInvoice_tenantId_construtoraId_idx" ON "FinancialInvoice"("tenantId", "construtoraId");
CREATE UNIQUE INDEX "FinancialInvoiceAllocation_invoiceId_stageId_key" ON "FinancialInvoiceAllocation"("invoiceId", "stageId");
CREATE INDEX "FinancialInvoiceAllocation_tenantId_invoiceId_idx" ON "FinancialInvoiceAllocation"("tenantId", "invoiceId");
CREATE INDEX "FinancialInvoiceAllocation_tenantId_stageId_idx" ON "FinancialInvoiceAllocation"("tenantId", "stageId");

ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_construtoraId_fkey"
    FOREIGN KEY ("construtoraId") REFERENCES "Construtora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialInvoiceAllocation" ADD CONSTRAINT "FinancialInvoiceAllocation_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialInvoiceAllocation" ADD CONSTRAINT "FinancialInvoiceAllocation_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "FinancialStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
