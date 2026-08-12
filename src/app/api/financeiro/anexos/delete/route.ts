import {
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";

import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  s3,
  S3_BUCKET,
} from "@/lib/s3";

export const runtime =
  "nodejs";

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
    const tenantId =
      auth.session.tenant.id;

    const body =
      await req.json();

    const id =
      String(
        body.id ||
          ""
      ).trim();

    if (!id) {
      return Response.json(
        {
          error:
            "Anexo não informado.",
        },
        {
          status: 400,
        }
      );
    }

    const attachment =
      await prisma.financialAttachment.findFirst({
        where: {
          id,
          tenantId,
        },
      });

    if (
      !attachment
    ) {
      return Response.json(
        {
          error:
            "Anexo não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      attachment.storageKey
    ) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket:
            S3_BUCKET,

          Key:
            attachment.storageKey,
        })
      );
    }

    await prisma.financialAttachment.delete({
      where: {
        id:
          attachment.id,
      },
    });

    return Response.json({
      ok: true,
    });
  } catch (
    error
  ) {
    console.error(
      "financial attachment delete",
      error
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao excluir anexo.",
      },
      {
        status: 400,
      }
    );
  }
}