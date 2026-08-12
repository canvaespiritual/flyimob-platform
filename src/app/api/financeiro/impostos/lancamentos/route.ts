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

    const invoiceId =
      requiredString(
        body.invoiceId,
        "Nota fiscal"
      );

    const invoice =
      await prisma.financialInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId,
        },

        select: {
          id: true,
        },
      });

    if (!invoice) {
      return Response.json(
        {
          error:
            "Nota fiscal não encontrada.",
        },
        { status: 404 }
      );
    }

    const kind =
      requiredString(
        body.kind,
        "Tipo do imposto"
      ) as FinancialTaxKind;

    const allowed:
      FinancialTaxKind[] = [
        "WITHHELD_AT_SOURCE",
        "PAYABLE_BY_COMPANY",
        "OTHER",
      ];

    if (
      !allowed.includes(
        kind
      )
    ) {
      throw new Error(
        "Tipo de imposto inválido."
      );
    }

    const tax =
      await prisma.financialTaxEntry.create({
        data: {
          tenantId,
          invoiceId,

          name:
            requiredString(
              body.name,
              "Nome do imposto"
            ),

          kind,

          rate:
            optionalDecimal(
              body.rate
            ),

          amount:
            requiredDecimal(
              body.amount,
              "Valor do imposto"
            ),

          status:
            kind ===
            "WITHHELD_AT_SOURCE"
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