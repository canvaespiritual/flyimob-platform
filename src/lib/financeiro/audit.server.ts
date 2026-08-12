import {
  FinancialAuditAction,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditInput = {
  tenantId: string;

  entityType: string;
  entityId: string;

  action: FinancialAuditAction;

  userId?: string | null;

  beforeData?: unknown;
  afterData?: unknown;

  note?: string | null;
};

function safeJson(
  value: unknown
): Prisma.InputJsonValue | undefined {
  if (value == null) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (
        item &&
        typeof item === "object" &&
        typeof item.toJSON === "function"
      ) {
        return item.toJSON();
      }

      return item;
    })
  ) as Prisma.InputJsonValue;
}

export async function writeFinancialAudit(
  input: AuditInput
) {
  try {
    await prisma.financialAuditLog.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        userId: input.userId ?? null,
        beforeData: safeJson(input.beforeData),
        afterData: safeJson(input.afterData),
        note: input.note ?? null,
      },
    });
  } catch (error) {
    // Auditoria não deve derrubar a operação financeira
    // principal neste primeiro estágio do módulo.
    console.error(
      "[financeiro:audit]",
      error
    );
  }
}