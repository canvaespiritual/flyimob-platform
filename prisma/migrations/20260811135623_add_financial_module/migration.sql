-- CreateEnum
CREATE TYPE "FinancialSaleStatus" AS ENUM ('OPEN', 'PARTIAL', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialCommissionInputMode" AS ENUM ('MANUAL_AMOUNT', 'VGV_PERCENT', 'VGV_PERCENT_OVERRIDE');

-- CreateEnum
CREATE TYPE "FinancialStageType" AS ENUM ('ATO', 'BANCO', 'PREMIO', 'COMPLEMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "FinancialStageStatus" AS ENUM ('EXPECTED', 'INVOICED', 'AWAITING_RECEIPT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialReceiptStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialTaxKind" AS ENUM ('WITHHELD_AT_SOURCE', 'PAYABLE_BY_COMPANY', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialTaxStatus" AS ENUM ('PENDING', 'PROVISIONED', 'SEPARATED', 'PAID', 'WITHHELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialParticipantRole" AS ENUM ('BROKER', 'MANAGER', 'FILE_OPERATOR', 'MARKETING', 'INDICATOR', 'CLOSER', 'INCORPORATOR', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialCalculationBasis" AS ENUM ('COMMISSION_GROSS', 'COMMISSION_NET_AFTER_WITHHOLDING', 'COMMISSION_NET_AFTER_ALL_TAXES', 'VGV', 'FIXED', 'MANUAL');

-- CreateEnum
CREATE TYPE "FinancialEntitlementStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialAdjustmentType" AS ENUM ('ADVANCE', 'DISCOUNT', 'BONUS', 'REIMBURSEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialAdjustmentEffect" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "FinancialAdjustmentStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialPaymentStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('CHECKING', 'TAX_RESERVE', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialCompanyAllocationStatus" AS ENUM ('PENDING', 'APPROPRIATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialTaxClosingStatus" AS ENUM ('OPEN', 'CLOSED', 'SEPARATED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialTaxMovementType" AS ENUM ('SEPARATION', 'PAYMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinancialSettlementStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialSettlementItemType" AS ENUM ('ENTITLEMENT', 'ADJUSTMENT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "FinancialDocumentType" AS ENUM ('PARTICIPANT_STATEMENT', 'PAYMENT_RECEIPT', 'TAX_CLOSING', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialAttachmentType" AS ENUM ('INVOICE', 'BUILDER_RECEIPT', 'PARTICIPANT_PAYMENT', 'ADVANCE', 'TAX_DOCUMENT', 'TAX_PAYMENT', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialAttachmentEntityType" AS ENUM ('SALE', 'STAGE', 'INVOICE', 'RECEIPT', 'PARTICIPANT', 'ENTITLEMENT', 'ADJUSTMENT', 'PAYMENT', 'TAX_ENTRY', 'TAX_CLOSING', 'TAX_MOVEMENT', 'SETTLEMENT', 'DOCUMENT', 'COMPANY_ALLOCATION');

-- CreateEnum
CREATE TYPE "FinancialAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'FINALIZE', 'UPLOAD', 'GENERATE_DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "FinancialSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientCpfCnpj" TEXT,
    "clientPhone" TEXT,
    "clientEmail" TEXT,
    "construtoraId" TEXT,
    "empreendimentoId" TEXT,
    "construtoraNameManual" TEXT,
    "empreendimentoNameManual" TEXT,
    "unit" TEXT,
    "block" TEXT,
    "saleDate" TIMESTAMP(3),
    "vgv" DECIMAL(18,2),
    "commissionInputMode" "FinancialCommissionInputMode" NOT NULL DEFAULT 'MANUAL_AMOUNT',
    "commissionPercent" DECIMAL(10,6),
    "commissionCalculatedAmount" DECIMAL(18,2),
    "commissionOverrideAmount" DECIMAL(18,2),
    "commissionFinalAmount" DECIMAL(18,2),
    "status" "FinancialSaleStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "FinancialStageType" NOT NULL,
    "label" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "commissionSharePercent" DECIMAL(10,6),
    "expectedGrossAmount" DECIMAL(18,2),
    "expectedInvoiceDate" TIMESTAMP(3),
    "expectedReceiptDate" TIMESTAMP(3),
    "status" "FinancialStageStatus" NOT NULL DEFAULT 'EXPECTED',
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "number" TEXT,
    "grossAmount" DECIMAL(18,2),
    "issuedAt" TIMESTAMP(3),
    "competenceYear" INTEGER,
    "competenceMonth" INTEGER,
    "status" "FinancialInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL DEFAULT 'CHECKING',
    "bankName" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "pixType" TEXT,
    "pixKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "financialAccountId" TEXT,
    "expectedAmount" DECIMAL(18,2),
    "expectedAt" TIMESTAMP(3),
    "amount" DECIMAL(18,2),
    "receivedAt" TIMESTAMP(3),
    "reference" TEXT,
    "status" "FinancialReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FinancialTaxKind" NOT NULL,
    "rate" DECIMAL(10,6) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTaxEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "taxRuleId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "FinancialTaxKind" NOT NULL,
    "rate" DECIMAL(10,6),
    "amount" DECIMAL(18,2),
    "status" "FinancialTaxStatus" NOT NULL DEFAULT 'PENDING',
    "provisionedAt" TIMESTAMP(3),
    "separatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTaxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "defaultCalculationBasis" "FinancialCalculationBasis",
    "defaultPercentage" DECIMAL(10,6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialParticipantAccount" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "pixType" TEXT,
    "pixKey" TEXT,
    "bankName" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "accountType" TEXT,
    "holderName" TEXT,
    "holderCpfCnpj" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialParticipantAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" "FinancialParticipantRole" NOT NULL,
    "customRoleLabel" TEXT,
    "calculationBasis" "FinancialCalculationBasis" NOT NULL,
    "percentage" DECIMAL(10,6),
    "calculationBaseAmount" DECIMAL(18,2),
    "fixedAmount" DECIMAL(18,2),
    "calculatedAmount" DECIMAL(18,2),
    "overrideAmount" DECIMAL(18,2),
    "finalAmount" DECIMAL(18,2) NOT NULL,
    "status" "FinancialEntitlementStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "type" "FinancialAdjustmentType" NOT NULL,
    "effect" "FinancialAdjustmentEffect" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "status" "FinancialAdjustmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAdjustmentAllocation" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAdjustmentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sourceAccountId" TEXT,
    "destinationAccountId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" "FinancialPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "destinationPixType" TEXT,
    "destinationPixKey" TEXT,
    "destinationBankName" TEXT,
    "destinationAgency" TEXT,
    "destinationAccount" TEXT,
    "destinationHolderName" TEXT,
    "destinationHolderCpfCnpj" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCompanyAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "FinancialCompanyAllocationStatus" NOT NULL DEFAULT 'APPROPRIATED',
    "appropriatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCompanyAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTaxClosing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "competenceYear" INTEGER NOT NULL,
    "competenceMonth" INTEGER NOT NULL,
    "status" "FinancialTaxClosingStatus" NOT NULL DEFAULT 'OPEN',
    "provisionedAmount" DECIMAL(18,2),
    "separatedAmount" DECIMAL(18,2),
    "actualTaxAmount" DECIMAL(18,2),
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "separatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reserveAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTaxClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTaxMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "type" "FinancialTaxMovementType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "financialAccountId" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTaxMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTaxClosingItem" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "taxEntryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTaxClosingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" "FinancialSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "grossEntitlementsAmount" DECIMAL(18,2),
    "creditsAmount" DECIMAL(18,2),
    "debitsAmount" DECIMAL(18,2),
    "paymentsAmount" DECIMAL(18,2),
    "netAmount" DECIMAL(18,2),
    "finalizedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSettlementItem" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "type" "FinancialSettlementItemType" NOT NULL,
    "entitlementId" TEXT,
    "adjustmentId" TEXT,
    "paymentId" TEXT,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "showInDocument" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialSettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT,
    "settlementId" TEXT,
    "type" "FinancialDocumentType" NOT NULL,
    "number" TEXT,
    "title" TEXT,
    "config" JSONB,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "url" TEXT,
    "storageKey" TEXT,
    "originalName" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "FinancialAttachmentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "FinancialAttachmentType" NOT NULL,
    "title" TEXT,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "FinancialAuditAction" NOT NULL,
    "userId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialSale_tenantId_idx" ON "FinancialSale"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialSale_tenantId_status_idx" ON "FinancialSale"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialSale_tenantId_saleDate_idx" ON "FinancialSale"("tenantId", "saleDate");

-- CreateIndex
CREATE INDEX "FinancialSale_construtoraId_idx" ON "FinancialSale"("construtoraId");

-- CreateIndex
CREATE INDEX "FinancialSale_empreendimentoId_idx" ON "FinancialSale"("empreendimentoId");

-- CreateIndex
CREATE INDEX "FinancialStage_tenantId_idx" ON "FinancialStage"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialStage_saleId_idx" ON "FinancialStage"("saleId");

-- CreateIndex
CREATE INDEX "FinancialStage_tenantId_status_idx" ON "FinancialStage"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialStage_expectedReceiptDate_idx" ON "FinancialStage"("expectedReceiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStage_saleId_sequence_key" ON "FinancialStage"("saleId", "sequence");

-- CreateIndex
CREATE INDEX "FinancialInvoice_tenantId_idx" ON "FinancialInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialInvoice_stageId_idx" ON "FinancialInvoice"("stageId");

-- CreateIndex
CREATE INDEX "FinancialInvoice_issuedAt_idx" ON "FinancialInvoice"("issuedAt");

-- CreateIndex
CREATE INDEX "FinancialInvoice_tenantId_competenceYear_competenceMonth_idx" ON "FinancialInvoice"("tenantId", "competenceYear", "competenceMonth");

-- CreateIndex
CREATE INDEX "FinancialInvoice_status_idx" ON "FinancialInvoice"("status");

-- CreateIndex
CREATE INDEX "FinancialAccount_tenantId_idx" ON "FinancialAccount"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialAccount_tenantId_active_idx" ON "FinancialAccount"("tenantId", "active");

-- CreateIndex
CREATE INDEX "FinancialReceipt_tenantId_idx" ON "FinancialReceipt"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialReceipt_stageId_idx" ON "FinancialReceipt"("stageId");

-- CreateIndex
CREATE INDEX "FinancialReceipt_invoiceId_idx" ON "FinancialReceipt"("invoiceId");

-- CreateIndex
CREATE INDEX "FinancialReceipt_receivedAt_idx" ON "FinancialReceipt"("receivedAt");

-- CreateIndex
CREATE INDEX "FinancialReceipt_tenantId_status_idx" ON "FinancialReceipt"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialTaxRule_tenantId_idx" ON "FinancialTaxRule"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialTaxRule_tenantId_active_idx" ON "FinancialTaxRule"("tenantId", "active");

-- CreateIndex
CREATE INDEX "FinancialTaxRule_validFrom_idx" ON "FinancialTaxRule"("validFrom");

-- CreateIndex
CREATE INDEX "FinancialTaxRule_validTo_idx" ON "FinancialTaxRule"("validTo");

-- CreateIndex
CREATE INDEX "FinancialTaxEntry_tenantId_idx" ON "FinancialTaxEntry"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialTaxEntry_invoiceId_idx" ON "FinancialTaxEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "FinancialTaxEntry_taxRuleId_idx" ON "FinancialTaxEntry"("taxRuleId");

-- CreateIndex
CREATE INDEX "FinancialTaxEntry_tenantId_kind_idx" ON "FinancialTaxEntry"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "FinancialTaxEntry_tenantId_status_idx" ON "FinancialTaxEntry"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialParticipant_tenantId_idx" ON "FinancialParticipant"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialParticipant_tenantId_active_idx" ON "FinancialParticipant"("tenantId", "active");

-- CreateIndex
CREATE INDEX "FinancialParticipant_cpfCnpj_idx" ON "FinancialParticipant"("cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialParticipant_tenantId_userId_key" ON "FinancialParticipant"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "FinancialParticipantAccount_participantId_idx" ON "FinancialParticipantAccount"("participantId");

-- CreateIndex
CREATE INDEX "FinancialParticipantAccount_participantId_active_idx" ON "FinancialParticipantAccount"("participantId", "active");

-- CreateIndex
CREATE INDEX "FinancialEntitlement_tenantId_idx" ON "FinancialEntitlement"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialEntitlement_stageId_idx" ON "FinancialEntitlement"("stageId");

-- CreateIndex
CREATE INDEX "FinancialEntitlement_participantId_idx" ON "FinancialEntitlement"("participantId");

-- CreateIndex
CREATE INDEX "FinancialEntitlement_tenantId_status_idx" ON "FinancialEntitlement"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_tenantId_idx" ON "FinancialAdjustment"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_participantId_idx" ON "FinancialAdjustment"("participantId");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_tenantId_status_idx" ON "FinancialAdjustment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialAdjustment_occurredAt_idx" ON "FinancialAdjustment"("occurredAt");

-- CreateIndex
CREATE INDEX "FinancialAdjustmentAllocation_adjustmentId_idx" ON "FinancialAdjustmentAllocation"("adjustmentId");

-- CreateIndex
CREATE INDEX "FinancialAdjustmentAllocation_entitlementId_idx" ON "FinancialAdjustmentAllocation"("entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAdjustmentAllocation_adjustmentId_entitlementId_key" ON "FinancialAdjustmentAllocation"("adjustmentId", "entitlementId");

-- CreateIndex
CREATE INDEX "FinancialPayment_tenantId_idx" ON "FinancialPayment"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialPayment_participantId_idx" ON "FinancialPayment"("participantId");

-- CreateIndex
CREATE INDEX "FinancialPayment_paidAt_idx" ON "FinancialPayment"("paidAt");

-- CreateIndex
CREATE INDEX "FinancialPayment_tenantId_status_idx" ON "FinancialPayment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialPaymentAllocation_paymentId_idx" ON "FinancialPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "FinancialPaymentAllocation_entitlementId_idx" ON "FinancialPaymentAllocation"("entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPaymentAllocation_paymentId_entitlementId_key" ON "FinancialPaymentAllocation"("paymentId", "entitlementId");

-- CreateIndex
CREATE INDEX "FinancialCompanyAllocation_tenantId_idx" ON "FinancialCompanyAllocation"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialCompanyAllocation_stageId_idx" ON "FinancialCompanyAllocation"("stageId");

-- CreateIndex
CREATE INDEX "FinancialCompanyAllocation_appropriatedAt_idx" ON "FinancialCompanyAllocation"("appropriatedAt");

-- CreateIndex
CREATE INDEX "FinancialTaxClosing_tenantId_idx" ON "FinancialTaxClosing"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialTaxClosing_tenantId_status_idx" ON "FinancialTaxClosing"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialTaxClosing_dueDate_idx" ON "FinancialTaxClosing"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTaxClosing_tenantId_competenceYear_competenceMonth_key" ON "FinancialTaxClosing"("tenantId", "competenceYear", "competenceMonth");

-- CreateIndex
CREATE INDEX "FinancialTaxMovement_tenantId_idx" ON "FinancialTaxMovement"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialTaxMovement_closingId_idx" ON "FinancialTaxMovement"("closingId");

-- CreateIndex
CREATE INDEX "FinancialTaxMovement_occurredAt_idx" ON "FinancialTaxMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTaxClosingItem_closingId_idx" ON "FinancialTaxClosingItem"("closingId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTaxClosingItem_taxEntryId_key" ON "FinancialTaxClosingItem"("taxEntryId");

-- CreateIndex
CREATE INDEX "FinancialSettlement_tenantId_idx" ON "FinancialSettlement"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialSettlement_participantId_idx" ON "FinancialSettlement"("participantId");

-- CreateIndex
CREATE INDEX "FinancialSettlement_tenantId_status_idx" ON "FinancialSettlement"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSettlement_tenantId_number_key" ON "FinancialSettlement"("tenantId", "number");

-- CreateIndex
CREATE INDEX "FinancialSettlementItem_settlementId_idx" ON "FinancialSettlementItem"("settlementId");

-- CreateIndex
CREATE INDEX "FinancialSettlementItem_entitlementId_idx" ON "FinancialSettlementItem"("entitlementId");

-- CreateIndex
CREATE INDEX "FinancialSettlementItem_adjustmentId_idx" ON "FinancialSettlementItem"("adjustmentId");

-- CreateIndex
CREATE INDEX "FinancialSettlementItem_paymentId_idx" ON "FinancialSettlementItem"("paymentId");

-- CreateIndex
CREATE INDEX "FinancialDocument_tenantId_idx" ON "FinancialDocument"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialDocument_participantId_idx" ON "FinancialDocument"("participantId");

-- CreateIndex
CREATE INDEX "FinancialDocument_settlementId_idx" ON "FinancialDocument"("settlementId");

-- CreateIndex
CREATE INDEX "FinancialDocument_referenceType_referenceId_idx" ON "FinancialDocument"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocument_tenantId_number_key" ON "FinancialDocument"("tenantId", "number");

-- CreateIndex
CREATE INDEX "FinancialAttachment_tenantId_idx" ON "FinancialAttachment"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialAttachment_tenantId_entityType_entityId_idx" ON "FinancialAttachment"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "FinancialAttachment_type_idx" ON "FinancialAttachment"("type");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_tenantId_idx" ON "FinancialAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_tenantId_entityType_entityId_idx" ON "FinancialAuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_userId_idx" ON "FinancialAuditLog"("userId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_createdAt_idx" ON "FinancialAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "FinancialSale" ADD CONSTRAINT "FinancialSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSale" ADD CONSTRAINT "FinancialSale_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "Construtora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSale" ADD CONSTRAINT "FinancialSale_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "Empreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStage" ADD CONSTRAINT "FinancialStage_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "FinancialSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "FinancialStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "FinancialStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxRule" ADD CONSTRAINT "FinancialTaxRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxEntry" ADD CONSTRAINT "FinancialTaxEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxEntry" ADD CONSTRAINT "FinancialTaxEntry_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "FinancialTaxRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialParticipant" ADD CONSTRAINT "FinancialParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialParticipant" ADD CONSTRAINT "FinancialParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialParticipantAccount" ADD CONSTRAINT "FinancialParticipantAccount_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "FinancialParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntitlement" ADD CONSTRAINT "FinancialEntitlement_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "FinancialStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntitlement" ADD CONSTRAINT "FinancialEntitlement_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "FinancialParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "FinancialParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustmentAllocation" ADD CONSTRAINT "FinancialAdjustmentAllocation_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "FinancialAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAdjustmentAllocation" ADD CONSTRAINT "FinancialAdjustmentAllocation_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "FinancialEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "FinancialParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialParticipantAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPaymentAllocation" ADD CONSTRAINT "FinancialPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinancialPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPaymentAllocation" ADD CONSTRAINT "FinancialPaymentAllocation_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "FinancialEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialCompanyAllocation" ADD CONSTRAINT "FinancialCompanyAllocation_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "FinancialStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialCompanyAllocation" ADD CONSTRAINT "FinancialCompanyAllocation_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxClosing" ADD CONSTRAINT "FinancialTaxClosing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxClosing" ADD CONSTRAINT "FinancialTaxClosing_reserveAccountId_fkey" FOREIGN KEY ("reserveAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxMovement" ADD CONSTRAINT "FinancialTaxMovement_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "FinancialTaxClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxMovement" ADD CONSTRAINT "FinancialTaxMovement_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxClosingItem" ADD CONSTRAINT "FinancialTaxClosingItem_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "FinancialTaxClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTaxClosingItem" ADD CONSTRAINT "FinancialTaxClosingItem_taxEntryId_fkey" FOREIGN KEY ("taxEntryId") REFERENCES "FinancialTaxEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "FinancialParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlementItem" ADD CONSTRAINT "FinancialSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "FinancialSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlementItem" ADD CONSTRAINT "FinancialSettlementItem_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "FinancialEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlementItem" ADD CONSTRAINT "FinancialSettlementItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "FinancialAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlementItem" ADD CONSTRAINT "FinancialSettlementItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinancialPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "FinancialParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "FinancialSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
