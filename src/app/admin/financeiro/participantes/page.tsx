import Link from "next/link";

import FinanceiroNav from "@/components/financeiro/FinanceiroNav";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { formatBRL } from "@/lib/financeiro/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
      (value +
        Number.EPSILON) *
        100
    ) / 100
  );
}

function entitlementValues(
  entitlement: {
    finalAmount: unknown;

    stage: {
      receipts: Array<{
        status: string;
      }>;
    };

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

  const paidByPix =
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

  const debitApplied =
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

  const creditApplied =
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

  const settled =
    roundMoney(
      paidByPix +
        debitApplied -
        creditApplied
    );

  const balance =
    roundMoney(
      Math.max(
        0,
        finalAmount -
          settled
      )
    );

  const received =
    entitlement.stage.receipts.some(
      (receipt) =>
        receipt.status ===
        "CONFIRMED"
    );

  return {
    finalAmount,
    settled,
    balance,
    received,
  };
}

function currentAdjustmentBalance(
  adjustment: {
    amount: unknown;
    effect: string;

    allocations: Array<{
      amount: unknown;
    }>;
  }
) {
  const original =
    num(
      adjustment.amount
    );

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

  const remaining =
    roundMoney(
      Math.max(
        0,
        original -
          used
      )
    );

  if (
    adjustment.effect ===
    "DEBIT"
  ) {
    return -remaining;
  }

  return remaining;
}

export default async function ParticipantesPage() {
  const session =
    await requireFinanceAccess();

  const tenantId =
    session.tenant.id;

  const participants =
    await prisma.financialParticipant.findMany({
      where: {
        tenantId,
      },

      orderBy: [
        {
          active:
            "desc",
        },

        {
          name:
            "asc",
        },
      ],

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

        entitlements: {
          where: {
            status: {
              not:
                "CANCELLED",
            },
          },

          include: {
            stage: {
              select: {
                receipts: {
                  select: {
                    status:
                      true,
                  },
                },
              },
            },

            paymentAllocations: {
              select: {
                amount:
                  true,

                payment: {
                  select: {
                    status:
                      true,
                  },
                },
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

        adjustments: {
          where: {
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
        },
      },
    });

  const participantIds =
    participants.map(
      (participant) =>
        participant.id
    );


  const [
    participantPayments,
    participantAdjustments,
  ] = await Promise.all([
    prisma.financialPayment.findMany({
      where: {
        tenantId,

        participantId: {
          in: participantIds,
        },

        status: "PAID",
      },

      select: {
        id: true,
        participantId: true,
      },
    }),

    prisma.financialAdjustment.findMany({
      where: {
        tenantId,

        participantId: {
          in: participantIds,
        },

        type: "ADVANCE",

        status: {
          not: "CANCELLED",
        },
      },

      select: {
        id: true,
        participantId: true,
      },
    }),
  ]);


  const paymentIds =
    participantPayments.map(
      (payment) =>
        payment.id
    );


  const adjustmentIds =
    participantAdjustments.map(
      (adjustment) =>
        adjustment.id
    );


  const financialAttachments =
    await prisma.financialAttachment.findMany({
      where: {
        tenantId,

        OR: [
          {
            entityType:
              "PAYMENT",

            entityId: {
              in: paymentIds,
            },

            type:
              "PARTICIPANT_PAYMENT",
          },

          {
            entityType:
              "ADJUSTMENT",

            entityId: {
              in: adjustmentIds,
            },

            type:
              "ADVANCE",
          },
        ],
      },

      select: {
        id: true,
        entityType: true,
        entityId: true,
        type: true,
      },
    });


  const paymentAttachmentIds =
    new Set(
      financialAttachments
        .filter(
          (attachment) =>
            attachment.entityType ===
            "PAYMENT"
        )
        .map(
          (attachment) =>
            attachment.entityId
        )
    );


  const adjustmentAttachmentIds =
    new Set(
      financialAttachments
        .filter(
          (attachment) =>
            attachment.entityType ===
            "ADJUSTMENT"
        )
        .map(
          (attachment) =>
            attachment.entityId
        )
    );    

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Participantes
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Panorama de pagamentos,
              comissões futuras e conta
              corrente dos participantes.
            </p>
          </div>

          <Link
            href="/admin/financeiro/participantes/novo"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Novo participante
          </Link>
        </div>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        {participants.length ===
        0 ? (
          <div className="p-10 text-center">
            <div className="font-medium text-gray-900">
              Nenhum participante
              cadastrado
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Cadastre primeiro os
              corretores e demais
              participantes financeiros
              da operação.
            </p>

            <Link
              href="/admin/financeiro/participantes/novo"
              className="mt-4 inline-flex rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cadastrar primeiro
              participante
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Participante
                  </th>

                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    Pago
                  </th>

                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    Disponível agora
                  </th>

                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    Futuro projetado
                  </th>

                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    Conta corrente
                  </th>

                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    PIX
                  </th>

                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Documentação
                  </th>

                  <th className="px-4 py-3 text-center font-medium text-gray-600">
                    Status
                  </th>

                  <th className="px-4 py-3" />
                </tr>
              </thead>

              <tbody className="divide-y">
                {participants.map(
                  (
                    participant
                  ) => {
                    const preferred =
                      participant.accounts.find(
                        (
                          account
                        ) =>
                          account.preferred
                      ) ??
                      participant.accounts[0];

                    let totalPaid =
                      0;

                    let availableNow =
                      0;

                    let futureProjected =
                      0;

                    for (
                      const entitlement
                      of participant.entitlements
                    ) {
                      const values =
                        entitlementValues(
                          entitlement
                        );

                      totalPaid +=
                        Math.min(
                          values.finalAmount,
                          Math.max(
                            0,
                            values.settled
                          )
                        );

                      if (
                        values.balance <=
                        0.009
                      ) {
                        continue;
                      }

                      if (
                        values.received
                      ) {
                        availableNow +=
                          values.balance;
                      } else {
                        futureProjected +=
                          values.balance;
                      }
                    }

                    totalPaid =
                      roundMoney(
                        totalPaid
                      );

                    availableNow =
                      roundMoney(
                        availableNow
                      );

                    futureProjected =
                      roundMoney(
                        futureProjected
                      );

                    const currentAccount =
                      roundMoney(
                        participant.adjustments.reduce(
                          (
                            total,
                            adjustment
                          ) =>
                            total +
                            currentAdjustmentBalance(
                              adjustment
                            ),
                          0
                        )
                      );

                    const currentAccountClass =
                      currentAccount <
                      -0.009
                        ? "text-red-700"
                        : currentAccount >
                            0.009
                          ? "text-green-700"
                          : "text-gray-900";

                          const participantPaidRemittances =
  participantPayments.filter(
    (payment) =>
      payment.participantId ===
      participant.id
  );

const participantAdvanceAdjustments =
  participantAdjustments.filter(
    (adjustment) =>
      adjustment.participantId ===
      participant.id
  );

const paymentsWithoutAttachment =
  participantPaidRemittances.filter(
    (payment) =>
      !paymentAttachmentIds.has(
        payment.id
      )
  );

const advancesWithoutAttachment =
  participantAdvanceAdjustments.filter(
    (adjustment) =>
      !adjustmentAttachmentIds.has(
        adjustment.id
      )
  );

const documentPendingCount =
  paymentsWithoutAttachment.length +
  advancesWithoutAttachment.length;

                    return (
                      <tr
                        key={
                          participant.id
                        }
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">
                            {
                              participant.name
                            }
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {participant.cpfCnpj ||
                              participant.email ||
                              "Sem documento cadastrado"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div className="font-medium text-gray-900">
                            {formatBRL(
                              totalPaid
                            )}
                          </div>

                          <div className="mt-1 text-[10px] uppercase text-gray-400">
                            Liquidado
                          </div>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div
                            className={[
                              "font-semibold",
                              availableNow >
                              0.009
                                ? "text-gray-900"
                                : "text-gray-400",
                            ].join(
                              " "
                            )}
                          >
                            {formatBRL(
                              availableNow
                            )}
                          </div>

                          <div className="mt-1 text-[10px] uppercase text-gray-400">
                            Pronto p/ remessa
                          </div>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div
                            className={[
                              "font-medium",
                              futureProjected >
                              0.009
                                ? "text-gray-900"
                                : "text-gray-400",
                            ].join(
                              " "
                            )}
                          >
                            {formatBRL(
                              futureProjected
                            )}
                          </div>

                          <div className="mt-1 text-[10px] uppercase text-gray-400">
                            Ainda não recebido
                          </div>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div
                            className={[
                              "font-semibold",
                              currentAccountClass,
                            ].join(
                              " "
                            )}
                          >
                            {currentAccount >
                            0.009
                              ? "+"
                              : ""}
                            {formatBRL(
                              currentAccount
                            )}
                          </div>

                          <div className="mt-1 text-[10px] uppercase text-gray-400">
                            {currentAccount <
                            -0.009
                              ? "Deve à operação"
                              : currentAccount >
                                  0.009
                                ? "Crédito a favor"
                                : "Zerada"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-gray-700">
                          {preferred ? (
                            <>
                              <div className="max-w-[190px] truncate">
                                {preferred.pixKey
                                  ? `PIX: ${preferred.pixKey}`
                                  : preferred.bankName ||
                                    "Conta cadastrada"}
                              </div>

                              {preferred.holderName && (
                                <div className="mt-1 max-w-[190px] truncate text-xs text-gray-500">
                                  {
                                    preferred.holderName
                                  }
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">
                              Não cadastrado
                            </span>
                          )}
                        </td>

                            <td className="px-4 py-4">
  {documentPendingCount === 0 ? (
    <div>
      <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        Documentação em dia
      </span>

      {(participantPaidRemittances.length >
        0 ||
        participantAdvanceAdjustments.length >
          0) && (
        <div className="mt-1 text-[10px] text-gray-400">
          Remessas e vales documentados
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-1">
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
        {documentPendingCount}{" "}
        {documentPendingCount === 1
          ? "pendência"
          : "pendências"}
      </span>

      {paymentsWithoutAttachment.length >
        0 && (
        <div className="text-[10px] text-amber-700">
          {paymentsWithoutAttachment.length}{" "}
          {paymentsWithoutAttachment.length ===
          1
            ? "remessa sem comprovante"
            : "remessas sem comprovante"}
        </div>
      )}

      {advancesWithoutAttachment.length >
        0 && (
        <div className="text-[10px] text-amber-700">
          {advancesWithoutAttachment.length}{" "}
          {advancesWithoutAttachment.length ===
          1
            ? "vale sem comprovante"
            : "vales sem comprovante"}
        </div>
      )}
    </div>
  )}
</td>

                        <td className="px-4 py-4 text-center">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-1 text-xs",
                              participant.active
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-gray-200 bg-gray-100 text-gray-600",
                            ].join(
                              " "
                            )}
                          >
                            {participant.active
                              ? "Ativo"
                              : "Inativo"}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/admin/financeiro/participantes/${participant.id}`}
                            className="text-sm font-medium text-gray-700 hover:text-gray-900"
                          >
                            Abrir
                          </Link>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}