import { CORRETOR_ACADEMY, buildCorretorAcademyCheckoutUrl } from "./config";
import { Prisma, type AcademySaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const HOTMART_WEBHOOK_CONTRACT = {
  provider: "HOTMART",
  productId: CORRETOR_ACADEMY.productId,
  documentedEvents: ["PURCHASE_BILLET_PRINTED", "PURCHASE_DELAYED", "PURCHASE_APPROVED", "PURCHASE_COMPLETE", "PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"] as const,
  status: "confirmed_for_account_payload" as const,
};

export function hotmartCheckoutUrl(discount = false) { return buildCorretorAcademyCheckoutUrl(discount); }
export function hotmartProcessingIsConfigured() { return Boolean(process.env.HOTMART_HOTTOK); }

export const HOTMART_STATUS_BY_EVENT = {
  PURCHASE_BILLET_PRINTED: "PENDING",
  PURCHASE_DELAYED: "PENDING",
  PURCHASE_APPROVED: "APPROVED",
  PURCHASE_COMPLETE: "COMPLETED",
  PURCHASE_CANCELED: "CANCELLED",
  PURCHASE_REFUNDED: "REFUNDED",
  PURCHASE_CHARGEBACK: "CHARGEBACK",
} as const;

type HotmartPayload = {
  id: string; creation_date: number; event: keyof typeof HOTMART_STATUS_BY_EVENT; version: "2.0.0";
  data: { product: { id?: string | number; ucode?: string; name?: string }; buyer: { email?: string; name?: string; checkout_phone_code?: string; checkout_phone?: string }; purchase: { status?: string; transaction: string; order_date?: number; approved_date?: number; price?: { value?: number; currency_value?: string }; full_price?: { value?: number }; offer?: { code?: string; coupon_code?: string } } };
};

function text(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
export function isHotmartPayload(value: unknown): value is HotmartPayload {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const data = body.data as Record<string, unknown> | undefined;
  const purchase = data?.purchase as Record<string, unknown> | undefined;
  return Boolean(text(body.id, 120) && number(body.creation_date) && body.version === "2.0.0" && typeof body.event === "string" && HOTMART_STATUS_BY_EVENT[body.event as keyof typeof HOTMART_STATUS_BY_EVENT] && data?.product && data?.buyer && text(purchase?.transaction, 120));
}
function date(value: number | undefined) { return typeof value === "number" && Number.isFinite(value) ? new Date(value) : null; }
function allowedProduct(product: HotmartPayload["data"]["product"]) { return [product.id, product.ucode].map((value) => String(value ?? "")).includes(CORRETOR_ACADEMY.productId); }
function nextStatus(current: string | null, incoming: string): AcademySaleStatus {
  const rank: Record<string, number> = { PENDING: 1, APPROVED: 2, COMPLETED: 3, CANCELLED: 4, REFUNDED: 5, CHARGEBACK: 6 };
  if (!current || current === incoming) return incoming as AcademySaleStatus;
  if (["REFUNDED", "CHARGEBACK"].includes(current)) return current as AcademySaleStatus;
  if (["CANCELLED", "COMPLETED"].includes(current) && rank[current] >= rank[incoming]) return current as AcademySaleStatus;
  return incoming as AcademySaleStatus;
}

export async function processHotmartWebhook(payload: unknown) {
  if (!isHotmartPayload(payload)) throw new Error("invalid_hotmart_payload");
  const body = payload;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.academyWebhookEvent.findUnique({ where: { provider_providerEventId: { provider: "HOTMART", providerEventId: body.id } } });
    if (existing) return { duplicate: true, saleId: existing.saleId };
    const event = await tx.academyWebhookEvent.create({ data: { provider: "HOTMART", providerEventId: body.id, transactionId: body.data.purchase.transaction, eventType: body.event, payload: body as Prisma.InputJsonValue, processingStatus: "RECEIVED" } });
    if (!allowedProduct(body.data.product) || body.data.purchase.offer?.code !== CORRETOR_ACADEMY.offerId) {
      await tx.academyWebhookEvent.update({ where: { id: event.id }, data: { processingStatus: "REJECTED", processedAt: new Date(), processingError: "product_or_offer_not_academy" } });
      return { rejected: true, saleId: null };
    }
    const email = text(body.data.buyer.email, 320)?.toLowerCase() ?? null;
    const leads = email ? await tx.academyLead.findMany({ where: { email, session: { funnelKey: CORRETOR_ACADEMY.funnelKey } }, include: { session: true }, take: 2 }) : [];
    const lead = leads.length === 1 ? leads[0] : null;
    const amount = number(body.data.purchase.price?.value);
    const status = HOTMART_STATUS_BY_EVENT[body.event];
    const existingSale = await tx.academySale.findUnique({ where: { provider_providerTransactionId: { provider: "HOTMART", providerTransactionId: body.data.purchase.transaction } } });
    const sale = existingSale ? await tx.academySale.update({ where: { id: existingSale.id }, data: { status: nextStatus(existingSale.status, status), buyerName: text(body.data.buyer.name, 160) ?? existingSale.buyerName, buyerEmail: email ?? existingSale.buyerEmail, buyerPhone: [body.data.buyer.checkout_phone_code, body.data.buyer.checkout_phone].filter(Boolean).join(" ") || existingSale.buyerPhone, productId: String(body.data.product.id ?? body.data.product.ucode ?? ""), productName: text(body.data.product.name, 200) ?? existingSale.productName, offerId: body.data.purchase.offer?.code ?? existingSale.offerId, currency: body.data.purchase.price?.currency_value ?? existingSale.currency, grossAmount: amount == null ? existingSale.grossAmount : new Prisma.Decimal(amount), approvedAt: status === "APPROVED" && !existingSale.approvedAt ? date(body.data.purchase.approved_date) : existingSale.approvedAt, leadId: existingSale.leadId ?? lead?.id, sessionId: existingSale.sessionId ?? lead?.sessionId } }) : await tx.academySale.create({ data: { provider: "HOTMART", providerTransactionId: body.data.purchase.transaction, status, buyerName: text(body.data.buyer.name, 160), buyerEmail: email, buyerPhone: [body.data.buyer.checkout_phone_code, body.data.buyer.checkout_phone].filter(Boolean).join(" ") || null, productId: String(body.data.product.id ?? body.data.product.ucode ?? ""), productName: text(body.data.product.name, 200), offerId: body.data.purchase.offer?.code ?? null, currency: body.data.purchase.price?.currency_value ?? null, grossAmount: amount == null ? null : new Prisma.Decimal(amount), approvedAt: status === "APPROVED" ? date(body.data.purchase.approved_date) : null, leadId: lead?.id ?? null, sessionId: lead?.sessionId ?? null } });
    await tx.academyWebhookEvent.update({ where: { id: event.id }, data: { saleId: sale.id, processingStatus: "PROCESSED", processedAt: new Date() } });
    return { duplicate: false, saleId: sale.id, status: sale.status };
  });
}
