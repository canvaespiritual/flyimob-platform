import {
  FinancialCalculationBasis,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  ensurePercentage,
  errorMessage,
  optionalDecimal,
  optionalString,
  requiredString,
} from "@/lib/financeiro/validators";

import {
  writeFinancialAudit,
} from "@/lib/financeiro/audit.server";

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

    const name =
      requiredString(
        body.name,
        "Nome"
      );

    let userId =
      optionalString(body.userId);

    if (userId) {
      const user =
        await prisma.user.findFirst({
          where: {
            id: userId,
            tenantId,
          },

          select: {
            id: true,
          },
        });

      if (!user) {
        return Response.json(
          {
            error:
              "Usuário não pertence a esta operação.",
          },
          { status: 400 }
        );
      }

      const alreadyLinked =
        await prisma.financialParticipant.findFirst(
          {
            where: {
              tenantId,
              userId,
            },

            select: {
              id: true,
            },
          }
        );

      if (alreadyLinked) {
        return Response.json(
          {
            error:
              "Este usuário já possui participante financeiro.",
          },
          { status: 409 }
        );
      }
    }

    const basis =
      optionalString(
        body.defaultCalculationBasis
      ) as FinancialCalculationBasis | null;

    const allowedBasis:
      FinancialCalculationBasis[] = [
        "COMMISSION_GROSS",
        "COMMISSION_NET_AFTER_WITHHOLDING",
        "COMMISSION_NET_AFTER_ALL_TAXES",
        "VGV",
        "FIXED",
        "MANUAL",
      ];

    if (
      basis &&
      !allowedBasis.includes(basis)
    ) {
      return Response.json(
        {
          error:
            "Regra de comissão inválida.",
        },
        { status: 400 }
      );
    }

    const percentage =
      ensurePercentage(
        optionalDecimal(
          body.defaultPercentage
        )
      );

    const participant =
      await prisma.financialParticipant.create({
        data: {
          tenantId,
          userId,

          name,

          cpfCnpj:
            optionalString(
              body.cpfCnpj
            ),

          email:
            optionalString(
              body.email
            ),

          phone:
            optionalString(
              body.phone
            ),

          defaultCalculationBasis:
            basis,

          defaultPercentage:
            percentage,

          active:
            body.active !== false,

          notes:
            optionalString(
              body.notes
            ),
        },
      });

    void writeFinancialAudit({
      tenantId,
      entityType:
        "FinancialParticipant",
      entityId:
        participant.id,
      action: "CREATE",
      userId:
        auth.session.user.id,
      afterData:
        participant,
    });

    return Response.json({
      ok: true,
      participant,
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

