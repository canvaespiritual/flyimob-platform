import {
  FinancialAdjustmentStatus,
  FinancialEntitlementStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalString,
  requiredDate,
  requiredString,
} from "@/lib/financeiro/validators";

function money(
  value: Prisma.Decimal | number | string | null | undefined
) {
  return Number(value || 0);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/*
 * ============================================================
 * GET
 *
 * Monta a tela de pagamento:
 * - direito total
 * - quanto já foi pago
 * - quanto já foi abatido por vales
 * - saldo ainda devido
 * - PIX/contas
 * - vales disponíveis
 * ============================================================
 */

export async function GET(req: Request) {
  const auth =
    await getFinanceApiSession();

  if (!auth.ok) {
    return Response.json(
      {
        error: auth.error,
      },
      {
        status: auth.status,
      }
    );
  }

  try {
    const tenantId =
      auth.session.tenant.id;

    const url =
      new URL(req.url);

    const entitlementId =
      requiredString(
        url.searchParams.get(
          "entitlementId"
        ),
        "Comissão"
      );

    const entitlement =
      await prisma.financialEntitlement.findFirst({
        where: {
          id: entitlementId,
          tenantId,
        },

        include: {
          participant: {
            include: {
              accounts: {
                where: {
                  active: true,
                },

                orderBy: [
                  {
                    preferred: "desc",
                  },
                  {
                    createdAt: "desc",
                  },
                ],
              },
            },
          },

          stage: {
            include: {
              sale: {
                select: {
                  id: true,
                  clientName: true,
                },
              },
            },
          },

          paymentAllocations: {
            include: {
              payment: {
                select: {
                  id: true,
                  amount: true,
                  paidAt: true,
                  status: true,
                },
              },
            },

            orderBy: {
              createdAt: "asc",
            },
          },

          adjustmentAllocations: {
            include: {
              adjustment: {
                select: {
                  id: true,
                  type: true,
                  effect: true,
                  description: true,
                },
              },
            },

            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

    if (!entitlement) {
      return Response.json(
        {
          error:
            "Comissão não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const finalAmount =
      money(
        entitlement.finalAmount
      );

    /*
     * Só pagamentos efetivamente PAID liquidam comissão.
     */
    const paidAmount =
      entitlement.paymentAllocations
        .filter(
          (allocation) =>
            allocation.payment.status ===
            "PAID"
        )
        .reduce(
          (total, allocation) =>
            total +
            money(
              allocation.amount
            ),
          0
        );

    /*
     * Débito = vale descontado.
     * Crédito = aumenta o que ainda é devido.
     *
     * Neste painel vamos permitir aplicação somente
     * de DEBIT, mas o cálculo já respeita ambos.
     */
    const debitApplied =
      entitlement.adjustmentAllocations
        .filter(
          (allocation) =>
            allocation.adjustment.effect ===
            "DEBIT"
        )
        .reduce(
          (total, allocation) =>
            total +
            money(
              allocation.amount
            ),
          0
        );

    const creditApplied =
      entitlement.adjustmentAllocations
        .filter(
          (allocation) =>
            allocation.adjustment.effect ===
            "CREDIT"
        )
        .reduce(
          (total, allocation) =>
            total +
            money(
              allocation.amount
            ),
          0
        );

    const entitlementBalance =
      Math.max(
        0,
        round(
          finalAmount -
            paidAmount -
            debitApplied +
            creditApplied
        )
      );

    /*
     * Vales ainda utilizáveis do participante.
     */
    const adjustments =
      await prisma.financialAdjustment.findMany({
        where: {
          tenantId,

          participantId:
            entitlement.participantId,

          effect:
            "DEBIT",

          status: {
            in: [
              "AVAILABLE",
              "PARTIAL",
            ],
          },
        },

        orderBy: [
          {
            occurredAt: "asc",
          },
          {
            createdAt: "asc",
          },
        ],

        include: {
          allocations: {
            select: {
              amount: true,
            },
          },
        },
      });

    const availableAdjustments =
      adjustments
        .map(
          (adjustment) => {
            const used =
              adjustment.allocations.reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  money(
                    allocation.amount
                  ),
                0
              );

            const original =
              money(
                adjustment.amount
              );

            const remaining =
              Math.max(
                0,
                round(
                  original -
                    used
                )
              );

            return {
              id:
                adjustment.id,

              type:
                adjustment.type,

              description:
                adjustment.description,

              occurredAt:
                adjustment.occurredAt.toISOString(),

              originalAmount:
                original,

              usedAmount:
                used,

              remainingAmount:
                remaining,

              status:
                adjustment.status,
            };
          }
        )
        .filter(
          (item) =>
            item.remainingAmount >
            0.009
        );

    return Response.json({
      ok: true,

      entitlement: {
        id:
          entitlement.id,

        status:
          entitlement.status,

        participantId:
          entitlement.participantId,

        participantName:
          entitlement.participant.name,

        clientName:
          entitlement.stage.sale.clientName,

        stageLabel:
          entitlement.stage.label,

        stageType:
          entitlement.stage.type,

        finalAmount,

        paidAmount:
          round(
            paidAmount
          ),

        debitApplied:
          round(
            debitApplied
          ),

        creditApplied:
          round(
            creditApplied
          ),

        balance:
          entitlementBalance,
      },

      accounts:
        entitlement.participant.accounts.map(
          (account) => ({
            id:
              account.id,

            pixType:
              account.pixType,

            pixKey:
              account.pixKey,

            bankName:
              account.bankName,

            agency:
              account.agency,

            account:
              account.account,

            accountType:
              account.accountType,

            holderName:
              account.holderName,

            holderCpfCnpj:
              account.holderCpfCnpj,

            preferred:
              account.preferred,
          })
        ),

      adjustments:
        availableAdjustments,

      history: {
        payments:
          entitlement.paymentAllocations.map(
            (allocation) => ({
              id:
                allocation.payment.id,

              amount:
                money(
                  allocation.amount
                ),

              status:
                allocation.payment.status,

              paidAt:
                allocation.payment.paidAt?.toISOString() ??
                null,
            })
          ),

        adjustments:
          entitlement.adjustmentAllocations.map(
            (allocation) => ({
              id:
                allocation.id,

              adjustmentId:
                allocation.adjustment.id,

              description:
                allocation.adjustment.description,

              effect:
                allocation.adjustment.effect,

              amount:
                money(
                  allocation.amount
                ),

              appliedAt:
                allocation.appliedAt.toISOString(),
            })
          ),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          errorMessage(error),
      },
      {
        status: 400,
      }
    );
  }
}

/*
 * ============================================================
 * POST
 *
 * Confirma:
 * - descontos de vales
 * - PIX real
 * - pagamento ligado à comissão
 * - status dos vales
 * - status da comissão
 * ============================================================
 */

export async function POST(req: Request) {
  const auth =
    await getFinanceApiSession();

  if (!auth.ok) {
    return Response.json(
      {
        error: auth.error,
      },
      {
        status: auth.status,
      }
    );
  }

  try {
    const body =
      await req.json();

    const tenantId =
      auth.session.tenant.id;

    const entitlementId =
      requiredString(
        body.entitlementId,
        "Comissão"
      );

    const destinationAccountId =
      optionalString(
        body.destinationAccountId
      );

    const paidAt =
      requiredDate(
        body.paidAt,
        "Data do pagamento"
      );

    const notes =
      optionalString(
        body.notes
      );

    const requestedAdjustments:
      Array<{
        adjustmentId: string;
        amount: number;
      }> =
      Array.isArray(
        body.adjustments
      )
        ? body.adjustments
            .map(
              (item: {
                adjustmentId?: unknown;
                amount?: unknown;
              }) => ({
                adjustmentId:
                  String(
                    item.adjustmentId ||
                      ""
                  ),

                amount:
                  Number(
                    String(
                      item.amount ||
                        "0"
                    )
                      .replace(
                        /\./g,
                        ""
                      )
                      .replace(
                        ",",
                        "."
                      )
                  ),
              })
            )
            .filter(
                (
                    item: {
                    adjustmentId: string;
                    amount: number;
                    }
                ) =>
                    item.adjustmentId &&
                    Number.isFinite(
                    item.amount
                    ) &&
                    item.amount > 0
                )
        : [];

    /*
     * Usamos transação porque vale + pagamento + status
     * precisam andar juntos.
     *
     * Timeout maior para evitar o problema de 5s que
     * você encontrou anteriormente no Railway.
     */

    const result =
      await prisma.$transaction(
        async (tx) => {
          const entitlement =
            await tx.financialEntitlement.findFirst({
              where: {
                id:
                  entitlementId,

                tenantId,
              },

              include: {
                participant: {
                  include: {
                    accounts: {
                      where: {
                        active:
                          true,
                      },

                      orderBy: [
                        {
                          preferred:
                            "desc",
                        },
                        {
                          createdAt:
                            "desc",
                        },
                      ],
                    },
                  },
                },

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
            });

          if (!entitlement) {
            throw new Error(
              "Comissão não encontrada."
            );
          }

          if (
            entitlement.status ===
            "CANCELLED"
          ) {
            throw new Error(
              "Esta comissão foi cancelada."
            );
          }

          const finalAmount =
            money(
              entitlement.finalAmount
            );

          const paidBefore =
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
                  money(
                    allocation.amount
                  ),
                0
              );

          const debitBefore =
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
                  money(
                    allocation.amount
                  ),
                0
              );

          const creditBefore =
            entitlement.adjustmentAllocations
              .filter(
                (allocation) =>
                  allocation.adjustment
                    .effect ===
                  "CREDIT"
              )
              .reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  money(
                    allocation.amount
                  ),
                0
              );

          const balanceBefore =
            Math.max(
              0,
              round(
                finalAmount -
                  paidBefore -
                  debitBefore +
                  creditBefore
              )
            );

          if (
            balanceBefore <=
            0.009
          ) {
            throw new Error(
              "Esta comissão já está liquidada."
            );
          }

          /*
           * Validar conta bancária / PIX.
           */
          let destinationAccount:
            | typeof entitlement.participant.accounts[number]
            | null =
            null;

          if (
            destinationAccountId
          ) {
            destinationAccount =
              entitlement.participant.accounts.find(
                (account) =>
                  account.id ===
                  destinationAccountId
              ) ||
              null;

            if (
              !destinationAccount
            ) {
              throw new Error(
                "A conta de destino selecionada não pertence a este participante."
              );
            }
          } else {
            destinationAccount =
              entitlement.participant.accounts[0] ||
              null;
          }

          /*
           * Validar os vales e calcular o total a abater.
           */
          let totalDebitNow =
            0;

          const validatedAdjustments:
            Array<{
              id: string;
              amount: number;
              remainingBefore: number;
            }> =
            [];

          for (
            const requested
            of requestedAdjustments
          ) {
            const adjustment =
              await tx.financialAdjustment.findFirst({
                where: {
                  id:
                    requested.adjustmentId,

                  tenantId,

                  participantId:
                    entitlement.participantId,

                  effect:
                    "DEBIT",

                  status: {
                    in: [
                      "AVAILABLE",
                      "PARTIAL",
                    ],
                  },
                },

                include: {
                  allocations: {
                    select: {
                      amount:
                        true,
                    },
                  },
                },
              });

            if (
              !adjustment
            ) {
              throw new Error(
                "Um dos vales informados não está mais disponível."
              );
            }

            /*
             * O schema possui unique(adjustmentId, entitlementId),
             * então um mesmo vale só pode ser aplicado uma vez
             * nesta comissão.
             */
            const existingAllocation =
              await tx.financialAdjustmentAllocation.findUnique({
                where: {
                  adjustmentId_entitlementId:
                    {
                      adjustmentId:
                        adjustment.id,

                      entitlementId:
                        entitlement.id,
                    },
                },
              });

            if (
              existingAllocation
            ) {
              throw new Error(
                "Este vale já possui uma compensação nesta comissão."
              );
            }

            const used =
              adjustment.allocations.reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  money(
                    allocation.amount
                  ),
                0
              );

            const remaining =
              Math.max(
                0,
                round(
                  money(
                    adjustment.amount
                  ) -
                    used
                )
              );

            const applyAmount =
              round(
                requested.amount
              );

            if (
              applyAmount >
              remaining +
                0.009
            ) {
              throw new Error(
                `O valor escolhido para o vale "${adjustment.description || "Vale"}" é maior que o saldo disponível.`
              );
            }

            validatedAdjustments.push(
              {
                id:
                  adjustment.id,

                amount:
                  applyAmount,

                remainingBefore:
                  remaining,
              }
            );

            totalDebitNow +=
              applyAmount;
          }

          totalDebitNow =
            round(
              totalDebitNow
            );

          if (
            totalDebitNow >
            balanceBefore +
              0.009
          ) {
            throw new Error(
              "Os descontos selecionados são maiores que o saldo da comissão."
            );
          }

          /*
           * O dinheiro efetivamente transferido é:
           *
           * saldo devido - vales usados agora
           */
          const pixAmount =
            Math.max(
              0,
              round(
                balanceBefore -
                  totalDebitNow
              )
            );

          /*
           * Aplicar vales.
           */
          for (
            const item
            of validatedAdjustments
          ) {
            await tx.financialAdjustmentAllocation.create({
              data: {
                adjustmentId:
                  item.id,

                entitlementId:
                  entitlement.id,

                amount:
                  new Prisma.Decimal(
                    item.amount
                  ),
              },
            });

            const remainingAfter =
              round(
                item.remainingBefore -
                  item.amount
              );

            const nextStatus:
              FinancialAdjustmentStatus =
              remainingAfter <=
              0.009
                ? "APPLIED"
                : "PARTIAL";

            await tx.financialAdjustment.update({
              where: {
                id:
                  item.id,
              },

              data: {
                status:
                  nextStatus,

                appliedAt:
                  nextStatus ===
                  "APPLIED"
                    ? paidAt
                    : null,
              },
            });
          }

          /*
           * Criar pagamento somente se houve PIX real.
           *
           * É perfeitamente possível liquidar uma comissão
           * inteira somente com vales e o PIX ser R$ 0.
           */
          let paymentId:
            | string
            | null =
            null;

          if (
            pixAmount >
            0.009
          ) {
            if (
              !destinationAccount
            ) {
              throw new Error(
                "Cadastre ou selecione uma conta/PIX do participante antes de registrar o pagamento."
              );
            }

            const payment =
              await tx.financialPayment.create({
                data: {
                  tenantId,

                  participantId:
                    entitlement.participantId,

                  destinationAccountId:
                    destinationAccount.id,

                  amount:
                    new Prisma.Decimal(
                      pixAmount
                    ),

                  paidAt,

                  status:
                    "PAID",

                  destinationPixType:
                    destinationAccount.pixType,

                  destinationPixKey:
                    destinationAccount.pixKey,

                  destinationBankName:
                    destinationAccount.bankName,

                  destinationAgency:
                    destinationAccount.agency,

                  destinationAccount:
                    destinationAccount.account,

                  destinationHolderName:
                    destinationAccount.holderName,

                  destinationHolderCpfCnpj:
                    destinationAccount.holderCpfCnpj,

                  notes,
                },
              });

            paymentId =
              payment.id;

            await tx.financialPaymentAllocation.create({
              data: {
                paymentId:
                  payment.id,

                entitlementId:
                  entitlement.id,

                /*
                 * Aqui entra somente o PIX real.
                 * O valor dos vales fica registrado nas
                 * AdjustmentAllocations separadamente.
                 */
                amount:
                  new Prisma.Decimal(
                    pixAmount
                  ),
              },
            });
          }

          /*
           * Depois deste fechamento:
           *
           * pago antes
           * + PIX agora
           * + vales anteriores
           * + vales agora
           * - créditos
           *
           * determina o saldo restante.
           */
          const paidAfter =
            round(
              paidBefore +
                pixAmount
            );

          const debitAfter =
            round(
              debitBefore +
                totalDebitNow
            );

          const remainingAfter =
            Math.max(
              0,
              round(
                finalAmount -
                  paidAfter -
                  debitAfter +
                  creditBefore
              )
            );

          const nextEntitlementStatus:
            FinancialEntitlementStatus =
            remainingAfter <=
            0.009
              ? "PAID"
              : paidAfter >
                    0 ||
                  debitAfter >
                    0
                ? "PARTIAL"
                : "OPEN";

          await tx.financialEntitlement.update({
            where: {
              id:
                entitlement.id,
            },

            data: {
              status:
                nextEntitlementStatus,
            },
          });

          return {
            entitlementId:
              entitlement.id,

            paymentId,

            balanceBefore,

            adjustmentsApplied:
              totalDebitNow,

            pixAmount,

            remainingAfter,

            entitlementStatus:
              nextEntitlementStatus,
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
          errorMessage(error),
      },
      {
        status: 400,
      }
    );
  }
}