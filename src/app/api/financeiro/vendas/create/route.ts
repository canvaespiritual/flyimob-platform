import {
  FinancialCommissionInputMode,
  FinancialStageType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalDate,
  optionalDecimal,
  optionalString,
  requiredString,
} from "@/lib/financeiro/validators";

import {
  percentageOf,
  roundMoney,
} from "@/lib/financeiro/money";

import {
  writeFinancialAudit,
} from "@/lib/financeiro/audit.server";

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

    const clientName =
      requiredString(
        body.clientName,
        "Cliente"
      );

    const inputMode =
      requiredString(
        body.commissionInputMode,
        "Forma da comissão"
      ) as FinancialCommissionInputMode;

    const allowedModes:
      FinancialCommissionInputMode[] =
      [
        "MANUAL_AMOUNT",
        "VGV_PERCENT",
        "VGV_PERCENT_OVERRIDE",
      ];

    if (
      !allowedModes.includes(
        inputMode
      )
    ) {
      throw new Error(
        "Forma de comissão inválida."
      );
    }

    const vgv =
      optionalDecimal(
        body.vgv
      );

    const commissionPercent =
      optionalDecimal(
        body.commissionPercent
      );

    const manualCommission =
      optionalDecimal(
        body.commissionManualAmount
      );

    let calculatedAmount:
      Prisma.Decimal | null =
      null;

    let overrideAmount:
      Prisma.Decimal | null =
      null;

    let finalAmount:
      Prisma.Decimal | null =
      null;

    if (
      inputMode ===
      "MANUAL_AMOUNT"
    ) {
      if (!manualCommission) {
        throw new Error(
          "Informe o valor da comissão."
        );
      }

      finalAmount =
        roundMoney(
          manualCommission
        );
    }

    if (
      inputMode ===
      "VGV_PERCENT"
    ) {
      if (
        !vgv ||
        !commissionPercent
      ) {
        throw new Error(
          "Informe VGV e percentual da comissão."
        );
      }

      calculatedAmount =
        roundMoney(
          percentageOf(
            vgv,
            commissionPercent
          )
        );

      finalAmount =
        calculatedAmount;
    }

    if (
      inputMode ===
      "VGV_PERCENT_OVERRIDE"
    ) {
      if (
        !vgv ||
        !commissionPercent
      ) {
        throw new Error(
          "Informe VGV e percentual da comissão."
        );
      }

      calculatedAmount =
        roundMoney(
          percentageOf(
            vgv,
            commissionPercent
          )
        );

      if (
        !manualCommission
      ) {
        throw new Error(
          "Informe o valor final ajustado da comissão."
        );
      }

      overrideAmount =
        roundMoney(
          manualCommission
        );

      finalAmount =
        overrideAmount;
    }

    const construtoraId =
      optionalString(
        body.construtoraId
      );

    if (construtoraId) {
      const construtora =
        await prisma.construtora.findFirst({
          where: {
            id:
              construtoraId,
            tenantId,
          },

          select: {
            id: true,
          },
        });

      if (!construtora) {
        throw new Error(
          "Construtora inválida."
        );
      }
    }

    const empreendimentoId =
      optionalString(
        body.empreendimentoId
      );

    if (empreendimentoId) {
      const empreendimento =
        await prisma.empreendimento.findFirst({
          where: {
            id:
              empreendimentoId,
            tenantId,
          },

          select: {
            id: true,
          },
        });

      if (!empreendimento) {
        throw new Error(
          "Empreendimento inválido."
        );
      }
    }

    const stagesInput =
      Array.isArray(
        body.stages
      )
        ? body.stages
        : [];

    const validStageTypes:
      FinancialStageType[] =
      [
        "ATO",
        "BANCO",
        "PREMIO",
        "COMPLEMENTO",
        "OUTRO",
      ];

    const stageData =
      stagesInput.map(
        (
          stage: Record<
            string,
            unknown
          >,
          index: number
        ) => {
          const type =
            requiredString(
              stage.type,
              "Tipo da etapa"
            ) as FinancialStageType;

          if (
            !validStageTypes.includes(
              type
            )
          ) {
            throw new Error(
              "Tipo de etapa inválido."
            );
          }

          return {
            tenantId,

            type,

            label:
              optionalString(
                stage.label
              ),

            sequence:
              typeof stage.sequence ===
              "number"
                ? stage.sequence
                : index,

            commissionSharePercent:
              optionalDecimal(
                stage.commissionSharePercent
              ),

            expectedGrossAmount:
              optionalDecimal(
                stage.expectedGrossAmount
              ),

            status:
              "EXPECTED" as const,
          };
        }
      );

    const sale =
      await prisma.financialSale.create({
        data: {
          tenantId,

          clientName,

          clientCpfCnpj:
            optionalString(
              body.clientCpfCnpj
            ),

          clientPhone:
            optionalString(
              body.clientPhone
            ),

          clientEmail:
            optionalString(
              body.clientEmail
            ),

          construtoraId,

          empreendimentoId,

          construtoraNameManual:
            optionalString(
              body.construtoraNameManual
            ),

          empreendimentoNameManual:
            optionalString(
              body.empreendimentoNameManual
            ),

          unit:
            optionalString(
              body.unit
            ),

          block:
            optionalString(
              body.block
            ),

          saleDate:
            optionalDate(
              body.saleDate
            ),

          vgv,

          commissionInputMode:
            inputMode,

          commissionPercent,

          commissionCalculatedAmount:
            calculatedAmount,

          commissionOverrideAmount:
            overrideAmount,

          commissionFinalAmount:
            finalAmount,

          status:
            "OPEN",

          notes:
            optionalString(
              body.notes
            ),

          createdById:
            auth.session.user.id,

          stages:
            stageData.length >
            0
              ? {
                  create:
                    stageData,
                }
              : undefined,
        },

        include: {
          stages: true,
        },
      });

    void writeFinancialAudit({
      tenantId,
      entityType:
        "FinancialSale",
      entityId:
        sale.id,
      action:
        "CREATE",
      userId:
        auth.session.user.id,
      afterData:
        sale,
    });

    return Response.json({
      ok: true,
      sale,
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