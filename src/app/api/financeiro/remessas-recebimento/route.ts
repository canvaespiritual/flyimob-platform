import { Prisma } from "@prisma/client";
import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import { stageInvoiceEconomics, stageInvoiceEconomicsInclude } from "@/lib/financeiro/invoice-economics.server";
import { availableGroupedAllocations, availableIndividualInvoices, parsePositiveMoney, receiptRemittanceTotal } from "@/lib/financeiro/receipt-remittances.server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const auth = await getFinanceApiSession();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const tenantId = auth.session.tenant.id;
    const body = await req.json();
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) throw new Error("Selecione de 1 a 100 parcelas.");
    const items: { invoiceId: string; stageId: string | null; amount: Prisma.Decimal }[] = body.items.map((item: { invoiceId?: unknown; stageId?: unknown; amount?: unknown }) => ({
      invoiceId: String(item.invoiceId ?? "").trim(), stageId: item.stageId ? String(item.stageId).trim() : null,
      amount: parsePositiveMoney(item.amount, "Parcela"),
    }));
    const keys = items.map((item) => `${item.invoiceId}:${item.stageId ?? "individual"}`);
    if (items.some((item) => !item.invoiceId) || new Set(keys).size !== keys.length) throw new Error("Parcelas duplicadas ou inválidas.");
    const amount = parsePositiveMoney(body.amount, "Valor recebido");
    if (!receiptRemittanceTotal(items.map((item) => item.amount)).eq(amount)) throw new Error("A soma das parcelas deve ser exatamente igual ao PIX.");
    const accountId = String(body.financialAccountId ?? "").trim();
    const receivedAt = new Date(String(body.receivedAt ?? ""));
    if (!accountId || Number.isNaN(receivedAt.getTime())) throw new Error("Conta e data recebida são obrigatórias.");
    const reference = String(body.reference ?? "").trim().slice(0, 300) || null;
    const notes = String(body.notes ?? "").trim().slice(0, 2000) || null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const id = await prisma.$transaction(async (tx) => {
          const account = await tx.financialAccount.findFirst({ where: { id: accountId, tenantId, active: true } });
          if (!account) throw new Error("Conta financeira inválida.");
          const individual = await availableIndividualInvoices(tx, tenantId, items.filter((item) => !item.stageId).map((item) => item.invoiceId));
          const grouped = await availableGroupedAllocations(tx, tenantId, items.filter((item) => !!item.stageId).map((item) => ({ invoiceId: item.invoiceId, stageId: item.stageId! })));
          const byKey = new Map<string, { stageId: string; construtoraId: string; balance: Prisma.Decimal; invoiceNumber: string | null }>();
          for (const entry of individual) byKey.set(`${entry.invoice.id}:individual`, {
            stageId: entry.invoice.stageId, construtoraId: entry.invoice.stage.sale.construtoraId!,
            balance: entry.balance, invoiceNumber: entry.invoice.number,
          });
          for (const entry of grouped) byKey.set(`${entry.invoice.id}:${entry.allocation.stageId}`, {
            stageId: entry.allocation.stageId, construtoraId: entry.invoice.construtoraId!,
            balance: entry.balance, invoiceNumber: entry.invoice.number,
          });
          const selected = items.map((item) => {
            const entry = byKey.get(`${item.invoiceId}:${item.stageId ?? "individual"}`);
            if (!entry) throw new Error("NF/parcela indisponível ou com recebimento antigo sem vínculo explícito.");
            if (item.amount.gt(entry.balance)) throw new Error(`Parcela acima do saldo da NF ${entry.invoiceNumber ?? item.invoiceId}.`);
            return { ...item, entry };
          });
          const construtoraId = selected[0].entry.construtoraId;
          if (!construtoraId || selected.some((item) => item.entry.construtoraId !== construtoraId)) throw new Error("Todas as parcelas devem pertencer à mesma construtora cadastrada.");
          const expected = selected.reduce((total, item) => total.plus(item.entry.balance), new Prisma.Decimal(0));
          const remittance = await tx.financialReceiptRemittance.create({ data: {
            tenantId, construtoraId, financialAccountId: accountId, amount, expectedAmount: expected,
            receivedAt, reference, notes, status: "CONFIRMED", createdById: auth.session.user.id,
          } });
          for (const item of selected) await tx.financialReceipt.create({ data: {
            tenantId, remittanceId: remittance.id, stageId: item.entry.stageId, invoiceId: item.invoiceId,
            amount: item.amount, receivedAt, status: "CONFIRMED",
          } });
          for (const stageId of new Set(selected.map((item) => item.entry.stageId))) {
            const stage = await tx.financialStage.findFirst({ where: { id: stageId, tenantId }, include: stageInvoiceEconomicsInclude });
            if (!stage) throw new Error("Etapa indisponível.");
            const economics = stageInvoiceEconomics(stage);
            const expectedStage = economics.gross.gt(0) ? Prisma.Decimal.max(0, economics.cashExpected) : new Prisma.Decimal(stage.expectedGrossAmount ?? 0);
            await tx.financialStage.update({ where: { id: stageId }, data: {
              status: expectedStage.gt(0) && economics.received.lt(expectedStage) ? "PARTIALLY_RECEIVED" : "RECEIVED",
            } });
          }
          await tx.financialAuditLog.create({ data: { tenantId, entityType: "RECEIPT_REMITTANCE",
            entityId: remittance.id, action: "CREATE", userId: auth.session.user.id,
            afterData: { amount: amount.toString(), construtoraId, financialAccountId: accountId,
              receivedAt: receivedAt.toISOString(), reference, items: selected.map((item) => ({
                invoiceId: item.invoiceId, stageId: item.entry.stageId, amount: item.amount.toString(),
              })) } } });
          return remittance.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
        return Response.json({ ok: true, id });
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
