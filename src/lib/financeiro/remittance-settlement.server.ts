import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const entitlementSelect = Prisma.validator<Prisma.FinancialEntitlementSelect>()({
  id: true, role: true, customRoleLabel: true, calculationBasis: true,
  percentage: true, calculationBaseAmount: true, fixedAmount: true,
  calculatedAmount: true, overrideAmount: true, finalAmount: true,
  adjustmentAllocations: {
    orderBy: { appliedAt: "asc" },
    select: {
      id: true, amount: true, appliedAt: true,
      adjustment: { select: {
        id: true, type: true, effect: true, amount: true, occurredAt: true,
        status: true, description: true, notes: true,
      } },
    },
  },
  stage: { select: {
    id: true, type: true, label: true, sequence: true, status: true,
    sale: { select: {
      id: true, clientName: true, vgv: true, commissionFinalAmount: true,
      construtora: { select: { name: true } },
      empreendimento: { select: { name: true } },
      construtoraNameManual: true, empreendimentoNameManual: true,
      stages: {
        orderBy: { sequence: "asc" },
        select: {
          id: true, type: true, label: true, sequence: true, status: true,
          entitlements: { select: {
            id: true, participantId: true,
            paymentAllocations: {
              where: { payment: { status: "PAID" } },
              orderBy: { createdAt: "asc" },
              select: {
                amount: true,
                payment: { select: { id: true, paidAt: true, status: true } },
              },
            },
          } },
        },
      },
    } },
  } },
});

/** Loads the immutable documentary composition recorded when a remittance was paid. */
export async function loadRemittanceSettlement(tenantId: string, paymentId: string) {
  const settlements = await prisma.financialSettlement.findMany({
    where: {
      tenantId, status: "FINALIZED",
      items: { some: { type: "PAYMENT", paymentId } },
    },
    take: 2,
    select: {
      id: true, grossEntitlementsAmount: true, debitsAmount: true,
      paymentsAmount: true, netAmount: true,
      items: {
        where: { showInDocument: true },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true, type: true, entitlementId: true, adjustmentId: true,
          paymentId: true, description: true, amount: true,
        },
      },
    },
  });

  if (settlements.length === 0) return null;
  if (settlements.length > 1) throw new Error("A remessa possui mais de um fechamento documental.");

  const settlement = settlements[0];
  const entitlementItems = settlement.items.filter(
    (item): item is typeof item & { entitlementId: string } =>
      item.type === "ENTITLEMENT" && Boolean(item.entitlementId)
  );
  const adjustmentItems = settlement.items.filter(
    (item): item is typeof item & { adjustmentId: string } =>
      item.type === "ADJUSTMENT" && Boolean(item.adjustmentId)
  );

  const [entitlements, adjustments] = await Promise.all([
    prisma.financialEntitlement.findMany({
      where: { tenantId, id: { in: entitlementItems.map((item) => item.entitlementId) } },
      select: entitlementSelect,
    }),
    prisma.financialAdjustment.findMany({
      where: { tenantId, id: { in: adjustmentItems.map((item) => item.adjustmentId) } },
      select: {
        id: true, type: true, effect: true, amount: true, occurredAt: true,
        status: true, description: true,
      },
    }),
  ]);

  const entitlementById = new Map(entitlements.map((row) => [row.id, row]));
  const adjustmentById = new Map(adjustments.map((row) => [row.id, row]));

  return {
    ...settlement,
    entitlements: entitlementItems.map((item) => {
      const entitlement = entitlementById.get(item.entitlementId);
      if (!entitlement) throw new Error("Comissão do fechamento não encontrada.");
      return { id: item.id, amount: item.amount, entitlement };
    }),
    adjustments: adjustmentItems.map((item) => {
      const adjustment = adjustmentById.get(item.adjustmentId);
      if (!adjustment) throw new Error("Vale do fechamento não encontrado.");
      return {
        id: adjustment.id, type: adjustment.type, effect: adjustment.effect,
        description: item.description ?? adjustment.description,
        occurredAt: adjustment.occurredAt, originalAmount: adjustment.amount,
        appliedInRemittance: item.amount,
      };
    }),
  };
}
