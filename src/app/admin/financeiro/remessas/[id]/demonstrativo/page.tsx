import Link from "next/link";
import {
  notFound,
} from "next/navigation";

import FinanceiroNav from "@/components/financeiro/FinanceiroNav";

import RemittanceStatementConfigurator, {
  RemittanceStatementData,
} from "@/components/financeiro/RemittanceStatementConfigurator";

import {
  requireFinanceAccess,
} from "@/lib/financeiro/access.server";

import {
  prisma,
} from "@/lib/prisma";

export const dynamic =
  "force-dynamic";

function num(
  value: unknown
) {
  return Number(
    value || 0
  );
}

export default async function DemonstrativoRemessaPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const session =
    await requireFinanceAccess();

  const {
    id,
  } =
    await params;

  const tenantId =
    session.tenant.id;

  const payment =
    await prisma.financialPayment.findFirst({
      where: {
        id,
        tenantId,
      },

      select: {
        id: true,
        amount: true,
        paidAt: true,
        status: true,
        notes: true,

        destinationPixType:
          true,

        destinationPixKey:
          true,

        destinationBankName:
          true,

        destinationHolderName:
          true,

        participant: {
          select: {
            id: true,
            name: true,
            cpfCnpj: true,
          },
        },

        allocations: {
          orderBy: {
            createdAt:
              "asc",
          },

          select: {
            id: true,
            amount: true,

            entitlement: {
              select: {
                id: true,

                role: true,

                customRoleLabel:
                  true,

                calculationBasis:
                  true,

                percentage: true,

                calculationBaseAmount:
                  true,

                fixedAmount:
                  true,

                calculatedAmount:
                  true,

                overrideAmount:
                  true,

                finalAmount:
                  true,

                stage: {
                  select: {
                    id: true,
                    type: true,
                    label: true,
                    sequence: true,
                    status: true,

                    sale: {
                      select: {
                        id: true,

                        clientName:
                          true,

                        vgv: true,

                        commissionFinalAmount:
                          true,

                        construtora: {
                          select: {
                            name: true,
                          },
                        },

                        empreendimento: {
                          select: {
                            name: true,
                          },
                        },

                        construtoraNameManual:
                          true,

                        empreendimentoNameManual:
                          true,

                        stages: {
                          orderBy: {
                            sequence:
                              "asc",
                          },

                          select: {
                            id: true,
                            type: true,
                            label: true,
                            sequence: true,
                            status: true,
                          },
                        },
                      },
                    },
                  },
                },

                adjustmentAllocations: {
                  orderBy: {
                    appliedAt:
                      "asc",
                  },

                  select: {
                    id: true,

                    amount: true,

                    appliedAt:
                      true,

                    adjustment: {
                      select: {
                        id: true,

                        type: true,

                        effect: true,

                        amount: true,

                        occurredAt:
                          true,

                        status: true,

                        description:
                          true,

                        notes: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

  if (
    !payment
  ) {
    notFound();
  }

  /*
   * Busca os direitos deste mesmo
   * participante em todas as etapas
   * das vendas presentes nesta remessa.
   * Isso permite contar a linha do tempo
   * da Etapa 1 / Etapa 2 sem recalcular
   * nenhum pagamento histórico.
   */
  const allStageIds =
    Array.from(
      new Set(
        payment.allocations.flatMap(
          (
            allocation
          ) =>
            allocation.entitlement.stage.sale.stages.map(
              (
                stage
              ) =>
                stage.id
            )
        )
      )
    );

  const participantStageEntitlements =
    allStageIds.length >
    0
      ? await prisma.financialEntitlement.findMany({
          where: {
            tenantId,

            participantId:
              payment.participant.id,

            stageId: {
              in:
                allStageIds,
            },

            status: {
              not:
                "CANCELLED",
            },
          },

          select: {
            id: true,
            stageId: true,
            finalAmount: true,

            paymentAllocations: {
              where: {
                payment: {
                  status:
                    "PAID",
                },
              },

              orderBy: {
                createdAt:
                  "asc",
              },

              select: {
                amount: true,

                payment: {
                  select: {
                    id: true,
                    paidAt:
                      true,
                    status:
                      true,
                  },
                },
              },
            },
          },
        })
      : [];

  const entitlementByStage =
    new Map(
      participantStageEntitlements.map(
        (
          entitlement
        ) => [
          entitlement.stageId,
          entitlement,
        ]
      )
    );

  /*
   * Reúne os vales/ajustes que
   * atingiram os direitos desta
   * remessa.
   */
  const adjustmentMap =
    new Map<
      string,
      {
        id: string;

        type: string;

        effect: string;

        description:
          | string
          | null;

        occurredAt:
          Date;

        originalAmount:
          number;

        appliedInRemittance:
          number;
      }
    >();

  for (
    const allocation
    of payment.allocations
  ) {
    for (
      const adjustmentAllocation
      of allocation.entitlement
        .adjustmentAllocations
    ) {
      const adjustment =
        adjustmentAllocation.adjustment;

      if (
        adjustment.status ===
          "CANCELLED" ||
        adjustment.effect !==
          "DEBIT"
      ) {
        continue;
      }

      const existing =
        adjustmentMap.get(
          adjustment.id
        );

      if (
        existing
      ) {
        existing.appliedInRemittance +=
          num(
            adjustmentAllocation.amount
          );
      } else {
        adjustmentMap.set(
          adjustment.id,
          {
            id:
              adjustment.id,

            type:
              adjustment.type,

            effect:
              adjustment.effect,

            description:
              adjustment.description,

            occurredAt:
              adjustment.occurredAt,

            originalAmount:
              num(
                adjustment.amount
              ),

            appliedInRemittance:
              num(
                adjustmentAllocation.amount
              ),
          }
        );
      }
    }
  }

  const adjustments =
    Array.from(
      adjustmentMap.values()
    );

  const adjustmentIds =
    adjustments.map(
      (
        adjustment
      ) =>
        adjustment.id
    );

  const [
    paymentAttachments,
    adjustmentAttachments,
  ] =
    await Promise.all([
      prisma.financialAttachment.findMany({
        where: {
          tenantId,

          entityType:
            "PAYMENT",

          entityId:
            payment.id,

          type:
            "PARTICIPANT_PAYMENT",
        },

        orderBy: {
          createdAt:
            "asc",
        },

        select: {
          id: true,
          title: true,
          originalName:
            true,
          url: true,
          mimeType: true,
        },
      }),

      adjustmentIds.length >
      0
        ? prisma.financialAttachment.findMany({
            where: {
              tenantId,

              entityType:
                "ADJUSTMENT",

              entityId: {
                in:
                  adjustmentIds,
              },

              type:
                "ADVANCE",
            },

            orderBy: {
              createdAt:
                "asc",
            },

            select: {
              id: true,

              entityId:
                true,

              title: true,

              originalName:
                true,

              url: true,

              mimeType: true,
            },
          })
        : Promise.resolve(
            []
          ),
    ]);

  const data:
    RemittanceStatementData =
    {
      id:
        payment.id,

      participant: {
        id:
          payment.participant.id,

        name:
          payment.participant.name,

        cpfCnpj:
          payment.participant.cpfCnpj,
      },

      paidAt:
        payment.paidAt?.toISOString() ??
        null,

      amount:
        num(
          payment.amount
        ),

      notes:
        payment.notes,

      destinationPixType:
        payment.destinationPixType,

      destinationPixKey:
        payment.destinationPixKey,

      destinationBankName:
        payment.destinationBankName,

      destinationHolderName:
        payment.destinationHolderName,

      items:
        payment.allocations.map(
          (
            allocation
          ) => {
            const entitlement =
              allocation.entitlement;

            const stage =
              entitlement.stage;

            const sale =
              stage.sale;

            const principalStages =
              sale.stages.filter(
                (
                  item
                ) =>
                  item.type ===
                    "ATO" ||
                  item.type ===
                    "BANCO"
              );

            const currentPrincipalIndex =
              principalStages.findIndex(
                (
                  item
                ) =>
                  item.id ===
                  stage.id
              );

            const previousStage =
              currentPrincipalIndex >
              0
                ? principalStages[
                    currentPrincipalIndex -
                      1
                  ]
                : null;

            const nextStage =
              currentPrincipalIndex >=
                0 &&
              currentPrincipalIndex <
                principalStages.length -
                  1
                ? principalStages[
                    currentPrincipalIndex +
                      1
                  ]
                : null;

            const previousEntitlement =
              previousStage
                ? entitlementByStage.get(
                    previousStage.id
                  )
                : undefined;

            const nextEntitlement =
              nextStage
                ? entitlementByStage.get(
                    nextStage.id
                  )
                : undefined;

            const previousPayments =
              previousEntitlement
                ?.paymentAllocations
                .filter(
                  (
                    item
                  ) =>
                    item.payment
                      .paidAt !=
                    null
                ) ??
              [];

            const previousPaidAmount =
              previousPayments.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  num(
                    item.amount
                  ),
                0
              );

            const previousPaidAt =
              previousPayments.length >
              0
                ? previousPayments[
                    previousPayments.length -
                      1
                  ].payment.paidAt
                : null;

            let stageContext:
              | "FIRST_WITH_FUTURE"
              | "LATER_WITH_PREVIOUS_PAID"
              | "SINGLE"
              | "EXTRA" =
              "SINGLE";

            if (
              stage.type !==
                "ATO" &&
              stage.type !==
                "BANCO"
            ) {
              stageContext =
                "EXTRA";
            } else if (
              currentPrincipalIndex ===
                0 &&
              nextStage
            ) {
              stageContext =
                "FIRST_WITH_FUTURE";
            } else if (
              previousStage &&
              previousPaidAmount >
                0
            ) {
              stageContext =
                "LATER_WITH_PREVIOUS_PAID";
            }

            return {
              allocationId:
                allocation.id,

              entitlementId:
                entitlement.id,

              clientName:
                sale.clientName,

              construtora:
                sale.construtora
                  ?.name ||
                sale.construtoraNameManual,

              empreendimento:
                sale.empreendimento
                  ?.name ||
                sale.empreendimentoNameManual,

              stageType:
                stage.type,

              stageLabel:
                stage.label,

              role:
                entitlement.role,

              customRoleLabel:
                entitlement.customRoleLabel,

              vgv:
                sale.vgv !=
                null
                  ? num(
                      sale.vgv
                    )
                  : null,

              saleCommission:
                sale.commissionFinalAmount !=
                null
                  ? num(
                      sale.commissionFinalAmount
                    )
                  : null,

              calculationBasis:
                entitlement.calculationBasis,

              percentage:
                entitlement.percentage !=
                null
                  ? num(
                      entitlement.percentage
                    )
                  : null,

              calculationBaseAmount:
                entitlement.calculationBaseAmount !=
                null
                  ? num(
                      entitlement.calculationBaseAmount
                    )
                  : null,

              fixedAmount:
                entitlement.fixedAmount !=
                null
                  ? num(
                      entitlement.fixedAmount
                    )
                  : null,

              entitlementFinalAmount:
                num(
                  entitlement.finalAmount
                ),

              pixAllocation:
                num(
                  allocation.amount
                ),

              stageContext,

              stageSequence:
                stage.sequence,

              stageNumber:
                currentPrincipalIndex >=
                0
                  ? currentPrincipalIndex +
                    1
                  : null,

              totalPrincipalStages:
                principalStages.length,

              previousStage:
                previousStage
                  ? {
                      type:
                        previousStage.type,

                      label:
                        previousStage.label,

                      status:
                        previousStage.status,

                      paidAmount:
                        previousPaidAmount,

                      paidAt:
                        previousPaidAt
                          ?.toISOString() ??
                        null,
                    }
                  : null,

              nextStage:
                nextStage
                  ? {
                      type:
                        nextStage.type,

                      label:
                        nextStage.label,

                      status:
                        nextStage.status,

                      expectedParticipantAmount:
                        nextEntitlement
                          ? num(
                              nextEntitlement.finalAmount
                            )
                          : null,
                    }
                  : null,
            };
          }
        ),

      adjustments:
        adjustments.map(
          (
            adjustment
          ) => ({
            ...adjustment,

            occurredAt:
              adjustment.occurredAt.toISOString(),

            attachments:
              adjustmentAttachments
                .filter(
                  (
                    attachment
                  ) =>
                    attachment.entityId ===
                    adjustment.id
                )
                .map(
                  (
                    attachment
                  ) => ({
                    id:
                      attachment.id,

                    title:
                      attachment.title,

                    originalName:
                      attachment.originalName,

                    url:
                      attachment.url,

                    mimeType:
                      attachment.mimeType,
                  })
                ),
          })
        ),

      attachments:
        paymentAttachments.map(
          (
            attachment
          ) => ({
            id:
              attachment.id,

            title:
              attachment.title,

            originalName:
              attachment.originalName,

            url:
              attachment.url,

            mimeType:
              attachment.mimeType,
          })
        ),
    };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link
                href={`/admin/financeiro/participantes/${payment.participant.id}`}
                className="hover:text-gray-900"
              >
                {
                  payment.participant.name
                }
              </Link>

              <span>
                /
              </span>

              <span>
                Demonstrativo
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold text-gray-900">
              Montar demonstrativo da remessa
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Escolha o que será
              exibido ao
              participante antes
              de gerar o PDF.
            </p>
          </div>

          <Link
            href={`/admin/financeiro/participantes/${payment.participant.id}`}
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium"
          >
            Voltar ao participante
          </Link>
        </div>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <RemittanceStatementConfigurator
        remittance={
          data
        }
      />
    </div>
  );
}