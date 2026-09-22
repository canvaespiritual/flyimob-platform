import {
  FinancialTaxStatus,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  errorMessage,
  requiredString,
} from "@/lib/financeiro/validators";

import {
  refreshFinancialStageStatus,
} from "@/lib/financeiro/stage-status.server";
import { assertOpenTaxCompetence } from "@/lib/financeiro/grouped-invoicing.server";
import { invoiceStageIds } from "@/lib/financeiro/invoice-economics.server";

export async function POST(
  req: Request
) {
  const auth =
    await getFinanceApiSession();

  if (!auth.ok) {
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
    const body =
      await req.json();

    const tenantId =
      auth.session.tenant.id;

    const taxId =
      requiredString(
        body.taxId,
        "Imposto"
      );

    const action =
      requiredString(
        body.action,
        "Ação"
      );

    const date =
      body.date
        ? new Date(
            String(
              body.date
            )
          )
        : new Date();

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      throw new Error(
        "Data inválida."
      );
    }

    const tax =
      await prisma.financialTaxEntry.findFirst({
        where: {
          id: taxId,
          tenantId,
        },

        include: {
          invoice: {
            select: {
              stageId: true,
              competenceYear: true,
              competenceMonth: true,
              allocations: { select: { stageId: true } },
            },
          },
        },
      });

    if (!tax) {
      return Response.json(
        {
          error:
            "Imposto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }
    if (!tax.invoice.stageId) {
      if (!tax.invoice.competenceYear || !tax.invoice.competenceMonth) throw new Error("NF agrupada sem competência.");
      await assertOpenTaxCompetence(prisma, tenantId, tax.invoice.competenceYear, tax.invoice.competenceMonth);
    }

    if (
      tax.kind !==
      "PAYABLE_BY_COMPANY"
    ) {
      throw new Error(
        "Somente impostos a recolher pela operação podem ser separados ou pagos."
      );
    }

    if (
      tax.status ===
      "CANCELLED"
    ) {
      throw new Error(
        "Este imposto está cancelado."
      );
    }

    let nextStatus:
      FinancialTaxStatus;

    let data:
      {
        status:
          FinancialTaxStatus;

        provisionedAt?:
          Date | null;

        separatedAt?:
          Date | null;

        paidAt?:
          Date | null;
      };

    if (
      action ===
      "SEPARATE"
    ) {
      nextStatus =
        "SEPARATED";

      data = {
        status:
          nextStatus,

        provisionedAt:
          tax.provisionedAt ||
          date,

        separatedAt:
          date,
      };
    } else if (
      action ===
      "PAY"
    ) {
      nextStatus =
        "PAID";

      data = {
        status:
          nextStatus,

        provisionedAt:
          tax.provisionedAt ||
          date,

        separatedAt:
          tax.separatedAt ||
          date,

        paidAt:
          date,
      };
    } else {
      throw new Error(
        "Ação inválida."
      );
    }

    const updated =
      await prisma.$transaction(
        async (tx) => {
          const taxUpdated =
            await tx.financialTaxEntry.update({
              where: {
                id:
                  tax.id,
              },

              data,
            });

          const stageIds = invoiceStageIds(tax.invoice);
          const stages = [];
          for (const stageId of stageIds) {
            stages.push(await refreshFinancialStageStatus(tx, { stageId, tenantId }));
          }
          const stage = stages[0] ?? null;

          return {
            tax:
              taxUpdated,

            stage,
          };
        },
        {
          maxWait:
            10000,

          timeout:
            20000,
        }
      );

    return Response.json({
      ok: true,
      ...updated,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          errorMessage(
            error
          ),
      },
      {
        status: 400,
      }
    );
  }
}
