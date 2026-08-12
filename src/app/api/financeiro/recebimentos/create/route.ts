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
          id: stageId,
          tenantId,
        },

        include: {
          receipts: {
            where: {
              status: "CONFIRMED",
            },
          },
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
        (sum, item) =>
          sum +
          Number(
            item.amount || 0
          ),
        0
      );

    const total =
      previous +
      Number(amount);

    const expected =
      Number(
        stage.expectedGrossAmount ||
          0
      );

    await prisma.financialStage.update({
      where: {
        id: stageId,
      },

      data: {
        status:
          expected > 0 &&
          total < expected
            ? "PARTIALLY_RECEIVED"
            : "RECEIVED",
      },
    });

    return Response.json({
      ok: true,
      receipt,
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