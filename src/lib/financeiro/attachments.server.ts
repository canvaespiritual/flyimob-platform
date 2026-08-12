import {
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  FinancialAttachmentEntityType,
  FinancialAttachmentType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  s3,
  S3_BUCKET,
  S3_REGION,
} from "@/lib/s3";

function publicUrl(key: string) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

function safeName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function keyFromPublicUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

type UploadFinancialAttachmentInput = {
  tenantId: string;
  entityType: FinancialAttachmentEntityType;
  entityId: string;
  type: FinancialAttachmentType;

  file: File;

  title?: string | null;
  uploadedById?: string | null;
};

export async function uploadFinancialAttachment(
  input: UploadFinancialAttachmentInput
) {
  const maxBytes = 30 * 1024 * 1024;

  const buffer = Buffer.from(
    await input.file.arrayBuffer()
  );

  if (buffer.length > maxBytes) {
    throw new Error(
      "O arquivo ultrapassa o limite de 30 MB."
    );
  }

  const originalName =
    input.file.name || "arquivo";

  const safeOriginalName =
    safeName(originalName);

  const key = [
    "public",
    "financeiro",
    input.tenantId,
    input.entityType.toLowerCase(),
    input.entityId,
    `${Date.now()}-${safeOriginalName}`,
  ].join("/");

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType:
        input.file.type ||
        "application/octet-stream",
      CacheControl:
        "public, max-age=31536000, immutable",
    })
  );

  const attachment =
    await prisma.financialAttachment.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        type: input.type,

        title: input.title?.trim() || null,

        originalName,
        url: publicUrl(key),
        storageKey: key,

        mimeType:
          input.file.type || null,

        sizeBytes: buffer.length,

        uploadedById:
          input.uploadedById ?? null,
      },
    });

  return attachment;
}

export async function deleteFinancialAttachment(params: {
  tenantId: string;
  attachmentId: string;
}) {
  const attachment =
    await prisma.financialAttachment.findFirst({
      where: {
        id: params.attachmentId,
        tenantId: params.tenantId,
      },
    });

  if (!attachment) {
    throw new Error(
      "Comprovante não encontrado."
    );
  }

  const key =
    attachment.storageKey ||
    keyFromPublicUrl(attachment.url);

  if (key) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
    } catch (error) {
      console.error(
        "[financeiro:attachment:s3-delete]",
        error
      );
    }
  }

  await prisma.financialAttachment.delete({
    where: {
      id: attachment.id,
    },
  });

  return {
    ok: true,
  };
}