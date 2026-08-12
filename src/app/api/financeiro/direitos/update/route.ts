import {
  FinancialCalculationBasis,
  FinancialParticipantRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getFinanceApiSession } from "@/lib/financeiro/access.server";

import {
  calculateEntitlement,
  calculateNetAfterAllTaxes,
  calculateNetAfterWithholding,
} from "@/lib/financeiro/calculations";

import {
  roundMoney,
} from "@/lib/financeiro/money";

import {
  errorMessage,
  optionalDecimal,
  requiredDecimal,
  requiredString,
} from "@/lib/financeiro/validators";

export async function POST(req: Request) {
  const auth =
    await getFinanceApiSession();

  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const body =
      await req.json();

    const tenantId =
      auth.session.tenant.id;

    const id =
      requiredString(
        body.id,
        "Direito"
      );

    const existing =
      await prisma.financialEntitlement.findFirst({
        where: {
          id,
          tenantId,
        },

        select: {
          id: true,
          stageId: true,
        },
      });

    if (!existing) {
      return Response.json(
        {
          error:
            "Participação financeira não encontrada.",
        },
        { status: 404 }
      );
    }

    const stage =
      await prisma.financialStage.findFirst({
        where: {
          id:
            existing.stageId,

          tenantId,
        },

        include: {
          sale: {
            select: {
              vgv: true,
            },
          },

          invoices: {
            where: {
              status: "ISSUED",
            },

            include: {
              taxEntries: {
                where: {
                  status: {
                    not:
                      "CANCELLED",
                  },
                },
              },
            },
          },
        },
      });

    if (!stage) {
      throw new Error(
        "Etapa não encontrada."
      );
    }

    const role =
      requiredString(
        body.role,
        "Função"
      ) as FinancialParticipantRole;

    const calculationBasis =
      requiredString(
        body.calculationBasis,
        "Forma de cálculo"
      ) as FinancialCalculationBasis;

    const percentage =
      optionalDecimal(
        body.percentage
      );

    const finalAmount =
      requiredDecimal(
        body.finalAmount,
        "Valor final"
      );

    let grossCommission =
      new Prisma.Decimal(0);

    for (
      const invoice
      of stage.invoices
    ) {
      grossCommission =
        grossCommission.plus(
          invoice.grossAmount ||
            0
        );
    }

    if (
      grossCommission.isZero()
    ) {
      grossCommission =
        new Prisma.Decimal(
          stage.expectedGrossAmount ||
            0
        );
    }

    const taxes =
      stage.invoices.flatMap(
        (invoice) =>
          invoice.taxEntries
      );

    const withheld =
      taxes
        .filter(
          (tax) =>
            tax.kind ===
            "WITHHELD_AT_SOURCE"
        )
        .map(
          (tax) =>
            tax.amount
        );

    const payable =
      taxes
        .filter(
          (tax) =>
            tax.kind ===
            "PAYABLE_BY_COMPANY"
        )
        .map(
          (tax) =>
            tax.amount
        );

    const netAfterWithholding =
      calculateNetAfterWithholding({
        grossAmount:
          grossCommission,

        withheldTaxes:
          withheld,
      });

    const netAfterAllTaxes =
      calculateNetAfterAllTaxes({
        grossAmount:
          grossCommission,

        withheldTaxes:
          withheld,

        payableTaxes:
          payable,
      });

    const calculatedAmount =
      calculateEntitlement({
        basis:
          calculationBasis,

        percentage,

        grossCommission,

        netAfterWithholding,

        netAfterAllTaxes,

        vgv:
          stage.sale.vgv,

        fixedAmount:
          calculationBasis ===
          "FIXED"
            ? finalAmount
            : null,

        manualAmount:
          calculationBasis ===
          "MANUAL"
            ? finalAmount
            : null,
      });

    const roundedFinal =
      roundMoney(
        finalAmount
      );

    const hasOverride =
      !calculatedAmount.eq(
        roundedFinal
      );

    const entitlement =
      await prisma.financialEntitlement.update({
        where: {
          id,
        },

        data: {
          role,

          calculationBasis,

          percentage,

          calculationBaseAmount:
            calculationBasis ===
            "COMMISSION_GROSS"
              ? grossCommission
              : calculationBasis ===
                  "COMMISSION_NET_AFTER_WITHHOLDING"
                ? netAfterWithholding
                : calculationBasis ===
                    "COMMISSION_NET_AFTER_ALL_TAXES"
                  ? netAfterAllTaxes
                  : calculationBasis ===
                      "VGV"
                    ? stage.sale.vgv
                    : null,

          fixedAmount:
            calculationBasis ===
            "FIXED"
              ? roundedFinal
              : null,

          calculatedAmount,

          overrideAmount:
            hasOverride
              ? roundedFinal
              : null,

          finalAmount:
            roundedFinal,
        },
      });

    return Response.json({
      ok: true,
      entitlement,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          errorMessage(error),
      },
      { status: 400 }
    );
  }
}