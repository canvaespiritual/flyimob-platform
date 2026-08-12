import {
  FinancialStageType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  errorMessage,
  optionalDecimal,
  optionalString,
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

    const id =
      requiredString(
        body.id,
        "Etapa"
      );

    const existing =
      await prisma.financialStage.findFirst({
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
            "Etapa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const type =
      requiredString(
        body.type,
        "Tipo"
      ) as FinancialStageType;

    const stage =
      await prisma.financialStage.update({
        where: {
          id,
        },

        data: {
          type,

          label:
            optionalString(
              body.label
            ),

          commissionSharePercent:
            optionalDecimal(
              body.commissionSharePercent
            ),

          expectedGrossAmount:
            optionalDecimal(
              body.expectedGrossAmount
            ),

          notes:
            optionalString(
              body.notes
            ),
        },
      });

    return Response.json({
      ok: true,
      stage,
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