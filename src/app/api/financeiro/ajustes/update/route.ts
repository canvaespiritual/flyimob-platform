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

    const id =
      requiredString(
        body.id,
        "Ajuste"
      );

    const existing =
      await prisma.financialAdjustment.findFirst({
        where: {
          id,
          tenantId,
        },

        include: {
          allocations: {
            select: {
              amount: true,
            },
          },
        },
      });

    if (!existing) {
      return Response.json(
        {
          error:
            "Vale/ajuste não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const allocated =
      existing.allocations.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.amount
          ),
        0
      );

    if (
      body.action ===
      "CANCEL"
    ) {
      if (
        allocated > 0
      ) {
        throw new Error(
          "Este vale já foi parcialmente utilizado e não pode ser cancelado diretamente."
        );
      }

      const adjustment =
        await prisma.financialAdjustment.update({
          where: {
            id,
          },

          data: {
            status:
              "CANCELLED",
          },
        });

      return Response.json({
        ok: true,
        adjustment,
      });
    }

    if (
      existing.status ===
      "CANCELLED"
    ) {
      throw new Error(
        "Um ajuste cancelado não pode ser editado."
      );
    }

    const type =
      requiredString(
        body.type,
        "Tipo"
      ) as FinancialAdjustmentType;

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
      effect =
        requiredString(
          body.effect,
          "Efeito"
        ) as FinancialAdjustmentEffect;
    }

    const newAmount =
      requiredDecimal(
        body.amount,
        "Valor"
      );

    if (
      Number(newAmount) <
      allocated
    ) {
      throw new Error(
        `O valor não pode ser menor que o total já utilizado deste ajuste. Já utilizado: R$ ${allocated.toFixed(
          2
        )}.`
      );
    }

    let status =
      existing.status;

    if (
      allocated === 0
    ) {
      status =
        "AVAILABLE";
    } else if (
      allocated <
      Number(newAmount)
    ) {
      status =
        "PARTIAL";
    } else {
      status =
        "APPLIED";
    }

    const adjustment =
      await prisma.financialAdjustment.update({
        where: {
          id,
        },

        data: {
          type,
          effect,

          amount:
            newAmount,

          occurredAt:
            requiredDate(
              body.occurredAt,
              "Data"
            ),

          description:
            optionalString(
              body.description
            ),

          notes:
            optionalString(
              body.notes
            ),

          status,
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