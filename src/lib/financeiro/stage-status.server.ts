import {
  Prisma,
} from "@prisma/client";

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

  const invoices =
    stage.invoices.filter(
      (invoice) =>
        invoice.status ===
        "ISSUED"
    );

  const invoiceGross =
    invoices.reduce(
      (total, invoice) =>
        total +
        number(
          invoice.grossAmount
        ),
      0
    );

  const taxes =
    invoices.flatMap(
      (invoice) =>
        invoice.taxEntries
    );

  const payableTaxes =
    taxes.filter(
      (tax) =>
        tax.kind ===
          "PAYABLE_BY_COMPANY" &&
        tax.status !==
          "CANCELLED"
    );

  const totalPayableTax =
    payableTaxes.reduce(
      (total, tax) =>
        total +
        number(tax.amount),
      0
    );

  /*
   * Só conta para a prova real
   * quando o imposto já foi
   * separado ou pago.
   */
  const taxSeparated =
    payableTaxes
      .filter(
        (tax) =>
          tax.status ===
            "SEPARATED" ||
          tax.status ===
            "PAID"
      )
      .reduce(
        (total, tax) =>
          total +
          number(
            tax.amount
          ),
        0
      );

  const confirmedReceipts =
    stage.receipts.filter(
      (receipt) =>
        receipt.status ===
        "CONFIRMED"
    );

  const totalReceived =
    confirmedReceipts.reduce(
      (total, receipt) =>
        total +
        number(
          receipt.amount
        ),
      0
    );

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