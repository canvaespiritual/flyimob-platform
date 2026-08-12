import {
  FinancialCalculationBasis,
  FinancialParticipantRole,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  calculateEntitlement,
  calculateNetAfterAllTaxes,
  calculateNetAfterWithholding,
} from "@/lib/financeiro/calculations";

import {
  errorMessage,
  optionalDecimal,
  requiredDecimal,
  requiredString,
} from "@/lib/financeiro/validators";

import {
  roundMoney,
} from "@/lib/financeiro/money";

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

    const stageId =
      requiredString(
        body.stageId,
        "Etapa"
      );

    const participantId =
      requiredString(
        body.participantId,
        "Participante"
      );

    const stage =
      await prisma.financialStage.findFirst({
        where: {
          id:
            stageId,

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
              status:
                "ISSUED",
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

    const participant =
      await prisma.financialParticipant.findFirst({
        where: {
          id:
            participantId,

          tenantId,
        },

        select: {
          id: true,
        },
      });

    if (!participant) {
      throw new Error(
        "Participante não encontrado."
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

    const userFinalAmount =
      requiredDecimal(
        body.finalAmount,
        "Valor final"
      );

    const grossFromInvoices =
      stage.invoices.reduce(
        (total, invoice) =>
          total.plus(
            invoice.grossAmount ||
              0
          ),
        new Prisma.Decimal(0)
      );

    const grossCommission =
      grossFromInvoices.gt(0)
        ? grossFromInvoices
        : stage.expectedGrossAmount ||
          0;

    const withheld =
      stage.invoices.flatMap(
        (invoice) =>
          invoice.taxEntries
      ).filter(
        (tax) =>
          tax.kind ===
          "WITHHELD_AT_SOURCE"
      );

    const payable =
      stage.invoices.flatMap(
        (invoice) =>
          invoice.taxEntries
      ).filter(
        (tax) =>
          tax.kind ===
          "PAYABLE_BY_COMPANY"
      );

    const netAfterWithholding =
      calculateNetAfterWithholding({
        grossAmount:
          grossCommission,

        withheldTaxes:
          withheld.map(
            (tax) =>
              tax.amount
          ),
      });

    const netAfterAllTaxes =
      calculateNetAfterAllTaxes({
        grossAmount:
          grossCommission,

        withheldTaxes:
          withheld.map(
            (tax) =>
              tax.amount
          ),

        payableTaxes:
          payable.map(
            (tax) =>
              tax.amount
          ),
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
            ? userFinalAmount
            : null,

        manualAmount:
          calculationBasis ===
          "MANUAL"
            ? userFinalAmount
            : null,
      });

    const roundedFinal =
      roundMoney(
        userFinalAmount
      );

    const hasOverride =
      !calculatedAmount.eq(
        roundedFinal
      );

    const entitlement =
      await prisma.financialEntitlement.create({
        data: {
          tenantId,
          stageId,
          participantId,

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

          status:
            "OPEN",
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
      {
        status: 400,
      }
    );
  }
}