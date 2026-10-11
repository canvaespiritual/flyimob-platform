import { prisma } from "@/lib/prisma";
import type { OfficeIdentity } from "./identity.server";
import { officeEntitlement, officeAdjustment, sumMoney } from "./finance-calculations";
import type { officePeriod } from "./policy";
import type { OfficeDb } from "./db.server";
type Range = ReturnType<typeof officePeriod>;

export async function officeFinance(identity: OfficeIdentity, range: Range, db: OfficeDb = prisma) {
  const where = { tenantId: identity.tenantId, participantId: { in: identity.participantIds } };
  // Same official amounts / allocations as Finance. No calculation of a new commission.
  const [entitlements, adjustments, payments] = await Promise.all([
    db.financialEntitlement.findMany({ where: { ...where, stage: { tenantId: identity.tenantId, sale: { tenantId: identity.tenantId } } }, select: { id: true, role: true, status: true, finalAmount: true, createdAt: true,
      stage: { select: { id: true, type: true, label: true, status: true, expectedReceiptDate: true, receipts: { where: { status: "CONFIRMED" }, select: { id: true } }, sale: { select: { id: true, clientName: true, saleDate: true, status: true } } } },
      paymentAllocations: { where: { payment: where }, select: { amount: true, createdAt: true, payment: { select: { id: true, status: true, paidAt: true } } } },
      adjustmentAllocations: { where: { adjustment: where }, select: { amount: true, appliedAt: true, adjustment: { select: { id: true, type: true, effect: true, description: true } } } },
    }, take: 10001 }),
    db.financialAdjustment.findMany({ where, select: { id: true, type: true, effect: true, amount: true, occurredAt: true, status: true, description: true, allocations: { select: { amount: true, appliedAt: true, entitlement: { select: { participantId: true, stage: { select: { type: true, sale: { select: { clientName: true } } } } } } } } }, take: 10001 }),
    db.financialPayment.findMany({ where, select: { id: true, amount: true, paidAt: true, scheduledAt: true, createdAt: true, status: true, allocations: { select: { amount: true, entitlement: { select: { id: true, participantId: true, stage: { select: { type: true, sale: { select: { clientName: true } } } } } } } } }, take: 10001 }),
  ]);
  if ([entitlements, adjustments, payments].some(rows => rows.length > 10000)) throw new Error("Histórico individual requer relatório paginado.");
  const inPeriod = (date: Date) => date >= range.start && date <= range.end;
  const rights = entitlements.map(e => ({ ...e, ...officeEntitlement(e), date: e.stage.sale.saleDate ?? e.createdAt,
    cancelled: e.status === "CANCELLED" || e.stage.status === "CANCELLED" || e.stage.sale.status === "CANCELLED",
    receivedByCompany: e.stage.receipts.length > 0,
  }));
  const current = rights.filter(e => !e.cancelled);
  const open = adjustments.filter(a => a.status !== "CANCELLED").map(a => ({ ...a, remaining: officeAdjustment(a) }));
  const periodRights = rights.filter(e => inPeriod(e.date));
  const periodPayments = payments.filter(p => inPeriod(p.paidAt ?? p.scheduledAt ?? p.createdAt));
  const attachments = await db.financialAttachment.findMany({ where: { tenantId: identity.tenantId, OR: [
    { entityType: "PAYMENT", entityId: { in: periodPayments.map(p => p.id) } },
    { entityType: "ADJUSTMENT", entityId: { in: adjustments.filter(a => inPeriod(a.occurredAt)).map(a => a.id) } },
  ] }, select: { id: true, entityId: true, originalName: true, url: true } });
  // Existing receipt URLs only, after selecting the authenticated participant's operations.
  const receipts = (id: string) => attachments.filter(a => a.entityId === id).map(a => ({ name: a.originalName, href: a.url }));
  return {
    linked: identity.participantIds.length > 0,
    position: { generated: sumMoney(current.map(e => e.amount)), commissionPaid: sumMoney(current.map(e => e.paid)),
      pendingWithCompanyReceipt: sumMoney(current.filter(e => e.receivedByCompany).map(e => e.remaining)),
      projectedWithoutCompanyReceipt: sumMoney(current.filter(e => !e.receivedByCompany).map(e => e.remaining)),
      advancesOpen: sumMoney(open.filter(a => a.type === "ADVANCE" && a.effect === "DEBIT").map(a => a.remaining)),
      discountsOpen: sumMoney(open.filter(a => a.type === "DISCOUNT" && a.effect === "DEBIT").map(a => a.remaining)),
      otherDebitsOpen: sumMoney(open.filter(a => !["ADVANCE", "DISCOUNT"].includes(a.type) && a.effect === "DEBIT").map(a => a.remaining)),
      creditsOpen: sumMoney(open.filter(a => a.effect === "CREDIT").map(a => a.remaining)),
    },
    period: { generated: sumMoney(periodRights.filter(e => !e.cancelled).map(e => e.amount)), payments: sumMoney(periodPayments.filter(p => p.status === "PAID").map(p => p.amount)), sales: new Set(periodRights.filter(e => !e.cancelled && e.role === "BROKER").map(e => e.stage.sale.id)).size },
    entitlements: periodRights.map(e => ({ id: e.id, date: e.date, client: e.stage.sale.clientName, stage: e.stage.label ?? e.stage.type, role: e.role, status: e.status, cancelled: e.cancelled, amount: e.amount, paid: e.paid, settled: e.settled, remaining: e.remaining, expectedAt: e.stage.expectedReceiptDate, receivedByCompany: e.receivedByCompany,
      history: [...e.paymentAllocations.map(a => ({ date: a.payment.paidAt ?? a.createdAt, description: `Pagamento ${a.payment.status}`, amount: a.amount.toFixed(2) })), ...e.adjustmentAllocations.map(a => ({ date: a.appliedAt, description: `${a.adjustment.type} · ${a.adjustment.effect}`, amount: a.amount.toFixed(2) }))],
    })),
    adjustments: adjustments.filter(a => inPeriod(a.occurredAt)).map(a => ({ id: a.id, date: a.occurredAt, type: a.type, effect: a.effect, description: a.description, status: a.status, amount: a.amount.toFixed(2), remaining: officeAdjustment(a), receipts: receipts(a.id), history: a.allocations.filter(x => identity.participantIds.includes(x.entitlement.participantId)).map(x => ({ date: x.appliedAt, description: `${x.entitlement.stage.sale.clientName} · ${x.entitlement.stage.type}`, amount: x.amount.toFixed(2) })) })),
    payments: periodPayments.map(p => ({ id: p.id, date: p.paidAt ?? p.scheduledAt ?? p.createdAt, status: p.status, amount: p.amount.toFixed(2), receipts: receipts(p.id), history: p.allocations.filter(a => identity.participantIds.includes(a.entitlement.participantId)).map(a => ({ description: `${a.entitlement.stage.sale.clientName} · ${a.entitlement.stage.type}`, amount: a.amount.toFixed(2) })) })),
  };
}
