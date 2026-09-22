import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stageInvoiceEconomics, stageInvoiceEconomicsInclude } from "./invoice-economics.server";

type Db = Prisma.TransactionClient | typeof prisma;

export function validateGroupedInvoiceAmounts(grossAmount: Prisma.Decimal,
  allocations: Array<{ stageId: string; amount: Prisma.Decimal }>) {
  if (allocations.length === 0 || allocations.length > 100) throw new Error("Selecione de 1 a 100 etapas.");
  if (allocations.some((item) => !item.stageId) || new Set(allocations.map((item) => item.stageId)).size !== allocations.length) {
    throw new Error("Etapas duplicadas ou inválidas.");
  }
  if (allocations.some((item) => !item.amount.gt(0))) throw new Error("Parcela inválida.");
  if (!allocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)).eq(grossAmount)) {
    throw new Error("A soma das alocações deve ser igual ao bruto da NF.");
  }
}

export function validateGroupedInvoiceStages(tenantId: string, construtoraId: string,
  requested: Array<{ stageId: string; amount: Prisma.Decimal }>,
  entries: Array<{ stage: { id: string; tenantId: string; expectedGrossAmount: Prisma.Decimal | null;
    sale: { tenantId: string; construtoraId: string | null };
    receipts?: Array<{ invoiceId: string | null; status: string }> }; economics: { billableBalance: Prisma.Decimal } }>) {
  if (entries.length !== requested.length) throw new Error("Etapa indisponível ou de outro tenant.");
  const byId = new Map(entries.map((entry) => [entry.stage.id, entry]));
  for (const item of requested) {
    const entry = byId.get(item.stageId);
    if (!entry || entry.stage.tenantId !== tenantId || entry.stage.sale.tenantId !== tenantId) {
      throw new Error("Etapa indisponível ou de outro tenant.");
    }
    if (entry.stage.sale.construtoraId !== construtoraId) throw new Error("Todas as etapas devem pertencer à mesma construtora estrutural.");
    if (entry.stage.receipts?.some((receipt) => receipt.status === "CONFIRMED" && !receipt.invoiceId)) {
      throw new Error("Etapa com recebimento antigo sem NF vinculada exige conciliação antes do faturamento agrupado.");
    }
    if (!entry.stage.expectedGrossAmount || item.amount.gt(entry.economics.billableBalance)) throw new Error("Parcela acima do saldo faturável da etapa.");
  }
}

export async function assertOpenTaxCompetence(db: Db, tenantId: string, year: number, month: number) {
  const closing = await db.financialTaxClosing.findFirst({
    where: { tenantId, competenceYear: year, competenceMonth: month }, select: { status: true },
  });
  if (closing && closing.status !== "OPEN" && closing.status !== "CANCELLED") {
    throw new Error("Competência fiscal fechada: alteração da NF/impostos recusada.");
  }
}

export async function billableStages(db: Db, tenantId: string, ids?: string[]) {
  const stages = await db.financialStage.findMany({
    where: { tenantId, ...(ids ? { id: { in: ids } } : {}), status: { not: "CANCELLED" },
      sale: { tenantId, status: { not: "CANCELLED" }, construtoraId: { not: null }, construtora: { tenantId } } },
    include: { ...stageInvoiceEconomicsInclude, sale: { include: { construtora: true, empreendimento: true } } },
    orderBy: [{ saleId: "asc" }, { sequence: "asc" }],
  });
  return stages.map((stage) => ({ stage, economics: stageInvoiceEconomics(stage) }));
}

export async function createGroupedInvoice(input: {
  tenantId: string; userId: string; construtoraId: string; number: string | null;
  issuedAt: Date; competenceYear: number; competenceMonth: number;
  grossAmount: Prisma.Decimal; notes: string | null;
  allocations: Array<{ stageId: string; amount: Prisma.Decimal }>;
}) {
  if (!input.construtoraId) throw new Error("Construtora obrigatória.");
  validateGroupedInvoiceAmounts(input.grossAmount, input.allocations);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertOpenTaxCompetence(tx, input.tenantId, input.competenceYear, input.competenceMonth);
        const builder = await tx.construtora.findFirst({ where: { id: input.construtoraId, tenantId: input.tenantId }, select: { id: true } });
        if (!builder) throw new Error("Construtora inválida.");
        const entries = await billableStages(tx, input.tenantId, input.allocations.map((item) => item.stageId));
        validateGroupedInvoiceStages(input.tenantId, input.construtoraId, input.allocations, entries);
        const invoice = await tx.financialInvoice.create({ data: {
          tenantId: input.tenantId, stageId: null, construtoraId: input.construtoraId,
          number: input.number, issuedAt: input.issuedAt, competenceYear: input.competenceYear,
          competenceMonth: input.competenceMonth, grossAmount: input.grossAmount, notes: input.notes,
          status: "ISSUED", allocations: { create: input.allocations.map((item) => ({
            tenantId: input.tenantId, stageId: item.stageId, amount: item.amount,
          })) },
        } });
        await tx.financialStage.updateMany({ where: { tenantId: input.tenantId, id: { in: input.allocations.map((item) => item.stageId) }, status: "EXPECTED" },
          data: { status: "AWAITING_RECEIPT" } });
        await tx.financialAuditLog.create({ data: { tenantId: input.tenantId, entityType: "INVOICE",
          entityId: invoice.id, action: "CREATE", userId: input.userId,
          afterData: { grouped: true, construtoraId: input.construtoraId, grossAmount: input.grossAmount.toString(),
            competenceYear: input.competenceYear, competenceMonth: input.competenceMonth,
            issuedAt: input.issuedAt.toISOString(), allocations: input.allocations.map((item) => ({ stageId: item.stageId, amount: item.amount.toString() })) } } });
        return invoice.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Conflito ao faturar etapas. Tente novamente.");
}
