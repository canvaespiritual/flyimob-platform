import {
  Prisma,
} from "@prisma/client";
import { stageInvoiceEconomics } from "./invoice-economics.server";

type PrismaLike =
  Prisma.TransactionClient;

function number(
  value: unknown
) {
  return Number(value || 0);
}

function roundMoney(
  value: number
) {
  return (
    Math.round(
      (value + Number.EPSILON) *
        100
    ) / 100
  );
}

export async function refreshFinancialStageStatus(
  prisma: PrismaLike,
  {
    stageId,
    tenantId,
  }: {
    stageId: string;
    tenantId: string;
  }
) {
  const stage =
    await prisma.financialStage.findFirst({
      where: {
        id: stageId,
        tenantId,
      },

      include: {
        invoices: {
          include: {
            taxEntries: true,
          },
        },
        invoiceAllocations: { include: { invoice: { include: { taxEntries: true, allocations: true } } } },

        receipts: true,

        entitlements: {
          include: {
            paymentAllocations: {
              include: {
                payment: {
                  select: {
                    status: true,
                  },
                },
              },
            },

            adjustmentAllocations: {
              include: {
                adjustment: {
                  select: {
                    effect: true,
                  },
                },
              },
            },
          },
        },

        companyAllocations: true,
      },
    });

  if (!stage) {
    return null;
  }

  if (
    stage.status ===
    "CANCELLED"
  ) {
    return {
      status:
        stage.status,
    };
  }

  const economics = stageInvoiceEconomics(stage);
  const invoiceGross = Number(economics.gross);
  const totalPayableTax = Number(economics.payable);
  const taxSeparated = Number(economics.payableSeparated);

  const totalReceived = Number(economics.received);

  /*
   * PIX/pagamentos reais.
   */
  const participantPayments =
    stage.entitlements.reduce(
      (
        stageTotal,
        entitlement
      ) =>
        stageTotal +
        entitlement.paymentAllocations
          .filter(
            (allocation) =>
              allocation.payment
                .status ===
              "PAID"
          )
          .reduce(
            (
              total,
              allocation
            ) =>
              total +
              number(
                allocation.amount
              ),
            0
          ),
      0
    );

  /*
   * Vales DEBIT aplicados
   * também liquidam parte
   * do direito do participante.
   */
  const participantDebitAdjustments =
    stage.entitlements.reduce(
      (
        stageTotal,
        entitlement
      ) =>
        stageTotal +
        entitlement.adjustmentAllocations
          .filter(
            (allocation) =>
              allocation.adjustment
                .effect ===
              "DEBIT"
          )
          .reduce(
            (
              total,
              allocation
            ) =>
              total +
              number(
                allocation.amount
              ),
            0
          ),
      0
    );

  const participantSettled =
    participantPayments +
    participantDebitAdjustments;

  const companyAllocated =
    stage.companyAllocations
      .filter(
        (allocation) =>
          allocation.status ===
          "APPROPRIATED"
      )
      .reduce(
        (total, allocation) =>
          total +
          number(
            allocation.amount
          ),
        0
      );

  const difference =
    roundMoney(
      totalReceived -
        taxSeparated -
        participantSettled -
        companyAllocated
    );

  let status =
    stage.status;

  if (
    totalReceived <= 0 &&
    invoiceGross <= 0
  ) {
    status =
      "EXPECTED";
  } else if (
    invoiceGross > 0 &&
    totalReceived <= 0
  ) {
    status =
      "AWAITING_RECEIPT";
  } else if (
    totalReceived > 0 &&
    Math.abs(
      difference
    ) <= 0.01
  ) {
    status =
      "RESOLVED";
  } else if (
    totalReceived > 0
  ) {
    status =
      "RECEIVED";
  } else {
    status =
      "INVOICED";
  }

  await prisma.financialStage.update({
    where: {
      id: stage.id,
    },

    data: {
      status,

      resolvedAt:
        status ===
        "RESOLVED"
          ? new Date()
          : null,
    },
  });

  return {
    status,

    invoiceGross:
      roundMoney(
        invoiceGross
      ),

    totalReceived:
      roundMoney(
        totalReceived
      ),

    totalPayableTax:
      roundMoney(
        totalPayableTax
      ),

    taxSeparated:
      roundMoney(
        taxSeparated
      ),

    participantSettled:
      roundMoney(
        participantSettled
      ),

    companyAllocated:
      roundMoney(
        companyAllocated
      ),

    difference,
  };
}
