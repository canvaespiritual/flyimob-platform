import {
  FinancialAdjustmentEffect,
  FinancialAdjustmentType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

export async function GET(
  req: Request
) {
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
    const url =
      new URL(req.url);

    const participantId =
      requiredString(
        url.searchParams.get(
          "participantId"
        ),
        "Participante"
      );

    const tenantId =
      auth.session.tenant.id;

    const participant =
      await prisma.financialParticipant.findFirst({
        where: {
          id: participantId,
          tenantId,
        },

        select: {
          id: true,
          name: true,
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

    const adjustments =
      await prisma.financialAdjustment.findMany({
        where: {
          tenantId,
          participantId,
        },

        orderBy: [
          {
            occurredAt:
              "desc",
          },
          {
            createdAt:
              "desc",
          },
        ],

        include: {
          allocations: {
            select: {
              id: true,
              amount: true,
              appliedAt: true,

              entitlement: {
                select: {
                  id: true,

                  stage: {
                    select: {
                      id: true,
                      label: true,
                      type: true,

                      sale: {
                        select: {
                          id: true,
                          clientName: true,
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

    const rows =
      adjustments.map(
        (adjustment) => {
          const used =
            adjustment.allocations.reduce(
              (
                total,
                allocation
              ) =>
                total +
                Number(
                  allocation.amount
                ),
              0
            );

          const original =
            Number(
              adjustment.amount
            );

          const remaining =
            Math.max(
              0,
              original -
                used
            );

          return {
            id:
              adjustment.id,

            type:
              adjustment.type,

            effect:
              adjustment.effect,

            amount:
              original,

            used,

            remaining,

            occurredAt:
              adjustment.occurredAt.toISOString(),

            appliedAt:
              adjustment.appliedAt?.toISOString() ??
              null,

            status:
              adjustment.status,

            description:
              adjustment.description,

            notes:
              adjustment.notes,

            allocations:
              adjustment.allocations.map(
                (
                  allocation
                ) => ({
                  id:
                    allocation.id,

                  amount:
                    Number(
                      allocation.amount
                    ),

                  appliedAt:
                    allocation.appliedAt.toISOString(),

                  entitlementId:
                    allocation.entitlement.id,

                  stageId:
                    allocation.entitlement.stage.id,

                  stageLabel:
                    allocation.entitlement.stage.label,

                  stageType:
                    allocation.entitlement.stage.type,

                  saleId:
                    allocation.entitlement.stage.sale.id,

                  clientName:
                    allocation.entitlement.stage.sale.clientName,
                })
              ),
          };
        }
      );

    const openDebitBalance =
      rows
        .filter(
          (item) =>
            item.effect ===
              "DEBIT" &&
            item.status !==
              "CANCELLED"
        )
        .reduce(
          (total, item) =>
            total +
            item.remaining,
          0
        );

    const openCreditBalance =
      rows
        .filter(
          (item) =>
            item.effect ===
              "CREDIT" &&
            item.status !==
              "CANCELLED"
        )
        .reduce(
          (total, item) =>
            total +
            item.remaining,
          0
        );

    return Response.json({
      ok: true,

      participant,

      summary: {
        openDebitBalance,
        openCreditBalance,

        netAdjustmentBalance:
          openDebitBalance -
          openCreditBalance,
      },

      adjustments:
        rows,
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

export async function POST(
  req: Request
) {
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

    const participantId =
      requiredString(
        body.participantId,
        "Participante"
      );

    const participant =
      await prisma.financialParticipant.findFirst({
        where: {
          id: participantId,
          tenantId,
        },

        select: {
          id: true,
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

    const type =
      requiredString(
        body.type,
        "Tipo"
      ) as FinancialAdjustmentType;

    const allowedTypes:
      FinancialAdjustmentType[] =
      [
        "ADVANCE",
        "DISCOUNT",
        "BONUS",
        "REIMBURSEMENT",
        "OTHER",
      ];

    if (
      !allowedTypes.includes(
        type
      )
    ) {
      throw new Error(
        "Tipo de ajuste inválido."
      );
    }

    let effect:
      FinancialAdjustmentEffect;

    if (
      type === "ADVANCE" ||
      type === "DISCOUNT"
    ) {
      effect = "DEBIT";
    } else if (
      type === "BONUS" ||
      type === "REIMBURSEMENT"
    ) {
      effect = "CREDIT";
    } else {
      const requestedEffect =
        requiredString(
          body.effect,
          "Efeito"
        ) as FinancialAdjustmentEffect;

      if (
        requestedEffect !==
          "DEBIT" &&
        requestedEffect !==
          "CREDIT"
      ) {
        throw new Error(
          "Efeito inválido."
        );
      }

      effect =
        requestedEffect;
    }

    const adjustment =
      await prisma.financialAdjustment.create({
        data: {
          tenantId,
          participantId,

          type,
          effect,

          amount:
            requiredDecimal(
              body.amount,
              "Valor"
            ),

          occurredAt:
            requiredDate(
              body.occurredAt,
              "Data"
            ),

          status:
            "AVAILABLE",

          description:
            optionalString(
              body.description
            ),

          notes:
            optionalString(
              body.notes
            ),
        },
      });

    return Response.json({
      ok: true,
      adjustment,
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