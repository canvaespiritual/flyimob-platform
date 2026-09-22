import {
  FinancialTaxKind,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import { assertOpenTaxCompetence } from "@/lib/financeiro/grouped-invoicing.server";
import { refreshFinancialStageStatus } from "@/lib/financeiro/stage-status.server";

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
          invoiceId: true,
          invoice: { select: { stageId: true, competenceYear: true, competenceMonth: true,
            allocations: { select: { stageId: true } } } },
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
    const targetInvoiceId = requiredString(body.invoiceId, "Nota");
    const targetInvoice = await prisma.financialInvoice.findFirst({ where: { id: targetInvoiceId, tenantId },
      select: { id: true, stageId: true, competenceYear: true, competenceMonth: true } });
    if (!targetInvoice) throw new Error("Nota fiscal não encontrada no tenant.");
    if ((!existing.invoice.stageId || !targetInvoice.stageId) && targetInvoiceId !== existing.invoiceId) {
      throw new Error("Imposto de NF agrupada não pode ser transferido entre NFs.");
    }
    for (const invoice of [existing.invoice, targetInvoice]) {
      if (!invoice.stageId) {
        if (!invoice.competenceYear || !invoice.competenceMonth) throw new Error("NF agrupada sem competência.");
        await assertOpenTaxCompetence(prisma, tenantId, invoice.competenceYear, invoice.competenceMonth);
      }
    }

    const kind =
      requiredString(
        body.kind,
        "Tipo"
      ) as FinancialTaxKind;

    const data = {
          invoiceId: targetInvoiceId,

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
    ? "WITHHELD" as const
    : "PENDING" as const,
        };
    const tax = existing.invoice.stageId
      ? await prisma.financialTaxEntry.update({ where: { id }, data })
      : await prisma.$transaction(async (tx) => {
        const updated = await tx.financialTaxEntry.update({ where: { id }, data });
        for (const item of existing.invoice.allocations) {
          await refreshFinancialStageStatus(tx, { stageId: item.stageId, tenantId });
        }
        return updated;
      }, { maxWait: 10000, timeout: 20000 });

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
