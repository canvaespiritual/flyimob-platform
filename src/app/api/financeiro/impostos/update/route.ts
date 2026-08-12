import {
  FinancialTaxKind,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getFinanceApiSession } from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalDecimal,
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
        "Imposto"
      );

    const existing =
      await prisma.financialTaxEntry.findFirst({
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
            "Imposto não encontrado.",
        },
        { status: 404 }
      );
    }

    const kind =
      requiredString(
        body.kind,
        "Tipo"
      ) as FinancialTaxKind;

    const tax =
      await prisma.financialTaxEntry.update({
        where: {
          id,
        },

        data: {
          invoiceId:
            requiredString(
              body.invoiceId,
              "Nota"
            ),

          name:
            requiredString(
              body.name,
              "Nome"
            ),

          kind,

          rate:
            optionalDecimal(
              body.rate
            ),

          amount:
            requiredDecimal(
              body.amount,
              "Valor"
            ),

          status:
  kind === "WITHHELD_AT_SOURCE"
    ? "WITHHELD"
    : "PENDING",
        },
      });

    return Response.json({
      ok: true,
      tax,
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