import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import {
  buildRemittancePdf,
  RemittancePdfOptions,
} from "@/lib/financeiro/remittance-pdf.server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(
  value: unknown
) {
  return Number(
    value || 0
  );
}

function booleanOption(
  value: unknown,
  fallback: boolean
) {
  return typeof value ===
    "boolean"
    ? value
    : fallback;
}

function stringArray(
  value: unknown
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [] as string[];
  }

  return value.filter(
    (
      item
    ): item is string =>
      typeof item ===
      "string"
  );
}

function safeFilename(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-|-$|/g,
      ""
    );
}

function normalizeOptions(
  value: unknown
): RemittancePdfOptions {
  const source =
    value &&
    typeof value ===
      "object"
      ? (
          value as Record<
            string,
            unknown
          >
        )
      : {};

  return {
    showClient:
      booleanOption(
        source.showClient,
        true
      ),

    showBuilder:
      booleanOption(
        source.showBuilder,
        true
      ),

    showDevelopment:
      booleanOption(
        source.showDevelopment,
        true
      ),

    showStageContext:
      booleanOption(
        source.showStageContext,
        true
      ),

    showVgv:
      booleanOption(
        source.showVgv,
        true
      ),

    showSaleCommission:
      booleanOption(
        source.showSaleCommission,
        true
      ),

    showRole:
      booleanOption(
        source.showRole,
        true
      ),

    showRule:
      booleanOption(
        source.showRule,
        true
      ),

    showEntitlement:
      booleanOption(
        source.showEntitlement,
        true
      ),

    showPixAllocation:
      booleanOption(
        source.showPixAllocation,
        true
      ),

    showAdjustments:
      booleanOption(
        source.showAdjustments,
        true
      ),

    showAdjustmentBalance:
      booleanOption(
        source.showAdjustmentBalance,
        true
      ),

    showPaymentDestination:
      booleanOption(
        source.showPaymentDestination,
        true
      ),

    showPaymentDate:
      booleanOption(
        source.showPaymentDate,
        true
      ),

    showPaymentNotes:
      booleanOption(
        source.showPaymentNotes,
        false
      ),

    showServiceNotice:
      booleanOption(
        source.showServiceNotice,
        true
      ),

    showDirectorMessage:
      booleanOption(
        source.showDirectorMessage,
        true
      ),
  };
}

