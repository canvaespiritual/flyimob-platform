ALTER TYPE "FinancialAttachmentEntityType" ADD VALUE 'RECEIPT_REMITTANCE';

CREATE TABLE "FinancialReceiptRemittance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "construtoraId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "expectedAmount" DECIMAL(18,2),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "FinancialReceiptStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialReceiptRemittance_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinancialReceipt" ADD COLUMN "remittanceId" TEXT;

CREATE INDEX "FinancialReceiptRemittance_tenantId_construtoraId_idx" ON "FinancialReceiptRemittance"("tenantId", "construtoraId");
CREATE INDEX "FinancialReceiptRemittance_tenantId_receivedAt_idx" ON "FinancialReceiptRemittance"("tenantId", "receivedAt");
CREATE INDEX "FinancialReceiptRemittance_financialAccountId_idx" ON "FinancialReceiptRemittance"("financialAccountId");
CREATE INDEX "FinancialReceipt_remittanceId_idx" ON "FinancialReceipt"("remittanceId");

ALTER TABLE "FinancialReceiptRemittance" ADD CONSTRAINT "FinancialReceiptRemittance_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "Construtora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialReceiptRemittance" ADD CONSTRAINT "FinancialReceiptRemittance_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "FinancialReceiptRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
