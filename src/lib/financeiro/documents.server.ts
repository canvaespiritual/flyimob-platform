import {
  FinancialDocumentType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

function documentPrefix(
  type: FinancialDocumentType
) {
  switch (type) {
    case "PARTICIPANT_STATEMENT":
      return "DEM";

    case "PAYMENT_RECEIPT":
      return "REC";

    case "TAX_CLOSING":
      return "FIS";

    default:
      return "DOC";
  }
}

export async function nextFinancialDocumentNumber(
  tenantId: string,
  type: FinancialDocumentType
) {
  const year = new Date().getFullYear();
  const prefix = documentPrefix(type);

  const startsWith =
    `${prefix}-${year}-`;

  const last =
    await prisma.financialDocument.findFirst({
      where: {
        tenantId,
        type,
        number: {
          startsWith,
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      select: {
        number: true,
      },
    });

  let sequence = 1;

  if (last?.number) {
    const parts =
      last.number.split("-");

    const lastSequence =
      Number(parts.at(-1));

    if (
      Number.isInteger(lastSequence) &&
      lastSequence > 0
    ) {
      sequence =
        lastSequence + 1;
    }
  }

  return `${prefix}-${year}-${String(
    sequence
  ).padStart(5, "0")}`;
}

type CreateFinancialDocumentInput = {
  tenantId: string;

  type: FinancialDocumentType;

  participantId?: string | null;
  settlementId?: string | null;

  title?: string | null;

  config?: Prisma.InputJsonValue;

  referenceType?: string | null;
  referenceId?: string | null;

  generatedById?: string | null;
};

export async function createFinancialDocumentRecord(
  input: CreateFinancialDocumentInput
) {
  const number =
    await nextFinancialDocumentNumber(
      input.tenantId,
      input.type
    );

  return prisma.financialDocument.create({
    data: {
      tenantId: input.tenantId,

      type: input.type,
      number,

      participantId:
        input.participantId ?? null,

      settlementId:
        input.settlementId ?? null,

      title:
        input.title ?? null,

      config:
        input.config,

      referenceType:
        input.referenceType ?? null,

      referenceId:
        input.referenceId ?? null,

      generatedById:
        input.generatedById ?? null,
    },
  });
}

export async function attachGeneratedFileToDocument(
  params: {
    tenantId: string;
    documentId: string;

    url: string;
    storageKey?: string | null;
    originalName?: string | null;
  }
) {
  const document =
    await prisma.financialDocument.findFirst({
      where: {
        id: params.documentId,
        tenantId: params.tenantId,
      },

      select: {
        id: true,
      },
    });

  if (!document) {
    throw new Error(
      "Documento financeiro não encontrado."
    );
  }

  return prisma.financialDocument.update({
    where: {
      id: document.id,
    },

    data: {
      url: params.url,
      storageKey:
        params.storageKey ?? null,
      originalName:
        params.originalName ?? null,
    },
  });
}