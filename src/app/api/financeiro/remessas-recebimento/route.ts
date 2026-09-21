import { Prisma } from "@prisma/client";
import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import { availableIndividualInvoices, parsePositiveMoney, receiptRemittanceTotal } from "@/lib/financeiro/receipt-remittances.server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const auth = await getFinanceApiSession();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const tenantId = auth.session.tenant.id;
    const body = await req.json();
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      throw new Error("Selecione de 1 a 100 notas.");
    }
    const items: { invoiceId: string; amount: Prisma.Decimal }[] = body.items.map((item: { invoiceId?: unknown; amount?: unknown }) => ({
      invoiceId: String(item.invoiceId ?? "").trim(),
      amount: parsePositiveMoney(item.amount, "Parcela"),
    }));
    if (items.some((item) => !item.invoiceId) || new Set(items.map((item) => item.invoiceId)).size !== items.length) {
      throw new Error("Notas duplicadas ou inválidas.");
    }
    const amount = parsePositiveMoney(body.amount, "Valor recebido");
    const sum = receiptRemittanceTotal(items.map((item) => item.amount));
    if (!sum.eq(amount)) throw new Error("A soma das parcelas deve ser exatamente igual ao PIX.");
    const accountId = String(body.financialAccountId ?? "").trim();
    const receivedAt = new Date(String(body.receivedAt ?? ""));
    if (!accountId || Number.isNaN(receivedAt.getTime())) throw new Error("Conta e data recebida são obrigatórias.");
    const reference = String(body.reference ?? "").trim().slice(0, 300) || null;
    const notes = String(body.notes ?? "").trim().slice(0, 2000) || null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const account = await tx.financialAccount.findFirst({ where: { id: accountId, tenantId, active: true } });
          if (!account) throw new Error("Conta financeira inválida.");
          const available = await availableIndividualInvoices(tx, tenantId, items.map((item) => item.invoiceId));
          const byId = new Map(available.map((entry) => [entry.invoice.id, entry]));
          const selected = items.map((item) => {
            const entry = byId.get(item.invoiceId);
            if (!entry) throw new Error("Nota indisponível ou com recebimento antigo sem vínculo explícito.");
            if (item.amount.gt(entry.balance)) throw new Error(`Parcela acima do saldo da NF ${entry.invoice.number ?? entry.invoice.id}.`);
            return { ...item, entry };
          });
          const construtoraId = selected[0].entry.invoice.stage.sale.construtoraId;
          if (!construtoraId || selected.some((item) => item.entry.invoice.stage.sale.construtoraId !== construtoraId)) {
            throw new Error("Todas as notas devem pertencer à mesma construtora cadastrada.");
          }
          const expected = selected.reduce((total, item) => total.plus(item.entry.balance), new Prisma.Decimal(0));
          const remittance = await tx.financialReceiptRemittance.create({
            data: { tenantId, construtoraId, financialAccountId: accountId, amount,
              expectedAmount: expected, receivedAt, reference, notes,
              status: "CONFIRMED", createdById: auth.session.user.id },
          });
          for (const item of selected) {
            await tx.financialReceipt.create({
              data: { tenantId, remittanceId: remittance.id,
                stageId: item.entry.invoice.stageId, invoiceId: item.invoiceId,
                amount: item.amount, receivedAt, status: "CONFIRMED" },
            });
          }
          for (const stageId of new Set(selected.map((item) => item.entry.invoice.stageId))) {
            const stage = await tx.financialStage.findFirst({
              where: { id: stageId, tenantId },
              include: { invoices: { where: { status: "ISSUED" }, include: { taxEntries: { where: { status: { not: "CANCELLED" } } } } },
                receipts: { where: { status: "CONFIRMED" } } },
            });
            if (!stage) throw new Error("Etapa indisponível.");
            const gross = stage.invoices.reduce((total, invoice) => total.plus(invoice.grossAmount ?? 0), new Prisma.Decimal(0));
            const withheld = stage.invoices.flatMap((invoice) => invoice.taxEntries)
              .filter((tax) => tax.kind === "WITHHELD_AT_SOURCE")
              .reduce((total, tax) => total.plus(tax.amount ?? 0), new Prisma.Decimal(0));
            const expectedStage = gross.gt(0) ? Prisma.Decimal.max(0, gross.minus(withheld)) : new Prisma.Decimal(stage.expectedGrossAmount ?? 0);
            const received = stage.receipts.reduce((total, receipt) => total.plus(receipt.amount ?? 0), new Prisma.Decimal(0));
            await tx.financialStage.update({ where: { id: stageId }, data: {
              status: expectedStage.gt(0) && received.lt(expectedStage) ? "PARTIALLY_RECEIVED" : "RECEIVED",
            } });
          }
          await tx.financialAuditLog.create({ data: { tenantId, entityType: "RECEIPT_REMITTANCE",
            entityId: remittance.id, action: "CREATE", userId: auth.session.user.id,
            afterData: { amount: amount.toString(), construtoraId, financialAccountId: accountId,
              receivedAt: receivedAt.toISOString(), reference, items: selected.map((item) => ({
                invoiceId: item.invoiceId, stageId: item.entry.invoice.stageId, amount: item.amount.toString(),
              })) } } });
          return remittance.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
        return Response.json({ ok: true, id: result });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Não foi possível confirmar após novas tentativas.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar remessa." }, { status: 400 });
  }
}
