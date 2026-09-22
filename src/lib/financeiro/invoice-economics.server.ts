import { Prisma } from "@prisma/client";

type Money = Prisma.Decimal | string | number | null | undefined;
type Tax = { id: string; kind: string; status: string; amount: Money };
type Invoice = { id: string; status: string; grossAmount: Money; taxEntries: Tax[] };
type Allocation = { stageId: string; amount: Money };
type GroupedInvoice = Invoice & { allocations: Allocation[] };
type StageInput = {
  id: string;
  expectedGrossAmount?: Money;
  invoices: Invoice[];
  invoiceAllocations: Array<{ amount: Money; invoice: GroupedInvoice }>;
  receipts?: Array<{ status: string; amount: Money }>;
};

const zero = () => new Prisma.Decimal(0);
const decimal = (value: Money) => new Prisma.Decimal(value ?? 0);

/** Split one fiscal amount into exact cents; residual cents go to stageId order. */
export function allocateTaxCents(taxAmount: Money, grossAmount: Money, allocations: Allocation[]) {
  const gross = decimal(grossAmount);
  if (!gross.gt(0)) throw new Error("NF agrupada sem bruto positivo.");
  const ordered = [...allocations].sort((a, b) => a.stageId.localeCompare(b.stageId));
  const sum = ordered.reduce((total, item) => total.plus(decimal(item.amount)), zero());
  if (!sum.eq(gross)) throw new Error("Alocações da NF não fecham com o bruto.");
  const tax = decimal(taxAmount);
  const magnitude = tax.abs();
  if (!magnitude.mul(100).isInteger()) throw new Error("Imposto deve estar em centavos.");
  const result = new Map<string, Prisma.Decimal>();
  let assigned = zero();
  ordered.forEach((item) => {
    const share = magnitude.mul(decimal(item.amount)).div(gross).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    result.set(item.stageId, share);
    assigned = assigned.plus(share);
  });
  let residualCents = magnitude.minus(assigned).mul(100);
  for (let index = 0; residualCents.gt(0); index = (index + 1) % ordered.length, residualCents = residualCents.minus(1)) {
    const stageId = ordered[index].stageId;
    result.set(stageId, result.get(stageId)!.plus(new Prisma.Decimal("0.01")));
  }
  if (tax.isNeg()) {
    for (const [stageId, share] of result) result.set(stageId, share.negated());
  }
  return result;
}

export function stageInvoiceEconomics(stage: StageInput, options?: { includeNonIssuedSeparatedTaxes?: boolean }) {
  let gross = zero();
  let withheld = zero();
  let payable = zero();
  let payableSeparated = zero();
  let other = zero();
  const details: Array<{ invoiceId: string; grouped: boolean; gross: Prisma.Decimal }> = [];
  function addTax(tax: Tax, amount: Prisma.Decimal) {
    if (tax.status === "CANCELLED") return;
    if (tax.kind === "WITHHELD_AT_SOURCE") withheld = withheld.plus(amount);
    else if (tax.kind === "PAYABLE_BY_COMPANY") {
      payable = payable.plus(amount);
      if (tax.status === "SEPARATED" || tax.status === "PAID") payableSeparated = payableSeparated.plus(amount);
    }
    else other = other.plus(amount);
  }
  for (const invoice of stage.invoices) {
    if (invoice.status !== "ISSUED") {
      if (options?.includeNonIssuedSeparatedTaxes) {
        invoice.taxEntries.filter((tax) => tax.kind === "PAYABLE_BY_COMPANY" &&
          (tax.status === "SEPARATED" || tax.status === "PAID"))
          .forEach((tax) => { payableSeparated = payableSeparated.plus(decimal(tax.amount)); });
      }
      continue;
    }
    const amount = decimal(invoice.grossAmount);
    gross = gross.plus(amount);
    details.push({ invoiceId: invoice.id, grouped: false, gross: amount });
    invoice.taxEntries.forEach((tax) => addTax(tax, decimal(tax.amount)));
  }
  for (const allocation of stage.invoiceAllocations) {
    const invoice = allocation.invoice;
    if (invoice.status !== "ISSUED") continue;
    const amount = decimal(allocation.amount);
    gross = gross.plus(amount);
    details.push({ invoiceId: invoice.id, grouped: true, gross: amount });
    for (const tax of invoice.taxEntries) {
      if (tax.status === "CANCELLED") continue;
      addTax(tax, allocateTaxCents(tax.amount, invoice.grossAmount, invoice.allocations).get(stage.id) ?? zero());
    }
  }
  const received = (stage.receipts ?? []).filter((item) => item.status === "CONFIRMED")
    .reduce((total, item) => total.plus(decimal(item.amount)), zero());
  const cashExpected = gross.minus(withheld);
  return {
    gross, withheld, payable, payableSeparated, other, cashExpected, economicNet: cashExpected.minus(payable).minus(other),
    received, cashBalance: cashExpected.minus(received),
    invoiceDetails: details,
    billableBalance: decimal(stage.expectedGrossAmount).minus(gross),
  };
}

export const stageInvoiceEconomicsInclude = {
  invoices: { include: { taxEntries: true } },
  invoiceAllocations: { include: { invoice: { include: { taxEntries: true, allocations: true } } } },
  receipts: true,
} satisfies Prisma.FinancialStageInclude;

export function invoiceStageIds(invoice: { stageId: string | null; allocations: Array<{ stageId: string }> }) {
  return invoice.stageId ? [invoice.stageId] : [...new Set(invoice.allocations.map((item) => item.stageId))];
}