async function attachmentBytes(
  url: string
) {
  const response =
    await fetch(
      url,
      {
        cache: "no-store",
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Não foi possível carregar um dos comprovantes selecionados (${response.status}).`
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

export async function POST(
  req: Request
) {
  const auth =
    await getFinanceApiSession();

  if (
    !auth.ok
  ) {
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

    const paymentId =
      typeof body?.paymentId ===
        "string"
        ? body.paymentId.trim()
        : "";

    if (
      !paymentId
    ) {
      return Response.json(
        {
          error:
            "Remessa não informada.",
        },
        {
          status: 400,
        }
      );
    }

    const options =
      normalizeOptions(
        body?.options
      );

    const directorMessage =
      typeof body?.directorMessage ===
        "string"
        ? body.directorMessage.trim()
        : "";

    const paymentAttachmentIds =
      stringArray(
        body?.paymentAttachmentIds
      );

    const adjustmentAttachmentIds =
      stringArray(
        body?.adjustmentAttachmentIds
      );

    /*
     * IMPORTANTE:
     * O navegador envia somente escolhas.
     * Todos os valores financeiros oficiais
     * são buscados novamente no banco.
     */
    const payment =
      await prisma.financialPayment.findFirst({
        where: {
          id:
            paymentId,

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

                  finalAmount:
                    true,

                  adjustmentAllocations: {
                    orderBy: {
                      appliedAt:
                        "asc",
                    },

                    select: {
                      id: true,
                      amount: true,

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
                        },
                      },
                    },
                  },

                  stage: {
                    select: {
                      id: true,
                      type: true,
                      label: true,
                      sequence:
                        true,

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
                              sequence:
                                true,
                              status:
                                true,

                              entitlements: {
                                select: {
                                  id: true,

                                  participantId:
                                    true,

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
                                      amount:
                                        true,

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
                              },
                            },
                          },
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
      return Response.json(
        {
          error:
            "Remessa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      payment.status !==
      "PAID"
    ) {
      return Response.json(
        {
          error:
            "Somente remessas pagas podem gerar demonstrativo.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Reúne os vales efetivamente ligados
     * aos direitos que fazem parte desta remessa.
     */
    const adjustmentMap =
      new Map<
        string,
        {
          id: string;

          type: string;

          effect:
            string;

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

    /*
     * Valida os IDs de comprovantes enviados
     * pelo cliente contra as entidades reais.
     */
    const selectedAttachmentIds =
      Array.from(
        new Set([
          ...paymentAttachmentIds,
          ...adjustmentAttachmentIds,
        ])
      );

    const attachments =
      selectedAttachmentIds.length >
      0
        ? await prisma.financialAttachment.findMany({
            where: {
              tenantId,

              id: {
                in:
                  selectedAttachmentIds,
              },

              OR: [
                {
                  entityType:
                    "PAYMENT",

                  entityId:
                    payment.id,

                  type:
                    "PARTICIPANT_PAYMENT",
                },

                {
                  entityType:
                    "ADJUSTMENT",

                  entityId: {
                    in:
                      adjustmentIds,
                  },

                  type:
                    "ADVANCE",
                },
              ],
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
              mimeType:
                true,
            },
          })
        : [];

    const foundIds =
      new Set(
        attachments.map(
          (
            attachment
          ) =>
            attachment.id
        )
      );

    const missingAttachmentIds =
      selectedAttachmentIds.filter(
        (
          attachmentId
        ) =>
          !foundIds.has(
            attachmentId
          )
      );

    if (
      missingAttachmentIds.length >
      0
    ) {
      return Response.json(
        {
          error:
            "Um ou mais comprovantes selecionados não pertencem a esta remessa ou não estão mais disponíveis.",
        },
        {
          status: 400,
        }
      );
    }

    const pdfAttachments =
      await Promise.all(
        attachments.map(
          async (
            attachment
          ) => ({
            id:
              attachment.id,

            title:
              attachment.title,

            originalName:
              attachment.originalName,

            mimeType:
              attachment.mimeType,

            bytes:
              await attachmentBytes(
                attachment.url
              ),
          })
        )
      );

    const items =
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
                saleStage
              ) =>
                saleStage.type ===
                  "ATO" ||
                saleStage.type ===
                  "BANCO"
            );

          const currentPrincipalIndex =
            principalStages.findIndex(
              (
                saleStage
              ) =>
                saleStage.id ===
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

          const previousParticipantEntitlement =
            previousStage
              ?.entitlements
              .find(
                (
                  previousEntitlement
                ) =>
                  previousEntitlement.participantId ===
                  payment.participant.id
              );

          const previousPayments =
            previousParticipantEntitlement
              ?.paymentAllocations
              .filter(
                (
                  previousAllocation
                ) =>
                  previousAllocation.payment
                    .status ===
                    "PAID" &&
                  previousAllocation.payment
                    .paidAt !=
                    null
              )
              .map(
                (
                  previousAllocation
                ) => ({
                  amount:
                    num(
                      previousAllocation.amount
                    ),

                  paidAt:
                    previousAllocation.payment
                      .paidAt,
                })
              ) ??
            [];

          const previousPaidAmount =
            previousPayments.reduce(
              (
                total,
                previousPayment
              ) =>
                total +
                previousPayment.amount,
              0
            );

          const previousPaidAt =
            previousPayments.length >
            0
              ? previousPayments[
                  previousPayments.length -
                    1
                ].paidAt
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

            stageContext,

            stageSequence:
              stage.sequence,

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
                  }
                : null,

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
          };
        }
      );

    const pdfBytes =
      await buildRemittancePdf({
        data: {
          paymentId:
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

          items,

          adjustments:
            adjustments.map(
              (
                adjustment
              ) => ({
                id:
                  adjustment.id,

                type:
                  adjustment.type,

                effect:
                  adjustment.effect,

                description:
                  adjustment.description,

                occurredAt:
                  adjustment.occurredAt.toISOString(),

                originalAmount:
                  adjustment.originalAmount,

                appliedInRemittance:
                  adjustment.appliedInRemittance,
              })
            ),
        },

        options,

        directorMessage:
          directorMessage ||
          null,

        attachments:
          pdfAttachments,
      });

    const participantName =
      safeFilename(
        payment.participant.name
      ) ||
      "participante";

    const filename =
      `demonstrativo-${participantName}-${payment.id}.pdf`;

    return new Response(
      Buffer.from(
        pdfBytes
      ),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `inline; filename="${filename}"`,

          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (
    error
  ) {
    console.error(
      "ERRO GERAR DEMONSTRATIVO:",
      error
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao gerar demonstrativo.",
      },
      {
        status: 400,
      }
    );
  }
}