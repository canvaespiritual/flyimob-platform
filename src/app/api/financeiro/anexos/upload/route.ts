import {
  FinancialAttachmentEntityType,
  FinancialAttachmentType,
} from "@prisma/client";

import {
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import {
  getFinanceApiSession,
} from "@/lib/financeiro/access.server";

import {
  s3,
  S3_BUCKET,
  S3_REGION,
} from "@/lib/s3";

export const runtime =
  "nodejs";

function publicUrl(
  key: string
) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

function safeName(
  name: string
) {
  return name
    .toLowerCase()
    .replace(
      /[^a-z0-9._-]/g,
      "-"
    );
}

async function entityExists(
  tenantId: string,
  entityType: FinancialAttachmentEntityType,
  entityId: string
) {
  switch (
    entityType
  ) {
    case "PAYMENT":
      return Boolean(
        await prisma.financialPayment.findFirst({
          where: {
            id:
              entityId,
            tenantId,
          },

          select: {
            id: true,
          },
        })
      );

    case "ADJUSTMENT":
      return Boolean(
        await prisma.financialAdjustment.findFirst({
          where: {
            id:
              entityId,
            tenantId,
          },

          select: {
            id: true,
          },
        })
      );

    case "INVOICE":
      return Boolean(
        await prisma.financialInvoice.findFirst({
          where: {
            id:
              entityId,
            tenantId,
          },

          select: {
            id: true,
          },
        })
      );

    case "RECEIPT":
      return Boolean(
        await prisma.financialReceipt.findFirst({
          where: {
            id:
              entityId,
            tenantId,
          },

          select: {
            id: true,
          },
        })
      );

    case "TAX_ENTRY":
      return Boolean(
        await prisma.financialTaxEntry.findFirst({
          where: {
            id:
              entityId,
            tenantId,
          },

          select: {
            id: true,
          },
        })
      );

      case "TAX_CLOSING":
  return Boolean(
    await prisma.financialTaxClosing.findFirst({
      where: {
        id: entityId,
        tenantId,
      },

      select: {
        id: true,
      },
    })
  );

case "TAX_MOVEMENT":
  return Boolean(
    await prisma.financialTaxMovement.findFirst({
      where: {
        id: entityId,
        tenantId,
      },

      select: {
        id: true,
      },
    })
  );

    default:
      return false;
  }
}

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

    const form =
      await req.formData();

    const entityType =
      String(
        form.get(
          "entityType"
        ) || ""
      ) as FinancialAttachmentEntityType;

    const entityId =
      String(
        form.get(
          "entityId"
        ) || ""
      ).trim();

    const type =
      String(
        form.get(
          "type"
        ) || ""
      ) as FinancialAttachmentType;

    const title =
      String(
        form.get(
          "title"
        ) || ""
      ).trim();

    const file =
      form.get(
        "file"
      ) as File | null;

    const allowedEntities:
  FinancialAttachmentEntityType[] =
  [
    "PAYMENT",
    "ADJUSTMENT",
    "INVOICE",
    "RECEIPT",
    "TAX_ENTRY",
    "TAX_CLOSING",
    "TAX_MOVEMENT",
  ];

    const allowedTypes:
      FinancialAttachmentType[] =
      [
        "INVOICE",
        "BUILDER_RECEIPT",
        "PARTICIPANT_PAYMENT",
        "ADVANCE",
        "TAX_DOCUMENT",
        "TAX_PAYMENT",
        "OTHER",
      ];

    if (
      !entityId ||
      !file ||
      !allowedEntities.includes(
        entityType
      ) ||
      !allowedTypes.includes(
        type
      )
    ) {
      return Response.json(
        {
          error:
            "Dados do anexo inválidos.",
        },
        {
          status: 400,
        }
      );
    }

    const exists =
      await entityExists(
        tenantId,
        entityType,
        entityId
      );

    if (!exists) {
      return Response.json(
        {
          error:
            "Registro financeiro não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const maxBytes =
      30 *
      1024 *
      1024;

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    if (
      buffer.length >
      maxBytes
    ) {
      return Response.json(
        {
          error:
            "Arquivo maior que 30 MB.",
        },
        {
          status: 400,
        }
      );
    }

    const allowedMime =
      [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

    if (
      file.type &&
      !allowedMime.includes(
        file.type
      )
    ) {
      return Response.json(
        {
          error:
            "Formato não permitido. Use PDF, JPG, PNG ou WEBP.",
        },
        {
          status: 400,
        }
      );
    }

    const key =
      [
        "public",
        "financeiro",
        tenantId,
        entityType.toLowerCase(),
        entityId,
        `${Date.now()}-${safeName(
          file.name ||
            "anexo"
        )}`,
      ].join(
        "/"
      );

    await s3.send(
      new PutObjectCommand({
        Bucket:
          S3_BUCKET,

        Key:
          key,

        Body:
          buffer,

        ContentType:
          file.type ||
          "application/octet-stream",

        CacheControl:
          "public, max-age=31536000, immutable",
      })
    );

    const attachment =
      await prisma.financialAttachment.create({
        data: {
          tenantId,

          entityType,

          entityId,

          type,

          title:
            title ||
            null,

          originalName:
            file.name ||
            "anexo",

          url:
            publicUrl(
              key
            ),

          storageKey:
            key,

          mimeType:
            file.type ||
            null,

          sizeBytes:
            buffer.length,

          uploadedById:
            sessionUserId(
              auth.session
            ),
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
      attachment,
    });
  } catch (
    error
  ) {
    console.error(
      "financial attachment upload",
      error
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao enviar arquivo.",
      },
      {
        status: 400,
      }
    );
  }
}

/*
 * A estrutura da sessão já mudou algumas vezes no projeto.
 * Centralizamos aqui para não quebrar o upload caso
 * uploadedById não esteja disponível.
 */
function sessionUserId(
  session: unknown
): string | null {
  if (
    !session ||
    typeof session !==
      "object"
  ) {
    return null;
  }

  const record =
    session as Record<
      string,
      unknown
    >;

  if (
    typeof record.userId ===
    "string"
  ) {
    return record.userId;
  }

  const user =
    record.user;

  if (
    user &&
    typeof user ===
      "object"
  ) {
    const id =
      (
        user as Record<
          string,
          unknown
        >
      ).id;

    if (
      typeof id ===
      "string"
    ) {
      return id;
    }
  }

  return null;
}