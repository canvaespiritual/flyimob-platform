import { CORRETOR_ACADEMY, buildCorretorAcademyCheckoutUrl } from "./config";

export const HOTMART_WEBHOOK_CONTRACT = {
  provider: "HOTMART",
  productId: CORRETOR_ACADEMY.productId,
  documentedEvents: ["PURCHASE_CANCELED", "PURCHASE_COMPLETE", "PURCHASE_APPROVED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_EXPIRED", "PURCHASE_DELAYED", "PURCHASE_REFUND_REQUESTED"] as const,
  status: "blocked_until_account_contract_confirmed" as const,
};

export function hotmartCheckoutUrl(discount = false) { return buildCorretorAcademyCheckoutUrl(discount); }
export function hotmartProcessingIsConfigured() { return Boolean(process.env.HOTMART_WEBHOOK_TOKEN && process.env.HOTMART_WEBHOOK_AUTH_HEADER); }
