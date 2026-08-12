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

    const id =
      requiredString(
        body.id,
        "Conta"
      );

    const existing =
      await prisma.financialParticipantAccount.findFirst({
        where: {
          id,

          participant: {
            tenantId,
          },
        },
      });

    if (!existing) {
      return Response.json(
        {
          error:
            "Dados bancários não encontrados.",
        },
        { status: 404 }
      );
    }

    const preferred =
      body.preferred === true;

    if (preferred) {
  await prisma.financialParticipantAccount.updateMany({
    where: {
      participantId:
        existing.participantId,

      id: {
        not: id,
      },
    },

    data: {
      preferred: false,
    },
  });
}

const account =
  await prisma.financialParticipantAccount.update({
    where: {
      id,
    },

    data: {
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
      action: "UPDATE",
      userId:
        auth.session.user.id,
      beforeData:
        existing,
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