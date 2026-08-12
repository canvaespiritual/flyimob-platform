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
  const auth = await getFinanceApiSession();

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

    const stageId =
      requiredString(
        body.stageId,
        "Etapa"
      );

    const stage =
      await prisma.financialStage.findFirst({
        where: {
          id: stageId,
          tenantId,
        },

        select: {
          id: true,
        },
      });

    if (!stage) {
      return Response.json(
        {
          error:
            "Etapa não encontrada.",
        },
        { status: 404 }
      );
    }

    const issuedAt =
      requiredDate(
        body.issuedAt,
        "Data da nota"
      );

    const grossAmount =
      requiredDecimal(
        body.grossAmount,
        "Valor da nota"
      );

    const invoice =
      await prisma.financialInvoice.create({
        data: {
          tenantId,
          stageId,

          number:
            optionalString(
              body.number
            ),

          grossAmount,

          issuedAt,

          competenceYear:
            issuedAt.getFullYear(),

          competenceMonth:
            issuedAt.getMonth() + 1,

          status: "ISSUED",
        },
      });

    await prisma.financialStage.update({
      where: {
        id: stageId,
      },

      data: {
        status:
          "AWAITING_RECEIPT",
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