import {
  Prisma,
} from "@prisma/client";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  prisma,
} from "@/lib/prisma";

function round(
  value: number
) {
  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        100
    ) /
    100
  );
}

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
    const tenantId =
      auth.session.tenant.id;

    const body =
      await req.json();

    const closingId =
      String(
        body.closingId ||
        ""
      ).trim();

    const action =
      String(
        body.action ||
        ""
      ).trim();

    if (!closingId) {
      throw new Error(
        "Fechamento não informado."
      );
    }

    if (
      action !==
        "close" &&
      action !==
        "reopen" &&
      action !==
        "complete"
    ) {
      throw new Error(
        "Ação inválida."
      );
    }

    const closing =
      await prisma.financialTaxClosing.findFirst({
        where: {
          id:
            closingId,
          tenantId,
        },
        include: {
          movements:
            true,
        },
      });

    if (!closing) {
      return Response.json(
        {
          error:
            "Fechamento fiscal não encontrado.",
        },
        {
          status:
            404,
        }
      );
    }

    if (
      action ===
      "complete"
    ) {
      if (
        closing.status ===
        "PAID"
      ) {
        return Response.json({
          ok:
            true,
          closing,
        });
      }

      if (
        closing.status ===
        "OPEN"
      ) {
        throw new Error(
          "Feche a competência antes de concluí-la."
        );
      }

      if (
        closing.status ===
        "CANCELLED"
      ) {
        throw new Error(
          "Uma competência cancelada não pode ser concluída."
        );
      }

      if (
        closing.actualTaxAmount ===
        null
      ) {
        throw new Error(
          "Informe o valor real apurado antes de concluir a competência."
        );
      }

      const adjustments =
        closing.movements
          .filter(
            (
              movement
            ) =>
              movement.type ===
              "ADJUSTMENT"
          )
          .reduce(
            (
              total,
              movement
            ) =>
              total +
              Number(
                movement.amount ||
                0
              ),
            0
          );

      const payments =
        closing.movements.filter(
          (
            movement
          ) =>
            movement.type ===
            "PAYMENT"
        );

      const paid =
        payments.reduce(
          (
            total,
            movement
          ) =>
            total +
            Number(
              movement.amount ||
              0
            ),
          0
        );

      const obligation =
        Math.max(
          0,
          round(
            Number(
              closing.actualTaxAmount
            ) +
              adjustments
          )
        );

      if (
        obligation <=
        0
      ) {
        throw new Error(
          "A obrigação efetiva precisa ser maior que zero."
        );
      }

      if (
        paid +
          0.009 <
        obligation
      ) {
        throw new Error(
          `Ainda existe saldo fiscal a pagar. Obrigação: ${obligation.toFixed(
            2
          )}; pago: ${round(
            paid
          ).toFixed(
            2
          )}.`
        );
      }

      if (
        payments.length ===
        0
      ) {
        throw new Error(
          "Nenhum pagamento foi registrado para esta competência."
        );
      }

      const paymentIds =
        payments.map(
          (
            movement
          ) =>
            movement.id
        );

      const paymentProofs =
        await prisma.financialAttachment.findMany({
          where: {
            tenantId,
            entityType:
              "TAX_MOVEMENT",
            entityId: {
              in:
                paymentIds,
            },
            type:
              "TAX_PAYMENT",
          },
          select: {
            entityId:
              true,
          },
        });

      const proofIds =
        new Set(
          paymentProofs.map(
            (
              item
            ) =>
              item.entityId
          )
        );

      const paymentWithoutProof =
        payments.find(
          (
            movement
          ) =>
            !proofIds.has(
              movement.id
            )
        );

      if (
        paymentWithoutProof
      ) {
        throw new Error(
          "Existe pagamento sem comprovante anexado. Anexe o comprovante de cada pagamento antes de concluir."
        );
      }

      const lastPaymentDate =
        payments
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              b.occurredAt.getTime() -
              a.occurredAt.getTime()
          )[0]
          ?.occurredAt ||
        new Date();

      const updated =
        await prisma.financialTaxClosing.update({
          where: {
            id:
              closing.id,
          },
          data: {
            status:
              "PAID",
            paidAt:
              lastPaymentDate,
          },
        });

      return Response.json({
        ok:
          true,
        closing:
          updated,
      });
    }

    if (
      action ===
      "reopen"
    ) {
      if (
        closing.status ===
        "PAID"
      ) {
        throw new Error(
          "Uma competência concluída não pode ser reaberta por este fluxo. O histórico deve ser preservado."
        );
      }

      if (
        closing.movements.length >
        0
      ) {
        throw new Error(
          "Uma competência que já possui movimentações fiscais não pode ser reaberta."
        );
      }

      await prisma.financialTaxClosingItem.deleteMany({
        where: {
          closingId:
            closing.id,
        },
      });

      const updated =
        await prisma.financialTaxClosing.update({
          where: {
            id:
              closing.id,
          },
          data: {
            status:
              "OPEN",
            closedAt:
              null,
            separatedAt:
              null,
            paidAt:
              null,
          },
        });

      return Response.json({
        ok:
          true,
        closing:
          updated,
      });
    }

    if (
      closing.status !==
      "OPEN"
    ) {
      throw new Error(
        "Esta competência já está fechada."
      );
    }

    const taxEntries =
      await prisma.financialTaxEntry.findMany({
        where: {
          tenantId,
          kind:
            "PAYABLE_BY_COMPANY",
          status: {
            not:
              "CANCELLED",
          },
          invoice: {
            tenantId,
            status:
              "ISSUED",
            competenceYear:
              closing.competenceYear,
            competenceMonth:
              closing.competenceMonth,
          },
        },
        select: {
          id:
            true,
          amount:
            true,
        },
      });

    const provisioned =
      round(
        taxEntries.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.amount ||
              0
            ),
          0
        )
      );

    const result =
      await prisma.$transaction(
        async (
          tx
        ) => {
          await tx.financialTaxClosingItem.deleteMany({
            where: {
              closingId:
                closing.id,
            },
          });

          if (
            taxEntries.length >
            0
          ) {
            await tx.financialTaxClosingItem.createMany({
              data:
                taxEntries.map(
                  (
                    tax
                  ) => ({
                    closingId:
                      closing.id,
                    taxEntryId:
                      tax.id,
                    amount:
                      new Prisma.Decimal(
                        Number(
                          tax.amount ||
                          0
                        )
                      ),
                  })
                ),
            });
          }

          return tx.financialTaxClosing.update({
            where: {
              id:
                closing.id,
            },
            data: {
              status:
                "CLOSED",
              provisionedAmount:
                new Prisma.Decimal(
                  provisioned
                ),
              closedAt:
                new Date(),
            },
          });
        },
        {
          maxWait:
            10000,
          timeout:
            20000,
        }
      );

    return Response.json({
      ok:
        true,
      closing:
        result,
      itemsCount:
        taxEntries.length,
    });
  } catch (
    error
  ) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao alterar fechamento fiscal.",
      },
      {
        status:
          400,
      }
    );
  }
}
