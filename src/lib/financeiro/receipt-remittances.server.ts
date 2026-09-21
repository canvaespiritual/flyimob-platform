import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export function receiptRemittanceTotal(amounts: Prisma.Decimal[]) {
  return amounts.reduce((sum, amount) => sum.plus(amount), new Prisma.Decimal(0));
}

export function invoiceCashBalance(gross: Prisma.Decimal, withheld: Prisma.Decimal[], received: Prisma.Decimal[]) {
  const expected = Prisma.Decimal.max(new Prisma.Decimal(0), gross.minus(receiptRemittanceTotal(withheld)));
  return { expected, balance: expected.minus(receiptRemittanceTotal(received)) };
}

export async function availableIndividualInvoices(db: Db, tenantId: string, invoiceIds?: string[]) {
  const invoices = await db.financialInvoice.findMany({
    where: {
      tenantId,
      ...(invoiceIds ? { id: { in: invoiceIds } } : {}),
      status: "ISSUED",
      stage: {
        tenantId,
        status: { not: "CANCELLED" },
        sale: { tenantId, status: { not: "CANCELLED" }, construtoraId: { not: null }, construtora: { tenantId } },
      },
    },
    include: {
      taxEntries: { where: { status: { not: "CANCELLED" } } },
      receipts: { where: { status: "CONFIRMED" } },
      stage: {
        include: {
          receipts: { where: { status: "CONFIRMED", invoiceId: null }, select: { id: true } },
          sale: { include: { construtora: true, empreendimento: true } },
        },
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  return invoices.flatMap((invoice) => {
    // An unlinked legacy receipt might already pay this invoice. Its allocation
    // cannot be established safely, so this invoice is unavailable here.
    if (invoice.stage.receipts.length || !invoice.stage.sale.construtoraId) return [];
    const gross = invoice.grossAmount ?? new Prisma.Decimal(0);
    const withheld = invoice.taxEntries
      .filter((tax) => tax.kind === "WITHHELD_AT_SOURCE")
      .reduce((sum, tax) => sum.plus(tax.amount ?? 0), new Prisma.Decimal(0));
    const { expected, balance } = invoiceCashBalance(gross, [withheld], invoice.receipts.map((receipt) => new Prisma.Decimal(receipt.amount ?? 0)));
    if (!balance.gt(0)) return [];
    return [{ invoice, gross, withheld, expected, balance }];
  });
}

export function parsePositiveMoney(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} inválido.`);
  }
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error(`${label} inválido.`);
  const amount = new Prisma.Decimal(raw);
  if (!amount.gt(0)) throw new Error(`${label} deve ser positivo.`);
  return amount;
}
