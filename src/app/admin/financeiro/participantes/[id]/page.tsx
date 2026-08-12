import { notFound } from "next/navigation";

import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import ParticipantAccountsManager from "@/components/financeiro/ParticipantAccountsManager";
import ParticipantForm from "@/components/financeiro/ParticipantForm";
import ParticipantAdjustmentsCard from "@/components/financeiro/ParticipantAdjustmentsCard";
import ParticipantRemittancePanel from "@/components/financeiro/ParticipantRemittancePanel";
import ParticipantRemittanceHistory, {
  type RemittanceHistoryItem,
} from "@/components/financeiro/ParticipantRemittanceHistory";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { formatBRL } from "@/lib/financeiro/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ParticipantePage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const session =
    await requireFinanceAccess();

  const { id } =
    await params;

  const tenantId =
    session.tenant.id;

  const [
  participant,
  users,
  payments,
  paymentAttachments,
] = await Promise.all([
    prisma.financialParticipant.findFirst({
      where: {
        id,
        tenantId,
      },

      include: {
        accounts: {
          orderBy: [
            {
              preferred:
                "desc",
            },
            {
              active:
                "desc",
            },
            {
              createdAt:
                "desc",
            },
          ],
        },

        entitlements: {
          orderBy: {
            createdAt:
              "desc",
          },

          include: {
            stage: {
              include: {
                sale: {
                  select: {
                    id: true,
                    clientName:
                      true,
                    saleDate:
                      true,
                  },
                },
              },
            },

            paymentAllocations: {
              select: {
                amount:
                  true,
              },
            },

            adjustmentAllocations: {
              select: {
                amount:
                  true,

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
      },
    }),

    prisma.user.findMany({
      where: {
        tenantId,
        isActive:
          true,
      },

      orderBy: {
        name:
          "asc",
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    }),

    prisma.financialPayment.findMany({
      where: {
        tenantId,

        participantId:
          id,

        status:
          "PAID",
      },

      orderBy: [
        {
          paidAt:
            "desc",
        },
        {
          createdAt:
            "desc",
        },
      ],

      include: {
        allocations: {
          orderBy: {
            createdAt:
              "asc",
          },

          include: {
            entitlement: {
              include: {
                adjustmentAllocations: {
                  include: {
                    adjustment: {
                      select: {
                        id:
                          true,

                        effect:
                          true,

                        description:
                          true,
                      },
                    },
                  },
                },

                stage: {
                  include: {
                    sale: {
                      include: {
                        construtora: {
                          select: {
                            name:
                              true,
                          },
                        },

                        empreendimento: {
                          select: {
                            name:
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
    }),
 prisma.financialAttachment.findMany({
      where: {
        tenantId,

        entityType:
          "PAYMENT",

        type:
          "PARTICIPANT_PAYMENT",
      },

      orderBy: {
        createdAt:
          "asc",
      },

      select: {
        id:
          true,

        entityId:
          true,

        type:
          true,

        title:
          true,

        originalName:
          true,

        url:
          true,

        mimeType:
          true,

        sizeBytes:
          true,

        createdAt:
          true,
      },
    }),
  ]);


  if (!participant) {
    notFound();
  }

  /*
   * =====================================================
   * RESUMO DO PARTICIPANTE
   * =====================================================
   */

  let totalGenerated =
    0;

  let totalOpen =
    0;

  for (
    const entitlement
    of participant.entitlements
  ) {
    const finalAmount =
      Number(
        entitlement.finalAmount
      );

    totalGenerated +=
      finalAmount;

    let settled =
      0;

    for (
      const allocation
      of entitlement.paymentAllocations
    ) {
      settled +=
        Number(
          allocation.amount
        );
    }

    for (
      const allocation
      of entitlement.adjustmentAllocations
    ) {
      const amount =
        Number(
          allocation.amount
        );

      if (
        allocation.adjustment
          .effect ===
        "DEBIT"
      ) {
        settled +=
          amount;
      } else {
        settled -=
          amount;
      }
    }

    totalOpen +=
      Math.max(
        0,
        finalAmount -
          settled
      );
  }

  /*
   * =====================================================
   * HISTÓRICO DE REMESSAS / PIX
   * =====================================================
   */

  const remittanceHistory:
    RemittanceHistoryItem[] =
    payments.map(
      (payment) => {
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

              /*
               * Na API de remessas, quando um vale
               * é usado naquele pagamento,
               * adjustmentAllocation.appliedAt recebe
               * a mesma data/hora do payment.paidAt.
               *
               * Assim conseguimos mostrar quanto
               * daquele direito foi compensado por
               * vale na remessa.
               */

              const paymentTime =
                payment.paidAt?.getTime() ??
                null;

              const valeApplied =
                entitlement.adjustmentAllocations
                  .filter(
                    (
                      adjustmentAllocation
                    ) => {
                      if (
                        adjustmentAllocation
                          .adjustment
                          .effect !==
                        "DEBIT"
                      ) {
                        return false;
                      }

                      if (
                        paymentTime ===
                        null
                      ) {
                        return false;
                      }

                      return (
                        adjustmentAllocation.appliedAt.getTime() ===
                        paymentTime
                      );
                    }
                  )
                  .reduce(
                    (
                      total,
                      adjustmentAllocation
                    ) =>
                      total +
                      Number(
                        adjustmentAllocation.amount
                      ),
                    0
                  );

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

                vgv:
                  sale.vgv
                    ? Number(
                        sale.vgv
                      )
                    : null,

                saleCommission:
                  sale.commissionFinalAmount
                    ? Number(
                        sale.commissionFinalAmount
                      )
                    : null,

                calculationBasis:
                  entitlement.calculationBasis,

                percentage:
                  entitlement.percentage
                    ? Number(
                        entitlement.percentage
                      )
                    : null,

                calculationBaseAmount:
                  entitlement.calculationBaseAmount
                    ? Number(
                        entitlement.calculationBaseAmount
                      )
                    : null,

                fixedAmount:
                  entitlement.fixedAmount
                    ? Number(
                        entitlement.fixedAmount
                      )
                    : null,

                calculatedAmount:
                  entitlement.calculatedAmount
                    ? Number(
                        entitlement.calculatedAmount
                      )
                    : null,

                overrideAmount:
                  entitlement.overrideAmount
                    ? Number(
                        entitlement.overrideAmount
                      )
                    : null,

                entitlementFinalAmount:
                  Number(
                    entitlement.finalAmount
                  ),

                valeApplied,

                pixAllocation:
                  Number(
                    allocation.amount
                  ),
              };
            }
          );

        const totalVales =
          items.reduce(
            (
              total,
              item
            ) =>
              total +
              item.valeApplied,
            0
          );

        /*
         * Direito liquidado naquela remessa =
         *
         * parte efetivamente paga via PIX
         * +
         * parte liquidada através de vale.
         */

        const totalRights =
          items.reduce(
            (
              total,
              item
            ) =>
              total +
              item.pixAllocation +
              item.valeApplied,
            0
          );

        return {
          id:
            payment.id,

          paidAt:
            payment.paidAt?.toISOString() ??
            null,

          amount:
            Number(
              payment.amount
            ),

          status:
            payment.status,

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

          totalRights,

          totalVales,

          items,
          attachments:
  paymentAttachments
    .filter(
      (attachment) =>
        attachment.entityId ===
        payment.id
    )
    .map(
      (attachment) => ({
        ...attachment,

        createdAt:
          attachment.createdAt.toISOString(),
      })
    ),
        };
      }
    );

  /*
   * =====================================================
   * TELA
   * =====================================================
   */

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {participant.name}
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Cadastro financeiro e
          histórico do participante.
        </p>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      {/* ===============================================
          RESUMO
      =============================================== */}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase text-gray-500">
            Comissões geradas
          </div>

          <div className="mt-2 text-xl font-semibold">
            {formatBRL(
              totalGenerated
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase text-gray-500">
            Saldo a pagar
          </div>

          <div className="mt-2 text-xl font-semibold">
            {formatBRL(
              totalOpen
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase text-gray-500">
            Direitos / vendas
          </div>

          <div className="mt-2 text-xl font-semibold">
            {
              participant
                .entitlements
                .length
            }
          </div>
        </div>
      </div>

      {/* ===============================================
          DADOS PARA PAGAMENTO
      =============================================== */}

      <ParticipantAccountsManager
        participantId={
          participant.id
        }
        accounts={
          participant.accounts
        }
      />

      {/* ===============================================
          NOVA REMESSA
      =============================================== */}

      <ParticipantRemittancePanel
        participantId={
          participant.id
        }
      />

      {/* ===============================================
          HISTÓRICO DE REMESSAS
      =============================================== */}

      <ParticipantRemittanceHistory
        remittances={
          remittanceHistory
        }
      />

      {/* ===============================================
          CONTA CORRENTE / VALES
      =============================================== */}

      <ParticipantAdjustmentsCard
        participantId={
          participant.id
        }
      />

      {/* ===============================================
          EDITAR PARTICIPANTE
      =============================================== */}

      <details className="rounded-lg border bg-white">
        <summary className="cursor-pointer px-5 py-4 font-medium text-gray-900">
          Editar cadastro do
          participante
        </summary>

        <div className="border-t p-5">
          <ParticipantForm
            users={
              users
            }
            initialData={{
              id:
                participant.id,

              userId:
                participant.userId,

              name:
                participant.name,

              cpfCnpj:
                participant.cpfCnpj,

              email:
                participant.email,

              phone:
                participant.phone,

              defaultCalculationBasis:
                participant.defaultCalculationBasis,

              defaultPercentage:
                participant.defaultPercentage?.toString() ??
                null,

              active:
                participant.active,

              notes:
                participant.notes,
            }}
          />
        </div>
      </details>

      {/* ===============================================
          HISTÓRICO GERAL DE COMISSÕES
      =============================================== */}

      <div className="rounded-lg border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold text-gray-900">
            Histórico de comissões
          </h2>

          <p className="mt-1 text-xs text-gray-500">
            Direitos financeiros
            vinculados às vendas deste
            participante.
          </p>
        </div>

        {participant.entitlements.length ===
        0 ? (
          <div className="p-6 text-sm text-gray-500">
            Este participante ainda
            não possui comissão
            vinculada a nenhuma venda.
          </div>
        ) : (
          <div className="divide-y">
            {participant.entitlements.map(
              (
                entitlement
              ) => (
                <div
                  key={
                    entitlement.id
                  }
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {
                        entitlement
                          .stage
                          .sale
                          .clientName
                      }
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      {
                        entitlement.role
                      }{" "}
                      •{" "}
                      {
                        entitlement
                          .stage
                          .type
                      }
                    </div>

                    {entitlement.stage.sale.saleDate && (
                      <div className="mt-1 text-xs text-gray-400">
                        Venda em{" "}
                        {new Intl.DateTimeFormat(
                          "pt-BR",
                          {
                            timeZone:
                              "UTC",
                          }
                        ).format(
                          entitlement
                            .stage
                            .sale
                            .saleDate
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-medium text-gray-900">
                      {formatBRL(
                        entitlement.finalAmount
                      )}
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      {
                        entitlement.status
                      }
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}