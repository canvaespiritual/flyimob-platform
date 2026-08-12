import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  errorMessage,
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

    const participantId =
      requiredString(
        body.participantId,
        "Participante"
      );

    const participant =
      await prisma.financialParticipant.findFirst({
        where: {
          id: participantId,
          tenantId,
        },

        select: {
          id: true,
        },
      });

    if (!participant) {
      return Response.json(
        {
          error:
            "Participante não encontrado.",
        },
        { status: 404 }
      );
    }

    const preferred =
      body.preferred === true;

    if (preferred) {
  await prisma.financialParticipantAccount.updateMany({
    where: {
      participantId,
    },
    data: {
      preferred: false,
    },
  });
}

const account =
  await prisma.financialParticipantAccount.create({
    data: {
      participantId,

      pixType:
        optionalString(body.pixType),

      pixKey:
        optionalString(body.pixKey),

      bankName:
        optionalString(body.bankName),

      agency:
        optionalString(body.agency),

      account:
        optionalString(body.account),

      accountType:
        optionalString(body.accountType),

      holderName:
        optionalString(body.holderName),

      holderCpfCnpj:
        optionalString(body.holderCpfCnpj),

      preferred,

      active:
        body.active !== false,

      notes:
        optionalString(body.notes),
    },
  });

    void writeFinancialAudit({
      tenantId,
      entityType:
        "FinancialParticipantAccount",
      entityId:
        account.id,
      action: "CREATE",
      userId:
        auth.session.user.id,
      afterData:
        account,
    });

    return Response.json({
      ok: true,
      account,
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