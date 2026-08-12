import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  serializeFinancial,
} from "@/lib/financeiro/serializers";

export async function GET() {
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

  const sales =
    await prisma.financialSale.findMany({
      where: {
        tenantId:
          auth.session.tenant.id,
      },

      orderBy: {
        createdAt:
          "desc",
      },

      include: {
        construtora: true,
        empreendimento: true,

        stages: {
          orderBy: {
            sequence: "asc",
          },
        },
      },
    });

  return Response.json({
    sales:
      serializeFinancial(
        sales
      ),
  });
}