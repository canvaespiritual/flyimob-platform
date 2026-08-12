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

    const id =
      requiredString(
        body.id,
        "Participante"
      );

    const existing =
      await prisma.financialParticipant.findFirst({
        where: {
          id,
          tenantId,
        },
      });

    if (!existing) {
      return Response.json(
        {
          error:
            "Participante não encontrado.",
        },
        { status: 404 }
      );
    }

    const userId =
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

      const conflict =
        await prisma.financialParticipant.findFirst({
          where: {
            tenantId,
            userId,
            id: {
              not: id,
            },
          },

          select: {
            id: true,
          },
        });

      if (conflict) {
        return Response.json(
          {
            error:
              "Este usuário já está vinculado a outro participante.",
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
      await prisma.financialParticipant.update({
        where: {
          id,
        },

        data: {
          userId,

          name:
            requiredString(
              body.name,
              "Nome"
            ),

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
      entityId: id,
      action: "UPDATE",
      userId:
        auth.session.user.id,
      beforeData: existing,
      afterData: participant,
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