import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalString,
  requiredDate,
  requiredDecimal,
  requiredString,
} from "@/lib/financeiro/validators";

import {
  refreshFinancialStageStatus,
} from "@/lib/financeiro/stage-status.server";

function number(
  value: unknown
) {
  return Number(
    value || 0
  );
}

function roundMoney(
  value: number
) {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100
    ) / 100
  );
}

export async function POST(
  req: Request
) {
  const auth =
    await getFinanceApiSession();

  if (!auth.ok) {
    return Response.json(
      {
        error:
          auth.error,
      },
      {
        status:
          auth.status,
      }
    );
  }

  try {
    const body =
      await req.json();

    const tenantId =
      auth.session.tenant.id;

    const stageId =
      requiredString(
        body.stageId,
        "Etapa"
      );

    const amount =
      Number(
        requiredDecimal(
          body.amount,
          "Valor"
        )
      );

    if (
      amount <= 0
    ) {
      throw new Error(
        "Informe um valor maior que zero."
      );
    }

    const appropriatedAt =
      requiredDate(
        body.appropriatedAt,
        "Data da apropriação"
      );

    const financialAccountId =
      optionalString(
        body.financialAccountId
      );

    const notes =
      optionalString(
        body.notes
      );

    const result =
      await prisma.$transaction(
        async (tx) => {
          const stage =
            await tx.financialStage.findFirst({
              where: {
                id:
                  stageId,

                tenantId,
              },

              include: {
                receipts: true,

                invoices: {
                  include: {
                    taxEntries:
                      true,
                  },
                },

                entitlements: {
                  include: {
                    paymentAllocations: {
                      include: {
                        payment: {
                          select: {
                            status:
                              true,
                          },
                        },
                      },
                    },

                    adjustmentAllocations: {
                      include: {
                        adjustment: {
                          select: {
                            effect:
                              true,
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
            throw new Error(
              "Etapa não encontrada."
            );
          }

          if (
            financialAccountId
          ) {
            const account =
              await tx.financialAccount.findFirst({
                where: {
                  id:
                    financialAccountId,

                  tenantId,

                  active:
                    true,
                },

                select: {
                  id: true,
                },
              });

            if (!account) {
              throw new Error(
                "Conta financeira da Flyimob não encontrada."
              );
            }
          }

          const received =
            stage.receipts
              .filter(
                (receipt) =>
                  receipt.status ===
                  "CONFIRMED"
              )
              .reduce(
                (
                  total,
                  receipt
                ) =>
                  total +
                  number(
                    receipt.amount
                  ),
                0
              );

          const taxes =
            stage.invoices.flatMap(
              (invoice) =>
                invoice.taxEntries
            );

          const taxSeparated =
            taxes
              .filter(
                (tax) =>
                  tax.kind ===
                    "PAYABLE_BY_COMPANY" &&
                  (
                    tax.status ===
                      "SEPARATED" ||
                    tax.status ===
                      "PAID"
                  )
              )
              .reduce(
                (
                  total,
                  tax
                ) =>
                  total +
                  number(
                    tax.amount
                  ),
                0
              );

          const paid =
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

          const debitAdjustments =
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

          const alreadyAllocated =
            stage.companyAllocations
              .filter(
                (allocation) =>
                  allocation.status ===
                  "APPROPRIATED"
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
              );

          const available =
            roundMoney(
              received -
                taxSeparated -
                paid -
                debitAdjustments -
                alreadyAllocated
            );

          if (
            amount >
            available + 0.009
          ) {
            throw new Error(
              `O valor informado ultrapassa o saldo disponível para apropriação. Disponível: R$ ${available.toLocaleString(
                "pt-BR",
                {
                  minimumFractionDigits:
                    2,
                }
              )}.`
            );
          }

          const allocation =
            await tx.financialCompanyAllocation.create({
              data: {
                tenantId,

                stageId,

                financialAccountId,

                amount:
                  new Prisma.Decimal(
                    amount
                  ),

                status:
                  "APPROPRIATED",

                appropriatedAt,

                notes,
              },
            });

          const status =
            await refreshFinancialStageStatus(
              tx,
              {
                stageId,
                tenantId,
              }
            );

          return {
            allocation,
            status,
          };
        },
        {
          maxWait:
            10000,

          timeout:
            20000,
        }
      );

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          errorMessage(
            error
          ),
      },
      {
        status: 400,
      }
    );
  }
}