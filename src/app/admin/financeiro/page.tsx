import FinanceiroDashboard from "@/components/financeiro/FinanceiroDashboard";
import FinanceiroNav from "@/components/financeiro/FinanceiroNav";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { decimalToNumber } from "@/lib/financeiro/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function number(
  value: unknown
) {
  return decimalToNumber(
    value as never
  );
}

export default async function FinanceiroPage() {
  const session =
    await requireFinanceAccess();

  const tenantId =
    session.tenant.id;

  const [
    totalSales,
    salesVgv,
    stages,
    openEntitlements,
    pendingTaxes,
    companyAllocations,
    pendingStages,
    openAdjustments,
  ] = await Promise.all([
    prisma.financialSale.count({
      where: {
        tenantId,

        status: {
          not: "CANCELLED",
        },
      },
    }),

    prisma.financialSale.aggregate({
      where: {
        tenantId,

        status: {
          not: "CANCELLED",
        },
      },

      _sum: {
        vgv: true,
      },
    }),

    /*
     * Fotografia financeira das etapas.
     *
     * Usamos esses dados para:
     *
     * - faturado;
     * - recebido;
     * - a receber;
     * - líquido disponível;
     * - líquido faturado a receber;
     * - líquido futuro projetado.
     */
    prisma.financialStage.findMany({
      where: {
        tenantId,

        status: {
          not: "CANCELLED",
        },

        sale: {
          status: {
            not: "CANCELLED",
          },
        },
      },

      select: {
        id: true,

        expectedGrossAmount:
          true,

        commissionSharePercent:
          true,

        type:
          true,

        sale: {
          select: {
            id: true,
          },
        },

        invoices: {
          where: {
            status: "ISSUED",
          },

          select: {
            grossAmount:
              true,

            taxEntries: {
              where: {
                status: {
                  not:
                    "CANCELLED",
                },
              },

              select: {
                kind: true,

                amount:
                  true,
              },
            },
          },
        },

        receipts: {
          where: {
            status:
              "CONFIRMED",
          },

          select: {
            amount:
              true,
          },
        },

        entitlements: {
          where: {
            status: {
              not:
                "CANCELLED",
            },
          },

          select: {
            finalAmount:
              true,
          },
        },

        companyAllocations: {
          where: {
            status:
              "APPROPRIATED",
          },

          select: {
            amount:
              true,
          },
        },
      },
    }),

    prisma.financialEntitlement.findMany({
      where: {
        tenantId,

        status: {
          in: [
            "OPEN",
            "PARTIAL",
          ],
        },
      },

      select: {
        finalAmount:
          true,

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
    }),

    prisma.financialTaxEntry.aggregate({
      where: {
        tenantId,

        kind:
          "PAYABLE_BY_COMPANY",

        status: {
          in: [
            "PENDING",
            "PROVISIONED",
          ],
        },
      },

      _sum: {
        amount: true,
      },
    }),

    prisma.financialCompanyAllocation.aggregate({
      where: {
        tenantId,

        status:
          "APPROPRIATED",
      },

      _sum: {
        amount: true,
      },
    }),

    prisma.financialStage.count({
      where: {
        tenantId,

        status: {
          notIn: [
            "RESOLVED",
            "CANCELLED",
          ],
        },
      },
    }),

    /*
     * Vales ainda em aberto.
     */
    prisma.financialAdjustment.findMany({
      where: {
        tenantId,

        effect:
          "DEBIT",

        status: {
          in: [
            "AVAILABLE",
            "PARTIAL",
          ],
        },
      },

      select: {
        amount: true,

        allocations: {
          select: {
            amount:
              true,
          },
        },
      },
    }),
  ]);

  /*
   * =====================================================
   * BASE PARA PROJEÇÃO DAS ETAPAS FUTURAS
   *
   * Regra:
   *
   * - etapa COM NF emitida = já saiu do "futuro";
   * - etapa SEM NF e SEM recebimento = continua no futuro;
   * - recebimento sem NF = entra em RECEBIDO e sai do futuro;
   * - PREMIO, COMPLEMENTO e OUTRO não contaminam
   *   a proporção das etapas regulares.
   *
   * Para projetar uma etapa futura da própria venda:
   *
   * 1. procuramos as etapas regulares da mesma venda
   *    que já possuem NF emitida;
   * 2. calculamos o líquido econômico esperado delas,
   *    independentemente de já terem sido recebidas
   *    ou apropriadas;
   * 3. transformamos esse líquido na proporção de 100%;
   * 4. aplicamos o commissionSharePercent da etapa futura.
   *
   * Exemplo 50 / 50:
   *
   * etapa 1 com NF = 50%
   * líquido econômico esperado = 1.618
   *
   * etapa 2 sem NF = 50%
   * projeção = 1.618
   *
   * Exemplo 60 / 40:
   *
   * etapa 1 com NF = 60%
   * líquido econômico esperado = 2.400
   *
   * etapa 2 sem NF = 40%
   * projeção = 1.600
   *
   * Se a própria venda ainda não possui nenhuma NF,
   * não presumimos imposto: usamos o valor previsto
   * da etapa menos os direitos dos participantes.
   *
   * Nada disso grava imposto, comissão ou projeção no banco.
   * =====================================================
   */

  const saleProjectionBase =
    new Map<
      string,
      {
        knownSharePercent: number;
        companyNetKnown: number;
      }
    >();

  for (
    const stage
    of stages
  ) {
    if (
      stage.type ===
        "PREMIO" ||
      stage.type ===
        "COMPLEMENTO" ||
      stage.type ===
        "OUTRO"
    ) {
      continue;
    }

    const sharePercent =
      number(
        stage.commissionSharePercent
      );

    if (
      sharePercent <= 0
    ) {
      continue;
    }

    let invoiceGross =
      0;

    let withheld =
      0;

    let payableTax =
      0;

    for (
      const invoice
      of stage.invoices
    ) {
      invoiceGross +=
        number(
          invoice.grossAmount
        );

      for (
        const tax
        of invoice.taxEntries
      ) {
        const taxAmount =
          number(
            tax.amount
          );

        if (
          tax.kind ===
          "WITHHELD_AT_SOURCE"
        ) {
          withheld +=
            taxAmount;
        }

        if (
          tax.kind ===
          "PAYABLE_BY_COMPANY"
        ) {
          payableTax +=
            taxAmount;
        }
      }
    }

    /*
     * Sem NF emitida, essa etapa não serve como
     * referência real da própria venda.
     */
    if (
      invoiceGross <= 0
    ) {
      continue;
    }

    let participantRights =
      0;

    for (
      const entitlement
      of stage.entitlements
    ) {
      participantRights +=
        number(
          entitlement.finalAmount
        );
    }

    /*
     * A retenção na fonte não entra no caixa.
     */
    const expectedCash =
      Math.max(
        0,
        invoiceGross -
          withheld
      );

    /*
     * Este é o líquido econômico esperado da etapa,
     * mesmo que a construtora ainda não tenha pago.
     */
    const companyNetKnown =
      Math.max(
        0,
        expectedCash -
          payableTax -
          participantRights
      );

    if (
      companyNetKnown <= 0
    ) {
      continue;
    }

    const current =
      saleProjectionBase.get(
        stage.sale.id
      ) ?? {
        knownSharePercent: 0,
        companyNetKnown: 0,
      };

    current.knownSharePercent +=
      sharePercent;

    current.companyNetKnown +=
      companyNetKnown;

    saleProjectionBase.set(
      stage.sale.id,
      current
    );

  }

  let invoiced =
    0;

  let received =
    0;

  let receivable =
    0;

  let availableToAppropriate =
    0;

  let invoicedNetReceivable =
    0;

  let futureProjectedNet =
    0;

  for (
    const stage
    of stages
  ) {
    let invoiceGross =
      0;

    let withheld =
      0;

    let payableTax =
      0;

    /*
     * Soma NF e impostos da etapa.
     */
    for (
      const invoice
      of stage.invoices
    ) {
      invoiceGross +=
        number(
          invoice.grossAmount
        );

      for (
        const tax
        of invoice.taxEntries
      ) {
        const taxAmount =
          number(
            tax.amount
          );

        if (
          tax.kind ===
          "WITHHELD_AT_SOURCE"
        ) {
          withheld +=
            taxAmount;
        }

        if (
          tax.kind ===
          "PAYABLE_BY_COMPANY"
        ) {
          payableTax +=
            taxAmount;
        }
      }
    }

    /*
     * Recebimentos confirmados.
     */
    let recordedReceipts =
      0;

    for (
      const receipt
      of stage.receipts
    ) {
      recordedReceipts +=
        number(
          receipt.amount
        );
    }

    /*
     * Direitos dos participantes.
     */
    let participantRights =
      0;

    for (
      const entitlement
      of stage.entitlements
    ) {
      participantRights +=
        number(
          entitlement.finalAmount
        );
    }

    /*
     * Resultado já apropriado pela Flyimob.
     */
    let appropriated =
      0;

    for (
      const allocation
      of stage.companyAllocations
    ) {
      appropriated +=
        number(
          allocation.amount
        );
    }

    /*
     * ==================================================
     * ETAPA JÁ FATURADA
     * ==================================================
     */
    if (
      invoiceGross >
      0
    ) {
      invoiced +=
        invoiceGross;

      /*
       * Dinheiro efetivamente esperado em conta:
       *
       * NF bruta - retenção na fonte.
       */
      const expectedCash =
        Math.max(
          0,
          invoiceGross -
            withheld
        );

      /*
       * Nunca deixamos o dashboard considerar
       * como recebido mais do que efetivamente
       * poderia entrar referente à NF.
       */
      const actualCashReceived =
        Math.min(
          recordedReceipts,
          expectedCash
        );

      received +=
        actualCashReceived;

      /*
       * A receber já exclui retenção na fonte.
       */
      const cashOutstanding =
        Math.max(
          0,
          expectedCash -
            actualCashReceived
        );

      receivable +=
        cashOutstanding;

      /*
       * Resultado econômico integral esperado
       * da Flyimob nesta etapa.
       */
      const companyEconomicNet =
        Math.max(
          0,
          expectedCash -
            payableTax -
            participantRights
        );

      /*
       * Parcela da etapa que já entrou.
       */
      const receivedRatio =
        expectedCash > 0
          ? Math.min(
              1,
              actualCashReceived /
                expectedCash
            )
          : 0;

      /*
       * Resultado econômico correspondente
       * ao que já entrou.
       */
      const economicNetReceived =
        Math.max(
          0,
          actualCashReceived -
            payableTax *
              receivedRatio -
            participantRights *
              receivedRatio
        );

      /*
       * Já entrou, pertence economicamente à Flyimob,
       * mas ainda não foi apropriado.
       */
      availableToAppropriate +=
        Math.max(
          0,
          economicNetReceived -
            appropriated
        );

      /*
       * Parte líquida Flyimob que ainda está
       * faturada e aguardando recebimento.
       */
      if (
        cashOutstanding >
          0 &&
        expectedCash >
          0
      ) {
        const outstandingRatio =
          cashOutstanding /
          expectedCash;

        invoicedNetReceivable +=
          companyEconomicNet *
          outstandingRatio;
      }

      continue;
    }

    /*
     * ==================================================
     * RECEBIMENTO SEM NF
     * ==================================================
     *
     * A arquitetura permite receber antes de cadastrar
     * a NF. Nesse caso:
     *
     * - entra em RECEBIDO;
     * - deixa de ser FUTURO;
     * - não inventamos NF de R$ 0,00;
     * - não inventamos imposto futuro.
     *
     * Como ainda não temos documento fiscal para fechar
     * a tributação, não transformamos automaticamente
     * esse valor em "líquido disponível para apropriar".
     */
    if (
      recordedReceipts >
      0
    ) {
      received +=
        recordedReceipts;

      continue;
    }

    /*
     * ==================================================
     * ETAPA FUTURA SEM NF
     * ==================================================
     *
     * Entram aqui SOMENTE etapas:
     *
     * - sem NF emitida;
     * - sem recebimento confirmado.
     */
    const expectedGross =
      number(
        stage.expectedGrossAmount
      );

    if (
      expectedGross <= 0
    ) {
      continue;
    }

    /*
     * Premiações e adicionais ficam isolados.
     * Eles não participam da divisão percentual
     * das etapas regulares da venda.
     */
    if (
      stage.type ===
        "PREMIO" ||
      stage.type ===
        "COMPLEMENTO" ||
      stage.type ===
        "OUTRO"
    ) {
      continue;
    }

    const futureSharePercent =
      number(
        stage.commissionSharePercent
      );

    /*
     * CASO 1:
     *
     * A venda já possui uma etapa regular com NF.
     *
     * Não importa se ela:
     * - foi recebida;
     * - não foi recebida;
     * - foi apropriada;
     * - não foi apropriada.
     *
     * O que importa é o líquido econômico esperado
     * daquela parcela já conhecida.
     */
    const projectionBase =
      saleProjectionBase.get(
        stage.sale.id
      );

    if (
      projectionBase &&
      projectionBase.knownSharePercent >
        0 &&
      projectionBase.companyNetKnown >
        0 &&
      futureSharePercent >
        0
    ) {
      const projectedFullCompanyNet =
        projectionBase.companyNetKnown /
        (
          projectionBase.knownSharePercent /
          100
        );

      futureProjectedNet +=
        Math.max(
          0,
          projectedFullCompanyNet *
            (
              futureSharePercent /
              100
            )
        );

      continue;
    }

    /*
     * CASO 2:
     *
     * A venda não possui nenhuma etapa anterior
     * com NF que possa servir de referência.
     *
     * Nesse cenário NÃO presumimos imposto.
     * A venda pode perfeitamente ser uma operação
     * sem nota fiscal.
     *
     * Portanto, o líquido futuro projetado da etapa é:
     *
     * valor previsto da etapa
     * - direitos dos participantes
     *
     * Se não houver participantes, todo o valor
     * previsto da etapa é considerado líquido futuro.
     *
     * Exemplo:
     *
     * etapa prevista:        10.000
     * participantes:              0
     * líquido projetado:     10.000
     *
     * Se depois forem cadastrados 6.000 em direitos:
     *
     * etapa prevista:        10.000
     * participantes:          6.000
     * líquido projetado:      4.000
     *
     * Isso funciona também quando existem duas ou mais
     * etapas futuras e nenhuma delas possui NF.
     *
     * Nada é gravado no banco.
     */
    futureProjectedNet +=
      Math.max(
        0,
        expectedGross -
          participantRights
      );
  }


  /*
   * =====================================================
   * PARTICIPANTES A PAGAR
   *
   * Mantém exatamente a lógica que já existia.
   * =====================================================
   */

  let payableParticipants =
    0;

  for (
    const entitlement
    of openEntitlements
  ) {
    let settled =
      0;

    /*
     * Valores já pagos.
     */
    for (
      const allocation
      of entitlement.paymentAllocations
    ) {
      settled +=
        number(
          allocation.amount
        );
    }

    /*
     * Vales e créditos utilizados
     * para liquidar direitos.
     */
    for (
      const allocation
      of entitlement.adjustmentAllocations
    ) {
      const amount =
        number(
          allocation.amount
        );

      if (
        allocation.adjustment
          .effect ===
        "DEBIT"
      ) {
        settled +=
          amount;
      }

      if (
        allocation.adjustment
          .effect ===
        "CREDIT"
      ) {
        settled -=
          amount;
      }
    }

    payableParticipants +=
      Math.max(
        0,
        number(
          entitlement.finalAmount
        ) -
          settled
      );
  }

  /*
   * =====================================================
   * VALES EM ABERTO
   *
   * Mostra somente o que ainda está
   * efetivamente na mão dos participantes.
   * =====================================================
   */

  let openAdvances =
    0;

  for (
    const adjustment
    of openAdjustments
  ) {
    const original =
      number(
        adjustment.amount
      );

    const used =
      adjustment.allocations.reduce(
        (
          total,
          allocation
        ) =>
          total +
          number(
            allocation.amount
          ),
        0
      );

    openAdvances +=
      Math.max(
        0,
        original -
          used
      );
  }

  /*
   * =====================================================
   * POSIÇÃO ECONÔMICA
   *
   * Não chamamos isso de caixa,
   * porque parte ainda não está no banco.
   *
   * É a soma de:
   *
   * - líquido disponível;
   * - líquido faturado a receber;
   * - líquido futuro projetado;
   * - vales em aberto.
   * =====================================================
   */

  const economicPosition =
    availableToAppropriate +
    invoicedNetReceivable +
    futureProjectedNet +
    openAdvances;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Financeiro
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Controle financeiro da operação{" "}
              {session.tenant.name}.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <FinanceiroDashboard
        totalSales={
          totalSales
        }

        vgv={number(
          salesVgv._sum.vgv
        )}

        invoiced={
          invoiced
        }

        received={
          received
        }

        receivable={
          receivable
        }

        payableParticipants={
          payableParticipants
        }

        taxToSeparate={number(
          pendingTaxes._sum.amount
        )}

        companyNet={number(
          companyAllocations._sum.amount
        )}

        pendingStages={
          pendingStages
        }

        availableToAppropriate={
          availableToAppropriate
        }

        invoicedNetReceivable={
          invoicedNetReceivable
        }

        futureProjectedNet={
          futureProjectedNet
        }

        openAdvances={
          openAdvances
        }

        economicPosition={
          economicPosition
        }
      />
    </div>
  );
}