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
    const body =
      await req.json();

    const tenantId =
      auth.session.tenant.id;

    const id =
      requiredString(
        body.id,
        "Recebimento"
      );

    const existing =
      await prisma.financialReceipt.findFirst({
        where: {
          id,
          tenantId,
        },

        select: {
          id: true,
          remittanceId: true,
        },
      });

    if (!existing) {
      return Response.json(
        {
          error:
            "Recebimento não encontrado.",
        },
        { status: 404 }
      );
    }

    if (existing.remittanceId) {
      return Response.json({ error: "Parcela de remessa não pode ser editada individualmente." }, { status: 409 });
    }

    const receipt =
      await prisma.financialReceipt.update({
        where: {
          id,
        },

        data: {
          amount:
            requiredDecimal(
              body.amount,
              "Valor"
            ),

          receivedAt:
            requiredDate(
              body.receivedAt,
              "Data"
            ),

          reference:
            optionalString(
              body.reference
            ),
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
