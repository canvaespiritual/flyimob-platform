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

import {
  refreshFinancialStageStatus,
} from "@/lib/financeiro/stage-status.server";

function num(
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
      (value + Number.EPSILON) *
        100
    ) / 100
  );
}

function entitlementBalance(
  entitlement: {
    finalAmount: unknown;

    paymentAllocations: Array<{
      amount: unknown;

      payment: {
        status: string;
      };
    }>;

    adjustmentAllocations: Array<{
      amount: unknown;

      adjustment: {
        effect: string;
      };
    }>;
  }
) {
  const finalAmount =
    num(
      entitlement.finalAmount
    );

  const paid =
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
          num(
            allocation.amount
          ),
        0
      );

  const debits =
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
          num(
            allocation.amount
          ),
        0
      );

  const credits =
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
          num(
            allocation.amount
          ),
        0
      );

  return roundMoney(
    Math.max(
      0,
      finalAmount -
        paid -
        debits +
        credits
    )
  );
}

/*
 * =====================================================
 * GET
 *
 * Retorna:
 * - comissões elegíveis para remessa
 * - contas PIX
 * - vales em aberto
 *
 * Uma comissão só é elegível quando a etapa possui
 * recebimento CONFIRMED.
 * =====================================================
 */

export async function GET(
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
    const tenantId =
      auth.session.tenant.id;

    const url =
      new URL(req.url);

    const participantId =
      requiredString(
        url.searchParams.get(
          "participantId"
        ),
        "Participante"
      );

    const participant =
      await prisma.financialParticipant.findFirst({
        where: {
          id:
            participantId,

          tenantId,
        },

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
      });

    if (!participant) {
      return Response.json(
        {
          error:
            "Participante não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const entitlements =
      await prisma.financialEntitlement.findMany({
        where: {
          tenantId,

          participantId,

          status: {
            in: [
              "OPEN",
              "PARTIAL",
            ],
          },

          stage: {
            status: {
              not:
                "CANCELLED",
            },

            receipts: {
              some: {
                status:
                  "CONFIRMED",
              },
            },
          },
        },

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

          stage: {
            include: {
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

              sale: {
                select: {
                  id:
                    true,

                  clientName:
                    true,

                  construtora: {
                    select: {
                      name:
                        true,
                    },
                  },

                  construtoraNameManual:
                    true,

                  empreendimento: {
                    select: {
                      name:
                        true,
                    },
                  },

                  empreendimentoNameManual:
                    true,
                },
              },
            },
          },
        },
      });

    const eligible =
      entitlements
        .map(
          (
            entitlement
          ) => {
            const balance =
              entitlementBalance(
                entitlement
              );

            const firstReceipt =
              entitlement.stage.receipts
                .filter(
                  (receipt) =>
                    receipt.receivedAt
                )
                .sort(
                  (a, b) =>
                    (
                      a.receivedAt?.getTime() ||
                      0
                    ) -
                    (
                      b.receivedAt?.getTime() ||
                      0
                    )
                )[0];

            return {
              id:
                entitlement.id,

              stageId:
                entitlement.stageId,

              saleId:
                entitlement.stage.sale.id,

              clientName:
                entitlement.stage.sale.clientName,

              stageType:
                entitlement.stage.type,

              stageLabel:
                entitlement.stage.label,

              role:
                entitlement.role,

              finalAmount:
                num(
                  entitlement.finalAmount
                ),

              balance,

              receivedAt:
                firstReceipt?.receivedAt?.toISOString() ??
                null,

              construtora:
                entitlement.stage.sale
                  .construtora
                  ?.name ||
                entitlement.stage.sale
                  .construtoraNameManual,

              empreendimento:
                entitlement.stage.sale
                  .empreendimento
                  ?.name ||
                entitlement.stage.sale
                  .empreendimentoNameManual,
            };
          }
        )
        .filter(
          (item) =>
            item.balance >
            0.009
        )
        .sort(
          (a, b) => {
            const dateA =
              a.receivedAt
                ? new Date(
                    a.receivedAt
                  ).getTime()
                : Number.MAX_SAFE_INTEGER;

            const dateB =
              b.receivedAt
                ? new Date(
                    b.receivedAt
                  ).getTime()
                : Number.MAX_SAFE_INTEGER;

            if (
              dateA !== dateB
            ) {
              return (
                dateA -
                dateB
              );
            }

            return a.clientName.localeCompare(
              b.clientName,
              "pt-BR"
            );
          }
        );

    const adjustments =
      await prisma.financialAdjustment.findMany({
        where: {
          tenantId,

          participantId,

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
            occurredAt:
              "asc",
          },
          {
            createdAt:
              "asc",
          },
        ],

        include: {
          allocations: {
            select: {
              amount:
                true,
            },
          },
        },
      });

    const openAdjustments =
      adjustments
        .map(
          (
            adjustment
          ) => {
            const used =
              adjustment.allocations.reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

            const original =
              num(
                adjustment.amount
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
                roundMoney(
                  used
                ),

              remainingAmount:
                roundMoney(
                  Math.max(
                    0,
                    original -
                      used
                  )
                ),
            };
          }
        )
        .filter(
          (adjustment) =>
            adjustment.remainingAmount >
            0.009
        );

    return Response.json({
      ok: true,

      participant: {
        id:
          participant.id,

        name:
          participant.name,
      },

      accounts:
        participant.accounts.map(
          (
            account
          ) => ({
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

            holderName:
              account.holderName,

            holderCpfCnpj:
              account.holderCpfCnpj,

            preferred:
              account.preferred,
          })
        ),

      entitlements:
        eligible,

      adjustments:
        openAdjustments,
    });
  } catch (
    error
  ) {
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

/*
 * =====================================================
 * POST
 *
 * Cria UM PIX e distribui entre várias comissões.
 *
 * O valor dos vales é distribuído automaticamente
 * começando pelas comissões selecionadas com
 * recebimento mais antigo.
 * =====================================================
 */

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

    const participantId =
      requiredString(
        body.participantId,
        "Participante"
      );

    const destinationAccountId =
      requiredString(
        body.destinationAccountId,
        "Conta / PIX"
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

    const entitlementIds: string[] =
  Array.isArray(
    body.entitlementIds
  )
    ? Array.from(
        new Set<string>(
          body.entitlementIds
            .map(
              (
                item: unknown
              ) =>
                String(
                  item ||
                    ""
                ).trim()
            )
            .filter(
              (
                item: string
              ) =>
                item.length >
                0
            )
        )
      )
    : [];

    if (
      entitlementIds.length ===
      0
    ) {
      throw new Error(
        "Selecione pelo menos uma comissão."
      );
    }

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
              (
                item: {
                  adjustmentId?: unknown;
                  amount?: unknown;
                }
              ) => ({
                adjustmentId:
                  String(
                    item.adjustmentId ||
                      ""
                  ),

                amount:
                  Number(
                    item.amount ||
                      0
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
                Boolean(
                  item.adjustmentId
                ) &&
                Number.isFinite(
                  item.amount
                ) &&
                item.amount >
                  0
            )
        : [];

    const result =
      await prisma.$transaction(
        async (
          tx
        ) => {
          const participant =
            await tx.financialParticipant.findFirst({
              where: {
                id:
                  participantId,

                tenantId,
              },

              include: {
                accounts: {
                  where: {
                    active:
                      true,
                  },
                },
              },
            });

          if (!participant) {
            throw new Error(
              "Participante não encontrado."
            );
          }

          const destinationAccount =
            participant.accounts.find(
              (
                account
              ) =>
                account.id ===
                destinationAccountId
            );

          if (
            !destinationAccount
          ) {
            throw new Error(
              "A conta selecionada não pertence a este participante."
            );
          }

          const entitlements =
            await tx.financialEntitlement.findMany({
              where: {
                id: {
                  in:
                    entitlementIds,
                },

                tenantId,

                participantId,

                status: {
                  in: [
                    "OPEN",
                    "PARTIAL",
                  ],
                },

                stage: {
                  status: {
                    not:
                      "CANCELLED",
                  },

                  receipts: {
                    some: {
                      status:
                        "CONFIRMED",
                    },
                  },
                },
              },

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

                stage: {
                  include: {
                    receipts: {
                      where: {
                        status:
                          "CONFIRMED",
                      },
                    },

                    sale: {
                      select: {
                        clientName:
                          true,
                      },
                    },
                  },
                },
              },
            });

          if (
            entitlements.length !==
            entitlementIds.length
          ) {
            throw new Error(
              "Uma ou mais comissões selecionadas não estão mais disponíveis para remessa."
            );
          }

          /*
           * Ordenação:
           * recebimento mais antigo primeiro.
           */
          const ordered =
            entitlements
              .map(
                (
                  entitlement
                ) => {
                  const receiptDates =
                    entitlement.stage.receipts
                      .map(
                        (
                          receipt
                        ) =>
                          receipt.receivedAt
                      )
                      .filter(
                        (
                          value
                        ): value is Date =>
                          Boolean(
                            value
                          )
                      );

                  const receivedAt =
                    receiptDates.length >
                    0
                      ? new Date(
                          Math.min(
                            ...receiptDates.map(
                              (
                                date
                              ) =>
                                date.getTime()
                            )
                          )
                        )
                      : new Date(
                          8640000000000000
                        );

                  return {
                    entitlement,

                    balance:
                      entitlementBalance(
                        entitlement
                      ),

                    receivedAt,
                  };
                }
              )
              .sort(
                (
                  a,
                  b
                ) =>
                  a.receivedAt.getTime() -
                  b.receivedAt.getTime()
              );

          const totalRights =
            roundMoney(
              ordered.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.balance,
                0
              )
            );

          /*
           * Validar todos os vales.
           */
          const adjustmentState:
            Array<{
              id: string;
              description: string | null;
              remaining: number;
              requested: number;
            }> =
            [];

          let totalRequestedAdjustments =
            0;

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

                  participantId,

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
                "Um dos vales selecionados não está mais disponível."
              );
            }

            const alreadyUsed =
              adjustment.allocations.reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

            const remaining =
              roundMoney(
                Math.max(
                  0,
                  num(
                    adjustment.amount
                  ) -
                    alreadyUsed
                )
              );

            const requestedAmount =
              roundMoney(
                requested.amount
              );

            if (
              requestedAmount >
              remaining +
                0.009
            ) {
              throw new Error(
                `O valor escolhido para "${adjustment.description || "Vale"}" é maior que o saldo disponível.`
              );
            }

            adjustmentState.push({
              id:
                adjustment.id,

              description:
                adjustment.description,

              remaining,

              requested:
                requestedAmount,
            });

            totalRequestedAdjustments +=
              requestedAmount;
          }

          totalRequestedAdjustments =
            roundMoney(
              totalRequestedAdjustments
            );

          if (
            totalRequestedAdjustments >
            totalRights +
              0.009
          ) {
            throw new Error(
              "O total de vales é maior que o total das comissões selecionadas."
            );
          }

          /*
           * Agora distribuímos os vales automaticamente
           * pelas comissões selecionadas.
           *
           * Primeiro vale mais antigo,
           * primeira comissão recebida mais antiga.
           */

          const entitlementDistribution =
            ordered.map(
              (
                item
              ) => ({
                entitlement:
                  item.entitlement,

                originalBalance:
                  item.balance,

                remainingForCash:
                  item.balance,

                adjustmentAmount:
                  0,

                adjustments:
                  [] as Array<{
                    adjustmentId: string;
                    amount: number;
                  }>,
              })
            );

          for (
            const adjustment
            of adjustmentState
          ) {
            let amountToDistribute =
              adjustment.requested;

            for (
              const target
              of entitlementDistribution
            ) {
              if (
                amountToDistribute <=
                  0.009
              ) {
                break;
              }

              if (
                target.remainingForCash <=
                0.009
              ) {
                continue;
              }

              const amount =
                roundMoney(
                  Math.min(
                    amountToDistribute,
                    target.remainingForCash
                  )
                );

              if (
                amount <=
                0
              ) {
                continue;
              }

              target.adjustments.push({
                adjustmentId:
                  adjustment.id,

                amount,
              });

              target.adjustmentAmount =
                roundMoney(
                  target.adjustmentAmount +
                    amount
                );

              target.remainingForCash =
                roundMoney(
                  target.remainingForCash -
                    amount
                );

              amountToDistribute =
                roundMoney(
                  amountToDistribute -
                    amount
                );
            }

            if (
              amountToDistribute >
              0.009
            ) {
              throw new Error(
                "Não foi possível distribuir integralmente os vales selecionados."
              );
            }
          }

          const pixAmount =
            roundMoney(
              entitlementDistribution.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.remainingForCash,
                0
              )
            );

          /*
           * Um FinancialPayment = um PIX real.
           */
          let paymentId:
            | string
            | null =
            null;

          if (
            pixAmount >
            0.009
          ) {
            const payment =
              await tx.financialPayment.create({
                data: {
                  tenantId,

                  participantId,

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

            /*
             * Um mesmo PIX é repartido entre as comissões.
             */
            for (
              const item
              of entitlementDistribution
            ) {
              if (
                item.remainingForCash <=
                0.009
              ) {
                continue;
              }

              await tx.financialPaymentAllocation.create({
                data: {
                  paymentId:
                    payment.id,

                  entitlementId:
                    item.entitlement.id,

                  amount:
                    new Prisma.Decimal(
                      item.remainingForCash
                    ),
                },
              });
            }
          }

          /*
           * Aplicar vales.
           *
           * Se aquele mesmo vale já foi parcialmente usado
           * na mesma comissão anteriormente, atualizamos a
           * alocação existente em vez de criar outra.
           *
           * Isso respeita o @@unique do schema.
           */
          for (
            const item
            of entitlementDistribution
          ) {
            for (
              const applied
              of item.adjustments
            ) {
              const existing =
                await tx.financialAdjustmentAllocation.findUnique({
                  where: {
                    adjustmentId_entitlementId:
                      {
                        adjustmentId:
                          applied.adjustmentId,

                        entitlementId:
                          item.entitlement.id,
                      },
                  },
                });

              if (
                existing
              ) {
                await tx.financialAdjustmentAllocation.update({
                  where: {
                    id:
                      existing.id,
                  },

                  data: {
                    amount:
                      new Prisma.Decimal(
                        roundMoney(
                          num(
                            existing.amount
                          ) +
                            applied.amount
                        )
                      ),

                    appliedAt:
                      paidAt,
                  },
                });
              } else {
                await tx.financialAdjustmentAllocation.create({
                  data: {
                    adjustmentId:
                      applied.adjustmentId,

                    entitlementId:
                      item.entitlement.id,

                    amount:
                      new Prisma.Decimal(
                        applied.amount
                      ),

                    appliedAt:
                      paidAt,
                  },
                });
              }
            }
          }

          /*
           * Atualizar status dos vales.
           */
          for (
            const adjustment
            of adjustmentState
          ) {
            const row =
              await tx.financialAdjustment.findUnique({
                where: {
                  id:
                    adjustment.id,
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

            if (!row) {
              continue;
            }

            const used =
              row.allocations.reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

            const original =
              num(
                row.amount
              );

            const remaining =
              roundMoney(
                original -
                  used
              );

            let status:
              FinancialAdjustmentStatus;

            if (
              remaining <=
              0.009
            ) {
              status =
                "APPLIED";
            } else if (
              used > 0
            ) {
              status =
                "PARTIAL";
            } else {
              status =
                "AVAILABLE";
            }

            await tx.financialAdjustment.update({
              where: {
                id:
                  row.id,
              },

              data: {
                status,

                appliedAt:
                  status ===
                  "APPLIED"
                    ? paidAt
                    : null,
              },
            });
          }

          /*
           * As comissões selecionadas foram integralmente
           * liquidadas: parte por PIX, parte por vale.
           */
          const affectedStageIds =
            new Set<string>();

          for (
            const item
            of entitlementDistribution
          ) {
            await tx.financialEntitlement.update({
              where: {
                id:
                  item.entitlement.id,
              },

              data: {
                status:
                  "PAID" as FinancialEntitlementStatus,
              },
            });

            affectedStageIds.add(
              item.entitlement.stageId
            );
          }

          /*
           * Recalcula status das etapas afetadas.
           */
          for (
            const stageId
            of affectedStageIds
          ) {
            await refreshFinancialStageStatus(
              tx,
              {
                stageId,
                tenantId,
              }
            );
          }

          return {
            paymentId,

            totalRights,

            totalAdjustments:
              totalRequestedAdjustments,

            pixAmount,

            commissionCount:
              entitlementDistribution.length,

            distribution:
              entitlementDistribution.map(
                (
                  item
                ) => ({
                  entitlementId:
                    item.entitlement.id,

                  clientName:
                    item.entitlement.stage.sale.clientName,

                  right:
                    item.originalBalance,

                  adjustments:
                    item.adjustmentAmount,

                  cash:
                    item.remainingForCash,
                })
              ),
          };
        },
        {
          maxWait:
            10000,

          timeout:
            30000,
        }
      );

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (
    error
  ) {
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