import {
  FinancialTaxMovementType,
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

function optionalString(
  value: unknown
) {
  const text =
    String(
      value ??
      ""
    ).trim();

  return text ||
    null;
}

function amountValue(
  value: unknown
) {
  const text =
    String(
      value ??
      ""
    )
      .trim()
      .replace(
        /\s/g,
        ""
      );

  if (!text) {
    throw new Error(
      "Valor não informado."
    );
  }

  const normalized =
    text.includes(
      ","
    )
      ? text
          .replace(
            /\./g,
            ""
          )
          .replace(
            ",",
            "."
          )
      : text;

  const number =
    Number(
      normalized
    );

  if (
    !Number.isFinite(
      number
    ) ||
    number <=
      0
  ) {
    throw new Error(
      "Valor inválido."
    );
  }

  return round(
    number
  );
}

function requiredDate(
  value: unknown
) {
  const text =
    optionalString(
      value
    );

  if (!text) {
    throw new Error(
      "Data não informada."
    );
  }

  const date =
    new Date(
      `${text}T12:00:00.000Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "Data inválida."
    );
  }

  return date;
}

async function recalculateClosing(
  closingId: string,
  tenantId: string
) {
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
    throw new Error(
      "Fechamento fiscal não encontrado."
    );
  }

  const separated =
    closing.movements
      .filter(
        (
          movement
        ) =>
          movement.type ===
          "SEPARATION"
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

  let status =
    closing.status;

  let separatedAt =
    closing.separatedAt;

  if (
    closing.status !==
      "OPEN" &&
    closing.status !==
      "CANCELLED" &&
    closing.status !==
      "PAID"
  ) {
    if (
      separated >
      0.009
    ) {
      status =
        "SEPARATED";

      separatedAt =
        closing.movements
          .filter(
            (
              movement
            ) =>
              movement.type ===
              "SEPARATION"
          )
          .sort(
            (
              a,
              b
            ) =>
              b.occurredAt.getTime() -
              a.occurredAt.getTime()
          )[0]?.occurredAt ||
        closing.separatedAt ||
        new Date();
    } else {
      status =
        "CLOSED";

      separatedAt =
        null;
    }
  }

  return prisma.financialTaxClosing.update({
    where: {
      id:
        closing.id,
    },
    data: {
      separatedAmount:
        new Prisma.Decimal(
          round(
            separated
          )
        ),
      status,
      separatedAt,
    },
  });
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

    const type =
      String(
        body.type ||
        ""
      ).trim();

    const allowedTypes:
      FinancialTaxMovementType[] =
      [
        "SEPARATION",
        "PAYMENT",
        "ADJUSTMENT",
      ];

    if (!closingId) {
      throw new Error(
        "Fechamento não informado."
      );
    }

    if (
      !allowedTypes.includes(
        type as FinancialTaxMovementType
      )
    ) {
      throw new Error(
        "Tipo de movimentação inválido."
      );
    }

    const closing =
      await prisma.financialTaxClosing.findFirst({
        where: {
          id:
            closingId,
          tenantId,
        },
        select: {
          id:
            true,
          status:
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
      closing.status ===
      "OPEN"
    ) {
      throw new Error(
        "Feche a competência antes de registrar separações, pagamentos ou ajustes."
      );
    }

    if (
      closing.status ===
      "CANCELLED"
    ) {
      throw new Error(
        "Este fechamento está cancelado."
      );
    }

    if (
      closing.status ===
      "PAID"
    ) {
      throw new Error(
        "Esta competência já foi concluída. O histórico está bloqueado para novos lançamentos."
      );
    }

    const financialAccountId =
      optionalString(
        body.financialAccountId
      );

    if (
      financialAccountId
    ) {
      const account =
        await prisma.financialAccount.findFirst({
          where: {
            id:
              financialAccountId,
            tenantId,
            active:
              true,
          },
          select: {
            id:
              true,
          },
        });

      if (!account) {
        throw new Error(
          "Conta financeira inválida."
        );
      }
    }

    const category =
      type ===
      "ADJUSTMENT"
        ? optionalString(
            body.adjustmentCategory
          )
        : null;

    const rawDescription =
      optionalString(
        body.description
      );

    const description =
      category
        ? `[${category}]${
            rawDescription
              ? ` ${rawDescription}`
              : ""
          }`
        : rawDescription;

    const movement =
      await prisma.financialTaxMovement.create({
        data: {
          tenantId,
          closingId:
            closing.id,
          type:
            type as FinancialTaxMovementType,
          amount:
            new Prisma.Decimal(
              amountValue(
                body.amount
              )
            ),
          occurredAt:
            requiredDate(
              body.occurredAt
            ),
          financialAccountId,
          description,
          notes:
            optionalString(
              body.notes
            ),
        },
      });

    const updatedClosing =
      await recalculateClosing(
        closing.id,
        tenantId
      );

    return Response.json({
      ok:
        true,
      movement,
      closing:
        updatedClosing,
    });
  } catch (
    error
  ) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao registrar movimentação fiscal.",
      },
      {
        status:
          400,
      }
    );
  }
}
