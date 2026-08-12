import { prisma } from "@/lib/prisma";

import { getFinanceApiSession } from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalString,
  requiredDate,
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
    const body = await req.json();

    const tenantId =
      auth.session.tenant.id;

    const id =
      requiredString(
        body.id,
        "Nota fiscal"
      );

    const existing =
      await prisma.financialInvoice.findFirst({
        where: {
          id,
          tenantId,
        },

        select: {
          id: true,
        },
      });

    if (!existing) {
      return Response.json(
        {
          error:
            "Nota fiscal não encontrada.",
        },
        { status: 404 }
      );
    }

    const issuedAt =
      requiredDate(
        body.issuedAt,
        "Data da nota"
      );

    const invoice =
      await prisma.financialInvoice.update({
        where: {
          id,
        },

        data: {
          number:
            optionalString(
              body.number
            ),

          grossAmount:
            requiredDecimal(
              body.grossAmount,
              "Valor da nota"
            ),

          issuedAt,

          competenceYear:
            issuedAt.getFullYear(),

          competenceMonth:
            issuedAt.getMonth() + 1,
        },
      });

    return Response.json({
      ok: true,
      invoice,
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