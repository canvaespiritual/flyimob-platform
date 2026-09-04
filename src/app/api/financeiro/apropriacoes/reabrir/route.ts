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

    const stageId =
      requiredString(
        body.stageId,
        "Etapa"
      );

    const result =
      await prisma.$transaction(
        async (tx) => {
          const stage =
            await tx.financialStage.findFirst({
              where: {
                id:
                  stageId,

                tenantId,
              },

              select: {
                id: true,
              },
            });

          if (!stage) {
            throw new Error(
              "Etapa não encontrada."
            );
          }

          const activeAllocations =
            await tx.financialCompanyAllocation.findMany({
              where: {
                tenantId,

                stageId,

                status:
                  "APPROPRIATED",
              },

              select: {
                id: true,

                amount:
                  true,
              },
            });

          if (
            activeAllocations.length ===
            0
          ) {
            throw new Error(
              "Não existe apropriação ativa para reabrir nesta etapa."
            );
          }

          const cancelled =
            await tx.financialCompanyAllocation.updateMany({
              where: {
                tenantId,

                stageId,

                status:
                  "APPROPRIATED",
              },

              data: {
                status:
                  "CANCELLED",
              },
            });

          const status =
            await refreshFinancialStageStatus(
              tx,
              {
                stageId,
                tenantId,
              }
            );

          return {
            cancelledCount:
              cancelled.count,

            cancelledAllocationIds:
              activeAllocations.map(
                (
                  allocation
                ) =>
                  allocation.id
              ),

            status,
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
      ...result,
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
