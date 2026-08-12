import {
  FinancialAdjustmentStatus,
  FinancialEntitlementStatus,
  FinancialInvoiceStatus,
  FinancialPaymentStatus,
  FinancialReceiptStatus,
  FinancialSaleStatus,
  FinancialStageStatus,
  FinancialTaxClosingStatus,
  FinancialTaxStatus,
} from "@prisma/client";

export type FinancialStatusTone =
  | "gray"
  | "blue"
  | "yellow"
  | "green"
  | "red";

export type FinancialStatusPresentation = {
  label: string;
  tone: FinancialStatusTone;
};

export const saleStatusPresentation: Record<
  FinancialSaleStatus,
  FinancialStatusPresentation
> = {
  OPEN: { label: "Aberta", tone: "gray" },
  PARTIAL: { label: "Parcial", tone: "yellow" },
  RESOLVED: { label: "Resolvida", tone: "green" },
  CANCELLED: { label: "Cancelada", tone: "red" },
};

export const stageStatusPresentation: Record<
  FinancialStageStatus,
  FinancialStatusPresentation
> = {
  EXPECTED: { label: "Prevista", tone: "gray" },
  INVOICED: { label: "Faturada", tone: "blue" },
  AWAITING_RECEIPT: { label: "Aguardando recebimento", tone: "yellow" },
  PARTIALLY_RECEIVED: { label: "Recebida parcialmente", tone: "yellow" },
  RECEIVED: { label: "Recebida", tone: "blue" },
  RESOLVED: { label: "Resolvida", tone: "green" },
  CANCELLED: { label: "Cancelada", tone: "red" },
};

export const invoiceStatusPresentation: Record<
  FinancialInvoiceStatus,
  FinancialStatusPresentation
> = {
  DRAFT: { label: "Rascunho", tone: "gray" },
  ISSUED: { label: "Emitida", tone: "blue" },
  CANCELLED: { label: "Cancelada", tone: "red" },
};

export const receiptStatusPresentation: Record<
  FinancialReceiptStatus,
  FinancialStatusPresentation
> = {
  PENDING: { label: "Pendente", tone: "yellow" },
  CONFIRMED: { label: "Recebido", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "red" },
};

export const taxStatusPresentation: Record<
  FinancialTaxStatus,
  FinancialStatusPresentation
> = {
  PENDING: { label: "Pendente", tone: "yellow" },
  PROVISIONED: { label: "Provisionado", tone: "blue" },
  SEPARATED: { label: "Separado", tone: "green" },
  PAID: { label: "Pago", tone: "green" },
  WITHHELD: { label: "Retido na fonte", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "red" },
};

export const entitlementStatusPresentation: Record<
  FinancialEntitlementStatus,
  FinancialStatusPresentation
> = {
  OPEN: { label: "Em aberto", tone: "yellow" },
  PARTIAL: { label: "Parcial", tone: "yellow" },
  PAID: { label: "Liquidado", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "red" },
};

export const adjustmentStatusPresentation: Record<
  FinancialAdjustmentStatus,
  FinancialStatusPresentation
> = {
  AVAILABLE: { label: "Disponível", tone: "gray" },
  PARTIAL: { label: "Usado parcialmente", tone: "yellow" },
  APPLIED: { label: "Aplicado", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "red" },
};

export const paymentStatusPresentation: Record<
  FinancialPaymentStatus,
  FinancialStatusPresentation
> = {
  PENDING: { label: "Pendente", tone: "yellow" },
  SCHEDULED: { label: "Programado", tone: "blue" },
  PAID: { label: "Pago", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "red" },
};

export const taxClosingStatusPresentation: Record<
  FinancialTaxClosingStatus,
  FinancialStatusPresentation
> = {
  OPEN: { label: "Aberto", tone: "gray" },
  CLOSED: { label: "Fechado", tone: "blue" },
  SEPARATED: { label: "Separado", tone: "green" },
  PAID: { label: "Pago", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "red" },
};