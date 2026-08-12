import {
  FinancialAttachmentEntityType,
  FinancialAttachmentType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

export async function GET(
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
    const tenantId =
      auth.session.tenant.id;

    const url =
      new URL(req.url);

    const entityType =
      String(
        url.searchParams.get(
          "entityType"
        ) || ""
      ) as FinancialAttachmentEntityType;

    const entityId =
      String(
        url.searchParams.get(
          "entityId"
        ) || ""
      ).trim();

    const type =
      String(
        url.searchParams.get(
          "type"
        ) || ""
      ).trim() as FinancialAttachmentType;

    if (
      !entityType ||
      !entityId
    ) {
      return Response.json(
        {
          error:
            "Entidade do anexo não informada.",
        },
        {
          status: 400,
        }
      );
    }

    const attachments =
      await prisma.financialAttachment.findMany({
        where: {
          tenantId,

          entityType,

          entityId,

          ...(type
            ? {
                type,
              }
            : {}),
        },

        orderBy: {
          createdAt:
            "asc",
        },

        select: {
          id: true,

          type: true,

          title: true,

          originalName:
            true,

          url: true,

          mimeType:
            true,

          sizeBytes:
            true,

          createdAt:
            true,
        },
      });

    return Response.json({
      ok: true,

      attachments:
        attachments.map(
          (
            attachment
          ) => ({
            ...attachment,

            createdAt:
              attachment.createdAt.toISOString(),
          })
        ),
    });
  } catch (
    error
  ) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar anexos.",
      },
      {
        status: 400,
      }
    );
  }
}