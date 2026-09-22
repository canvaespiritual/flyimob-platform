import {
  FinancialCalculationBasis,
  FinancialParticipantRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import { stageInvoiceEconomics } from "@/lib/financeiro/invoice-economics.server";

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
          invoiceAllocations: { include: { invoice: { include: { taxEntries: true, allocations: true } } } },
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

    const economics = stageInvoiceEconomics(stage);
    let grossCommission = economics.gross;

    if (
      grossCommission.isZero()
    ) {
      grossCommission =
        new Prisma.Decimal(
          stage.expectedGrossAmount ||
            0
        );
    }

    const withheld = [economics.withheld];
    const payable = [economics.payable];

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
