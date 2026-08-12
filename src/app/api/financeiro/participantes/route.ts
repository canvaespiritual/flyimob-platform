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
      { error: auth.error },
      { status: auth.status }
    );
  }

  const participants =
    await prisma.financialParticipant.findMany({
      where: {
        tenantId:
          auth.session.tenant.id,

        active: true,
      },

      orderBy: {
        name: "asc",
      },

      include: {
        accounts: {
          where: {
            active: true,
          },

          orderBy: [
            {
              preferred: "desc",
            },
            {
              createdAt: "desc",
            },
          ],
        },
      },
    });

  return Response.json({
    participants:
      serializeFinancial(
        participants
      ),
  });
}