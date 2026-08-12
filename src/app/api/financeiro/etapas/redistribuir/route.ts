import {
  FinancialCalculationBasis,
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
  errorMessage,
  requiredString,
} from "@/lib/financeiro/validators";

import {
  roundMoney,
} from "@/lib/financeiro/money";

function isPrincipalStage(
  type: string
) {
  return (
    type === "ATO" ||
    type === "BANCO"
  );
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

    const stageId =
      requiredString(
        body.stageId,
        "Etapa"
      );

    /*
     * ==========================================
     * CARREGAR VENDA E TODAS AS ETAPAS
     * ==========================================
     */

    const stageReference =
      await prisma.financialStage.findFirst({
        where: {
          id: stageId,
          tenantId,
        },

        select: {
          id: true,
          type: true,
          saleId: true,
        },
      });

    if (!stageReference) {
      return Response.json(
        {
          error:
            "Etapa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !isPrincipalStage(
        stageReference.type
      )
    ) {
      throw new Error(
        "A redistribuição automática é exclusiva das etapas principais Ato/Banco."
      );
    }

    const sale =
      await prisma.financialSale.findFirst({
        where: {
          id:
            stageReference.saleId,

          tenantId,
        },

        include: {
          stages: {
            orderBy: {
              sequence: "asc",
            },

            include: {
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

              entitlements: {
                orderBy: {
                  createdAt: "asc",
                },

                include: {
                  paymentAllocations: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!sale) {
      throw new Error(
        "Venda não encontrada."
      );
    }

    /*
     * ==========================================
     * ETAPAS PRINCIPAIS
     * ==========================================
     */

    const principalStages =
      sale.stages.filter(
        (stage) =>
          isPrincipalStage(
            stage.type
          )
      );

    const targetIndex =
      principalStages.findIndex(
        (stage) =>
          stage.id === stageId
      );

    if (
      targetIndex === -1
    ) {
      throw new Error(
        "A etapa não pertence à estrutura principal desta venda."
      );
    }

    if (
      targetIndex === 0
    ) {
      throw new Error(
        "A primeira etapa principal define a estrutura inicial da venda."
      );
    }

    const targetStage =
      principalStages[
        targetIndex
      ];

    /*
     * ==========================================
     * ETAPAS PRINCIPAIS ANTERIORES
     * ==========================================
     */

    const previousStages =
      principalStages.slice(
        0,
        targetIndex
      );

    /*
     * Procuramos a etapa anterior mais próxima
     * que já tenha participantes.
     */

    const sourceStage =
      [...previousStages]
        .reverse()
        .find(
          (stage) =>
            stage.entitlements.length >
            0
        );

    if (!sourceStage) {
      throw new Error(
        "Nenhuma etapa principal anterior possui participantes para herdar."
      );
    }

    /*
     * ==========================================
     * SALDO BRUTO RESTANTE DA COMISSÃO
     * ==========================================
     *
     * Comissão total
     * - bruto consolidado das etapas anteriores
     * = saldo da etapa atual
     *
     * Se etapa anterior já tem NF, usamos NF.
     * Se ainda não tem NF, usamos valor previsto.
     */

    let previousGross =
      new Prisma.Decimal(0);

    for (
      const stage
      of previousStages
    ) {
      let invoicedGross =
        new Prisma.Decimal(0);

      for (
        const invoice
        of stage.invoices
      ) {
        invoicedGross =
          invoicedGross.plus(
            invoice.grossAmount ||
              0
          );
      }

      const effectiveGross =
        invoicedGross.gt(0)
          ? invoicedGross
          : new Prisma.Decimal(
              stage.expectedGrossAmount ||
                0
            );

      previousGross =
        previousGross.plus(
          effectiveGross
        );
    }

    const commissionTotal =
      new Prisma.Decimal(
        sale.commissionFinalAmount ||
          0
      );

    let remainingGross =
      commissionTotal.minus(
        previousGross
      );

    if (
      remainingGross.lt(0)
    ) {
      remainingGross =
        new Prisma.Decimal(0);
    }

    remainingGross =
      roundMoney(
        remainingGross
      );

    /*
     * ==========================================
     * BRUTO DA ETAPA DESTINO
     * ==========================================
     *
     * Se a segunda etapa já possui NF:
     * usa o valor real da NF.
     *
     * Se ainda não possui NF:
     * usa o saldo restante da comissão.
     */

    let targetInvoiceGross =
      new Prisma.Decimal(0);

    for (
      const invoice
      of targetStage.invoices
    ) {
      targetInvoiceGross =
        targetInvoiceGross.plus(
          invoice.grossAmount ||
            0
        );
    }

    const targetGross =
      targetInvoiceGross.gt(0)
        ? targetInvoiceGross
        : remainingGross;

    /*
     * ==========================================
     * IMPOSTOS DA ETAPA DESTINO
     * ==========================================
     *
     * NÃO copiamos impostos da etapa anterior.
     *
     * Pegamos somente os impostos que já foram
     * cadastrados na etapa atual.
     */

    const targetTaxes =
      targetStage.invoices.flatMap(
        (invoice) =>
          invoice.taxEntries
      );

    const withheldTaxes =
      targetTaxes
        .filter(
          (tax) =>
            tax.kind ===
            "WITHHELD_AT_SOURCE"
        )
        .map(
          (tax) =>
            tax.amount
        );

    const payableTaxes =
      targetTaxes
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
          targetGross,

        withheldTaxes,
      });

    const netAfterAllTaxes =
      calculateNetAfterAllTaxes({
        grossAmount:
          targetGross,

        withheldTaxes,

        payableTaxes,
      });

    /*
     * ==========================================
     * PROTEGER ETAPA QUE JÁ TEM PAGAMENTO
     * ==========================================
     */

    const targetHasPayments =
      targetStage.entitlements.some(
        (entitlement) =>
          entitlement
            .paymentAllocations
            .length > 0
      );

    if (targetHasPayments) {
      throw new Error(
        "Esta etapa já possui movimentação de pagamento. A redistribuição automática foi bloqueada para preservar o histórico."
      );
    }

    /*
     * ==========================================
     * REMOVER DIREITOS ANTIGOS DA ETAPA DESTINO
     * ==========================================
     *
     * Como ainda não existem pagamentos,
     * podemos recalcular a estrutura.
     */

    await prisma.financialEntitlement.deleteMany({
      where: {
        stageId:
          targetStage.id,

        tenantId,
      },
    });

    /*
     * ==========================================
     * HERDAR PARTICIPANTES E REGRAS
     * ==========================================
     *
     * COPIA:
     *
     * participante
     * função
     * base de cálculo
     * percentual
     * valor fixo/manual quando aplicável
     *
     * NÃO COPIA:
     *
     * imposto
     * pagamento
     * vale
     * status financeiro anterior
     */

    let participantsCopied =
      0;

    for (
      const source
      of sourceStage.entitlements
    ) {
      if (
        source.status ===
        "CANCELLED"
      ) {
        continue;
      }

      const basis =
        source.calculationBasis as FinancialCalculationBasis;

      const percentage =
        source.percentage;

      const sourceFinal =
        new Prisma.Decimal(
          source.finalAmount
        );

      const fixedAmount =
        basis === "FIXED"
          ? (
              source.fixedAmount ||
              sourceFinal
            )
          : null;

      const manualAmount =
        basis === "MANUAL"
          ? sourceFinal
          : null;

      const calculatedAmount =
        calculateEntitlement({
          basis,

          percentage,

          grossCommission:
            targetGross,

          netAfterWithholding,

          netAfterAllTaxes,

          vgv:
            sale.vgv,

          fixedAmount,

          manualAmount,
        });

      const finalAmount =
        roundMoney(
          calculatedAmount
        );

      let calculationBaseAmount:
        Prisma.Decimal | null =
        null;

      if (
        basis ===
        "COMMISSION_GROSS"
      ) {
        calculationBaseAmount =
          targetGross;
      }

      if (
        basis ===
        "COMMISSION_NET_AFTER_WITHHOLDING"
      ) {
        calculationBaseAmount =
          netAfterWithholding;
      }

      if (
        basis ===
        "COMMISSION_NET_AFTER_ALL_TAXES"
      ) {
        calculationBaseAmount =
          netAfterAllTaxes;
      }

      if (
        basis === "VGV"
      ) {
        calculationBaseAmount =
          sale.vgv;
      }

      await prisma.financialEntitlement.create({
        data: {
          tenantId,

          stageId:
            targetStage.id,

          participantId:
            source.participantId,

          role:
            source.role,

          calculationBasis:
            basis,

          percentage,

          calculationBaseAmount,

          fixedAmount,

          calculatedAmount,

          overrideAmount:
            null,

          finalAmount,

          status:
            "OPEN",
        },
      });

      participantsCopied++;
    }

    /*
     * ==========================================
     * ATUALIZAR VALOR PREVISTO DA ETAPA
     * ==========================================
     */

    await prisma.financialStage.update({
      where: {
        id:
          targetStage.id,
      },

      data: {
        expectedGrossAmount:
          remainingGross,
      },
    });

    return Response.json({
      ok: true,

      sourceStageId:
        sourceStage.id,

      targetStageId:
        targetStage.id,

      commissionTotal:
        commissionTotal.toString(),

      previousGross:
        previousGross.toString(),

      expectedGrossAmount:
        remainingGross.toString(),

      participantsCopied,
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