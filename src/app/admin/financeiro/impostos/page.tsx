import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import TaxCompetenceManager from "@/components/financeiro/TaxCompetenceManager";
import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

function money(value: unknown) {
  return Number(value || 0);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function competenceLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function defaultDueDate(year: number, month: number) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return new Date(
    Date.UTC(
      nextYear,
      nextMonth - 1,
      20,
      12,
      0,
      0
    )
  );
}

function currentCompetence() {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());

  return {
    year: Number(
      parts.find(
        (part) =>
          part.type === "year"
      )?.value
    ),
    month: Number(
      parts.find(
        (part) =>
          part.type === "month"
      )?.value
    ),
  };
}

function competenceIndex(
  year: number,
  month: number
) {
  return (
    year * 12 +
    month -
    1
  );
}

function fromCompetenceIndex(
  index: number
) {
  return {
    year:
      Math.floor(
        index / 12
      ),
    month:
      (index % 12) +
      1,
  };
}

export default async function FinanceiroImpostosPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
  }>;
}) {
  const session =
    await requireFinanceAccess();

  const tenantId =
    session.tenant.id;

  const params =
    await searchParams;

  const current =
    currentCompetence();

  const [
    firstInvoice,
    firstClosing,
  ] =
    await Promise.all([
      prisma.financialInvoice.findFirst({
        where: {
          tenantId,
          status: "ISSUED",
          competenceYear: {
            not: null,
          },
          competenceMonth: {
            not: null,
          },
        },
        orderBy: [
          {
            competenceYear:
              "asc",
          },
          {
            competenceMonth:
              "asc",
          },
          {
            issuedAt:
              "asc",
          },
        ],
        select: {
          competenceYear:
            true,
          competenceMonth:
            true,
        },
      }),

      prisma.financialTaxClosing.findFirst({
        where: {
          tenantId,
          status: {
            not:
              "CANCELLED",
          },
        },
        orderBy: [
          {
            competenceYear:
              "asc",
          },
          {
            competenceMonth:
              "asc",
          },
        ],
        select: {
          competenceYear:
            true,
          competenceMonth:
            true,
        },
      }),
    ]);

  const firstCandidates: Array<{
    year: number;
    month: number;
  }> = [];

  if (
    firstInvoice?.competenceYear &&
    firstInvoice?.competenceMonth
  ) {
    firstCandidates.push({
      year:
        firstInvoice.competenceYear,
      month:
        firstInvoice.competenceMonth,
    });
  }

  if (firstClosing) {
    firstCandidates.push({
      year:
        firstClosing.competenceYear,
      month:
        firstClosing.competenceMonth,
    });
  }

  const first =
    firstCandidates.length >
    0
      ? firstCandidates.reduce(
          (
            earliest,
            item
          ) =>
            competenceIndex(
              item.year,
              item.month
            ) <
            competenceIndex(
              earliest.year,
              earliest.month
            )
              ? item
              : earliest
        )
      : current;

  const firstIndex =
    competenceIndex(
      first.year,
      first.month
    );

  const currentIndex =
    competenceIndex(
      current.year,
      current.month
    );

  const requestedYear =
    Number(
      params.year
    );

  const requestedMonth =
    Number(
      params.month
    );

  let selectedIndex =
    Number.isInteger(
      requestedYear
    ) &&
    Number.isInteger(
      requestedMonth
    ) &&
    requestedMonth >=
      1 &&
    requestedMonth <=
      12
      ? competenceIndex(
          requestedYear,
          requestedMonth
        )
      : currentIndex;

  selectedIndex =
    Math.max(
      firstIndex,
      Math.min(
        currentIndex,
        selectedIndex
      )
    );

  const selected =
    fromCompetenceIndex(
      selectedIndex
    );

  const selectedYear =
    selected.year;

  const selectedMonth =
    selected.month;

  const [
    invoices,
    closing,
    closings,
    accounts,
  ] =
    await Promise.all([
      prisma.financialInvoice.findMany({
        where: {
          tenantId,
          status:
            "ISSUED",
          competenceYear:
            selectedYear,
          competenceMonth:
            selectedMonth,
        },
        orderBy: [
          {
            issuedAt:
              "asc",
          },
          {
            createdAt:
              "asc",
          },
        ],
        include: {
          taxEntries: {
            where: {
              status: {
                not:
                  "CANCELLED",
              },
            },
            orderBy: {
              createdAt:
                "asc",
            },
          },
          receipts: {
            where: {
              status:
                "CONFIRMED",
            },
            orderBy: {
              receivedAt:
                "asc",
            },
          },
          stage: {
            include: {
              sale: {
                include: {
                  construtora:
                    true,
                },
              },
              receipts: {
                where: {
                  status:
                    "CONFIRMED",
                },
              },
              invoices: {
                where: {
                  status:
                    "ISSUED",
                },
                select: {
                  id:
                    true,
                },
              },
            },
          },
        },
      }),

      prisma.financialTaxClosing.findUnique({
        where: {
          tenantId_competenceYear_competenceMonth:
            {
              tenantId,
              competenceYear:
                selectedYear,
              competenceMonth:
                selectedMonth,
            },
        },
        include: {
          reserveAccount:
            true,
          items: {
            include: {
              taxEntry:
                true,
            },
          },
          movements: {
            include: {
              financialAccount:
                true,
            },
            orderBy: [
              {
                occurredAt:
                  "asc",
              },
              {
                createdAt:
                  "asc",
              },
            ],
          },
        },
      }),

      prisma.financialTaxClosing.findMany({
        where: {
          tenantId,
          status: {
            not:
              "CANCELLED",
          },
        },
        orderBy: [
          {
            competenceYear:
              "desc",
          },
          {
            competenceMonth:
              "desc",
          },
        ],
        take:
          60,
        include: {
          movements: {
            select: {
              type:
                true,
              amount:
                true,
            },
          },
        },
      }),

      prisma.financialAccount.findMany({
        where: {
          tenantId,
          active:
            true,
        },
        orderBy: [
          {
            type:
              "asc",
          },
          {
            name:
              "asc",
          },
        ],
        select: {
          id:
            true,
          name:
            true,
          type:
            true,
          bankName:
            true,
          account:
            true,
        },
      }),
    ]);

  const movementIds =
    closing?.movements.map(
      (
        movement
      ) =>
        movement.id
    ) || [];

  const paymentProofs =
    movementIds.length >
    0
      ? await prisma.financialAttachment.findMany({
          where: {
            tenantId,
            entityType:
              "TAX_MOVEMENT",
            entityId: {
              in:
                movementIds,
            },
            type:
              "TAX_PAYMENT",
          },
          select: {
            entityId:
              true,
          },
        })
      : [];

  const proofMovementIds =
    new Set(
      paymentProofs.map(
        (
          item
        ) =>
          item.entityId
      )
    );

  const invoiceRows =
    invoices.map(
      (
        invoice
      ) => {
        const gross =
          money(
            invoice.grossAmount
          );

        const withheld =
          invoice.taxEntries
            .filter(
              (
                tax
              ) =>
                tax.kind ===
                "WITHHELD_AT_SOURCE"
            )
            .reduce(
              (
                total,
                tax
              ) =>
                total +
                money(
                  tax.amount
                ),
              0
            );

        const payableTax =
          invoice.taxEntries
            .filter(
              (
                tax
              ) =>
                tax.kind ===
                "PAYABLE_BY_COMPANY"
            )
            .reduce(
              (
                total,
                tax
              ) =>
                total +
                money(
                  tax.amount
                ),
              0
            );

        const directReceipts =
          invoice.receipts.reduce(
            (
              total,
              receipt
            ) =>
              total +
              money(
                receipt.amount
              ),
            0
          );

        const unlinkedStageReceipts =
          invoice.stage.invoices.length ===
          1
            ? invoice.stage.receipts
                .filter(
                  (
                    receipt
                  ) =>
                    !receipt.invoiceId
                )
                .reduce(
                  (
                    total,
                    receipt
                  ) =>
                    total +
                    money(
                      receipt.amount
                    ),
                  0
                )
            : 0;

        const expectedCash =
          Math.max(
            0,
            gross -
              withheld
          );

        const received =
          Math.min(
            expectedCash,
            directReceipts +
              unlinkedStageReceipts
          );

        const receivable =
          Math.max(
            0,
            expectedCash -
              received
          );

        const sale =
          invoice.stage.sale;

        return {
          id:
            invoice.id,
          number:
            invoice.number ||
            "Sem número",
          issuedAt:
            invoice.issuedAt
              ? invoice.issuedAt.toISOString()
              : null,
          clientName:
            sale.clientName,
          construtoraName:
            sale.construtora?.name ||
            sale.construtoraNameManual ||
            "—",
          stageType:
            invoice.stage.type,
          stageLabel:
            invoice.stage.label,
          grossAmount:
            round(
              gross
            ),
          withheldAmount:
            round(
              withheld
            ),
          expectedCash:
            round(
              expectedCash
            ),
          receivedAmount:
            round(
              received
            ),
          receivableAmount:
            round(
              receivable
            ),
          provisionedTaxAmount:
            round(
              payableTax
            ),
          taxEntries:
            invoice.taxEntries
              .filter(
                (
                  tax
                ) =>
                  tax.kind ===
                  "PAYABLE_BY_COMPANY"
              )
              .map(
                (
                  tax
                ) => ({
                  id:
                    tax.id,
                  name:
                    tax.name,
                  rate:
                    tax.rate
                      ? money(
                          tax.rate
                        )
                      : null,
                  amount:
                    round(
                      money(
                        tax.amount
                      )
                    ),
                  status:
                    tax.status,
                })
              ),
        };
      }
    );

  const totals =
    invoiceRows.reduce(
      (
        acc,
        invoice
      ) => {
        acc.gross +=
          invoice.grossAmount;
        acc.withheld +=
          invoice.withheldAmount;
        acc.expectedCash +=
          invoice.expectedCash;
        acc.received +=
          invoice.receivedAmount;
        acc.receivable +=
          invoice.receivableAmount;
        acc.provisionedTax +=
          invoice.provisionedTaxAmount;

        return acc;
      },
      {
        gross:
          0,
        withheld:
          0,
        expectedCash:
          0,
        received:
          0,
        receivable:
          0,
        provisionedTax:
          0,
      }
    );

  const movementTotals =
    closing?.movements.reduce(
      (
        acc,
        movement
      ) => {
        const amount =
          money(
            movement.amount
          );

        if (
          movement.type ===
          "SEPARATION"
        ) {
          acc.separated +=
            amount;
        }

        if (
          movement.type ===
          "PAYMENT"
        ) {
          acc.paid +=
            amount;
        }

        if (
          movement.type ===
          "ADJUSTMENT"
        ) {
          acc.adjustments +=
            amount;
        }

        return acc;
      },
      {
        separated:
          0,
        paid:
          0,
        adjustments:
          0,
      }
    ) || {
      separated:
        0,
      paid:
        0,
      adjustments:
        0,
    };

  const principal =
    closing?.actualTaxAmount !=
    null
      ? money(
          closing.actualTaxAmount
        )
      : totals.provisionedTax;

  const effectiveObligation =
    Math.max(
      0,
      principal +
        movementTotals.adjustments
    );

  const paymentMovements =
    closing?.movements.filter(
      (
        movement
      ) =>
        movement.type ===
        "PAYMENT"
    ) || [];

  const paymentsHaveProof =
    paymentMovements.length >
      0 &&
    paymentMovements.every(
      (
        movement
      ) =>
        proofMovementIds.has(
          movement.id
        )
    );

  const amountFullyPaid =
    effectiveObligation >
      0 &&
    movementTotals.paid +
      0.009 >=
      effectiveObligation;

  const readyToComplete =
    Boolean(
      closing &&
        closing.status !==
          "OPEN" &&
        closing.status !==
          "CANCELLED" &&
        closing.status !==
          "PAID" &&
        closing.actualTaxAmount !==
          null &&
        amountFullyPaid &&
        paymentsHaveProof
    );

  const closingData =
    closing
      ? {
          id:
            closing.id,
          status:
            closing.status,
          competenceYear:
            closing.competenceYear,
          competenceMonth:
            closing.competenceMonth,
          provisionedAmount:
            round(
              money(
                closing.provisionedAmount
              )
            ),
          separatedAmount:
            round(
              movementTotals.separated
            ),
          actualTaxAmount:
            closing.actualTaxAmount !=
            null
              ? round(
                  money(
                    closing.actualTaxAmount
                  )
                )
              : null,
          effectiveObligation:
            round(
              effectiveObligation
            ),
          paidAmount:
            round(
              movementTotals.paid
            ),
          adjustmentsAmount:
            round(
              movementTotals.adjustments
            ),
          dueDate:
            (
              closing.dueDate ||
              defaultDueDate(
                selectedYear,
                selectedMonth
              )
            ).toISOString(),
          closedAt:
            closing.closedAt?.toISOString() ??
            null,
          separatedAt:
            closing.separatedAt?.toISOString() ??
            null,
          paidAt:
            closing.paidAt?.toISOString() ??
            null,
          reserveAccountId:
            closing.reserveAccountId,
          notes:
            closing.notes,
          paymentsHaveProof,
          amountFullyPaid,
          readyToComplete,
          movements:
            closing.movements.map(
              (
                movement
              ) => ({
                id:
                  movement.id,
                type:
                  movement.type,
                amount:
                  round(
                    money(
                      movement.amount
                    )
                  ),
                occurredAt:
                  movement.occurredAt.toISOString(),
                financialAccountId:
                  movement.financialAccountId,
                accountName:
                  movement.financialAccount?.name ||
                  null,
                description:
                  movement.description,
                notes:
                  movement.notes,
                hasPaymentProof:
                  movement.type ===
                    "PAYMENT"
                    ? proofMovementIds.has(
                        movement.id
                      )
                    : false,
              })
            ),
        }
      : null;

  const history =
    closings.map(
      (
        item
      ) => {
        const paid =
          item.movements
            .filter(
              (
                movement
              ) =>
                movement.type ===
                "PAYMENT"
            )
            .reduce(
              (
                total,
                movement
              ) =>
                total +
                money(
                  movement.amount
                ),
              0
            );

        const adjustments =
          item.movements
            .filter(
              (
                movement
              ) =>
                movement.type ===
                "ADJUSTMENT"
            )
            .reduce(
              (
                total,
                movement
              ) =>
                total +
                money(
                  movement.amount
                ),
              0
            );

        const actual =
          item.actualTaxAmount !=
          null
            ? money(
                item.actualTaxAmount
              )
            : null;

        return {
          id:
            item.id,
          year:
            item.competenceYear,
          month:
            item.competenceMonth,
          label:
            competenceLabel(
              item.competenceYear,
              item.competenceMonth
            ),
          status:
            item.status,
          provisionedAmount:
            round(
              money(
                item.provisionedAmount
              )
            ),
          actualTaxAmount:
            actual !=
            null
              ? round(
                  actual
                )
              : null,
          adjustmentsAmount:
            round(
              adjustments
            ),
          paidAmount:
            round(
              paid
            ),
          dueDate:
            item.dueDate?.toISOString() ??
            null,
        };
      }
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <FinanceiroNav />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <TaxCompetenceManager
          year={
            selectedYear
          }
          month={
            selectedMonth
          }
          competenceLabel={
            competenceLabel(
              selectedYear,
              selectedMonth
            )
          }
          firstCompetence={
            first
          }
          currentCompetence={
            current
          }
          invoices={
            invoiceRows
          }
          totals={{
            invoiceCount:
              invoiceRows.length,
            grossAmount:
              round(
                totals.gross
              ),
            withheldAmount:
              round(
                totals.withheld
              ),
            expectedCash:
              round(
                totals.expectedCash
              ),
            receivedAmount:
              round(
                totals.received
              ),
            receivableAmount:
              round(
                totals.receivable
              ),
            provisionedTaxAmount:
              round(
                totals.provisionedTax
              ),
          }}
          closing={
            closingData
          }
          accounts={
            accounts
          }
          history={
            history
          }
          defaultDueDate={
            defaultDueDate(
              selectedYear,
              selectedMonth
            ).toISOString()
          }
        />
      </main>
    </div>
  );
}
