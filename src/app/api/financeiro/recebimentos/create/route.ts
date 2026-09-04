import { prisma } from "@/lib/prisma";

import { getFinanceApiSession } from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalString,
  requiredDate,
  requiredDecimal,
  requiredString,
} from "@/lib/financeiro/validators";

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

    const stageId =
      requiredString(
        body.stageId,
        "Etapa"
      );

    const stage =
      await prisma.financialStage.findFirst({
        where: {
          id:
            stageId,

          tenantId,
        },

        include: {
          receipts: {
            where: {
              status:
                "CONFIRMED",
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

    if (
      !stage
    ) {
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

    const amount =
      requiredDecimal(
        body.amount,
        "Valor recebido"
      );

    const receivedAt =
      requiredDate(
        body.receivedAt,
        "Data do recebimento"
      );

    const receipt =
      await prisma.financialReceipt.create({
        data: {
          tenantId,

          stageId,

          /*
           * O valor informado continua sendo
           * exatamente o valor lançado pelo operador.
           *
           * Não alteramos histórico nem fazemos
           * desconto automático aqui.
           */
          amount,

          receivedAt,

          reference:
            optionalString(
              body.reference
            ),

          status:
            "CONFIRMED",
        },
      });

    const previous =
      stage.receipts.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.amount ||
              0
          ),
        0
      );

    const total =
      previous +
      Number(
        amount
      );

    /*
     * ==========================================
     * EXPECTATIVA REAL DE DINHEIRO NA CONTA
     * ==========================================
     */

    let invoiceGross =
      0;

    let withheld =
      0;

    for (
      const invoice
      of stage.invoices
    ) {
      invoiceGross +=
        Number(
          invoice.grossAmount ||
            0
        );

      for (
        const tax
        of invoice.taxEntries
      ) {
        if (
          tax.kind ===
          "WITHHELD_AT_SOURCE"
        ) {
          withheld +=
            Number(
              tax.amount ||
                0
            );
        }
      }
    }

    /*
     * Se existe NF, a expectativa é:
     *
     * NF bruta - retenção na fonte.
     *
     * Caso ainda não exista NF, mantemos
     * expectedGrossAmount como fallback.
     */
    const expected =
      invoiceGross >
      0
        ? Math.max(
            0,
            invoiceGross -
              withheld
          )
        : Number(
            stage.expectedGrossAmount ||
              0
          );

    await prisma.financialStage.update({
      where: {
        id:
          stageId,
      },

      data: {
        status:
          expected >
            0 &&
          total +
            0.01 <
            expected
            ? "PARTIALLY_RECEIVED"
            : "RECEIVED",
      },
    });

    return Response.json({
      ok: true,
      receipt,
    });
  } catch (
    error
  ) {
    return Response.json(
      {
        error:
          errorMessage(
            error
          ),
      },
      {
        status: 400,
      }
    );
  }
}