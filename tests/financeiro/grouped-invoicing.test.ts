import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { dashboardInvoicedProjection } from "../../src/lib/financeiro/calculations";
import { allocateTaxCents, invoiceStageIds, stageInvoiceEconomics } from "../../src/lib/financeiro/invoice-economics.server";
import { validateGroupedInvoiceAmounts, validateGroupedInvoiceStages } from "../../src/lib/financeiro/grouped-invoicing.server";
import { availableGroupedAllocations, availableIndividualInvoices, invoiceCashBalance, receiptRemittanceTotal } from "../../src/lib/financeiro/receipt-remittances.server";

const d = (value: string) => new Prisma.Decimal(value);
const allocations = [
  { stageId: "a", amount: d("4000") }, { stageId: "b", amount: d("6000") },
];
const eligible = (stageId: string, builder = "builder", tenant = "tenant", balance = "5000") => ({
  stage: { id: stageId, tenantId: tenant, expectedGrossAmount: d("5000"),
    sale: { tenantId: tenant, construtoraId: builder } }, economics: { billableBalance: d(balance) },
});
function groupedStage(stageId: string, amount: string, receipts: string[] = []) {
  const invoice = { id: "nf", status: "ISSUED", grossAmount: d("10000"), allocations,
    taxEntries: [
      { id: "withheld", kind: "WITHHELD_AT_SOURCE", status: "WITHHELD", amount: d("201.01") },
      { id: "company", kind: "PAYABLE_BY_COMPANY", status: "SEPARATED", amount: d("400.01") },
    ] };
  return { id: stageId, expectedGrossAmount: d(amount), invoices: [],
    invoiceAllocations: [{ amount: d(amount), invoice }],
    receipts: receipts.map((value) => ({ status: "CONFIRMED", amount: d(value) })) };
}

test("old individual invoice keeps its direct stage gross and tax", () => {
  const value = stageInvoiceEconomics({ id: "a", expectedGrossAmount: d("500"), invoiceAllocations: [], receipts: [],
    invoices: [{ id: "legacy", status: "ISSUED", grossAmount: d("500"),
      taxEntries: [{ id: "tax", kind: "WITHHELD_AT_SOURCE", status: "WITHHELD", amount: d("25") }] }] });
  assert.equal(value.gross.toString(), "500");
  assert.equal(value.cashExpected.toString(), "475");
  assert.equal(value.invoiceDetails[0].grouped, false);
});

test("four allocations form exactly one invoice gross", () => {
  validateGroupedInvoiceAmounts(d("11354.96"), ["a", "b", "c", "d"].map((stageId) => ({ stageId, amount: d("2838.74") })));
});
test("unequal gross and allocations are rejected", () => assert.throws(() =>
  validateGroupedInvoiceAmounts(d("10000"), allocations.map((item) => ({ ...item, amount: item.stageId === "a" ? d("3999.99") : item.amount })))));
test("duplicate stage is rejected", () => assert.throws(() => validateGroupedInvoiceAmounts(d("8000"), [allocations[0], allocations[0]])));
test("zero and negative allocation are rejected", () => assert.throws(() => validateGroupedInvoiceAmounts(d("0"), [{ stageId: "a", amount: d("0") }])));
test("empty composition is rejected", () => assert.throws(() => validateGroupedInvoiceAmounts(d("1"), [])));
test("stage from another tenant is rejected", () => assert.throws(() =>
  validateGroupedInvoiceStages("tenant", "builder", [allocations[0]], [eligible("a", "builder", "other")])));
test("stage from another structural builder is rejected", () => assert.throws(() =>
  validateGroupedInvoiceStages("tenant", "builder", [allocations[0]], [eligible("a", "other")])));
test("allocation over remaining billable balance is rejected", () => assert.throws(() =>
  validateGroupedInvoiceStages("tenant", "builder", [allocations[0]], [eligible("a", "builder", "tenant", "3999.99")])));
test("stages from the same builder are eligible regardless of project", () =>
  validateGroupedInvoiceStages("tenant", "builder", allocations, [eligible("a"), eligible("b", "builder", "tenant", "7000")]));
test("missing stage is rejected", () => assert.throws(() =>
  validateGroupedInvoiceStages("tenant", "builder", allocations, [eligible("a")])));
test("grouping refuses a stage with an unlinked historical receipt", () => assert.throws(() =>
  validateGroupedInvoiceStages("tenant", "builder", [allocations[0]],
    [{ ...eligible("a"), stage: { ...eligible("a").stage, receipts: [{ invoiceId: null, status: "CONFIRMED" }] } }])));
test("same stage can be allocated again up to its remaining billable balance", () => {
  const value = stageInvoiceEconomics({ id: "a", expectedGrossAmount: d("10000"), invoices: [], receipts: [],
    invoiceAllocations: [{ amount: d("6000"), invoice: { id: "one", status: "ISSUED", grossAmount: d("6000"),
      allocations: [{ stageId: "a", amount: d("6000") }], taxEntries: [] } }] });
  assert.equal(value.billableBalance.toString(), "4000");
});
test("withholding shares close exactly in cents", () => {
  const shares = allocateTaxCents(d("201.01"), d("10000"), allocations);
  assert.equal(shares.get("a")!.plus(shares.get("b")!).toFixed(2), "201.01");
});
test("company payable tax shares close exactly in cents", () => {
  const shares = allocateTaxCents(d("400.01"), d("10000"), allocations);
  assert.equal(shares.get("a")!.plus(shares.get("b")!).toFixed(2), "400.01");
});
test("residual cent follows deterministic stage order", () => {
  const shares = allocateTaxCents(d("0.01"), d("3"), [{ stageId: "c", amount: d("1") }, { stageId: "a", amount: d("1") }, { stageId: "b", amount: d("1") }]);
  assert.equal(shares.get("a")!.toFixed(2), "0.01");
  assert.equal(shares.get("b")!.toFixed(2), "0.00");
});
test("positive, zero and negative taxes close exactly in cents for equal and unequal allocations", () => {
  const cases = [
    { amount: "0.01", gross: "3.00", parts: ["1.00", "1.00", "1.00"] },
    { amount: "1.00", gross: "3.00", parts: ["1.00", "1.00", "1.00"] },
    { amount: "227.10", gross: "10000.00", parts: ["1600.00", "2400.00", "6000.00"] },
  ];
  for (const item of cases) {
    const parts = item.parts.map((amount, index) => ({ stageId: String.fromCharCode(97 + index), amount: d(amount) }));
    for (const tax of [item.amount, "0.00", `-${item.amount}`]) {
      const shares = allocateTaxCents(d(tax), d(item.gross), [...parts].reverse());
      const total = [...shares.values()].reduce((sum, share) => sum.plus(share), d("0"));
      assert.equal(total.toFixed(2), d(tax).toFixed(2), tax);
      for (const share of shares.values()) {
        assert.ok(share.decimalPlaces() <= 2);
        assert.equal(tax.startsWith("-") ? !share.gt(0) : !share.lt(0), true);
      }
      const reordered = allocateTaxCents(d(tax), d(item.gross), parts);
      for (const part of parts) assert.equal(shares.get(part.stageId)!.toFixed(2), reordered.get(part.stageId)!.toFixed(2));
    }
  }
  const negativeCent = allocateTaxCents(d("-0.01"), d("3"), ["c", "a", "b"].map((stageId) => ({ stageId, amount: d("1") })));
  assert.equal(negativeCent.get("a")!.toFixed(2), "-0.01");
  assert.equal(negativeCent.get("b")!.toFixed(2), "0.00");
});
test("legacy partial individual invoice keeps dashboard projection unchanged", () => {
  assert.deepEqual(dashboardInvoicedProjection({ sharePercent: 50, invoiceGross: 6000, expectedGross: 10000,
    companyEconomicNet: 4500, hasIssuedAllocation: false }), { knownSharePercent: 50, futureProjectedNet: 0 });
});
test("partial grouped allocation uses its billed share and projects the remaining balance", () => {
  assert.deepEqual(dashboardInvoicedProjection({ sharePercent: 50, invoiceGross: 6000, expectedGross: 10000,
    companyEconomicNet: 4500, hasIssuedAllocation: true }), { knownSharePercent: 30, futureProjectedNet: 3000 });
});
test("legacy full individual invoice keeps dashboard projection unchanged", () => {
  assert.deepEqual(dashboardInvoicedProjection({ sharePercent: 50, invoiceGross: 10000, expectedGross: 10000,
    companyEconomicNet: 7500, hasIssuedAllocation: false }), { knownSharePercent: 50, futureProjectedNet: 0 });
});
test("tenant without allocations preserves legacy aggregate dashboard formulas", () => {
  const stages = [
    { sharePercent: 40, invoiceGross: 6000, expectedGross: 10000, companyEconomicNet: 4200 },
    { sharePercent: 35, invoiceGross: 8000, expectedGross: 8000, companyEconomicNet: 5000 },
  ];
  const projections = stages.map((stage) => dashboardInvoicedProjection({ ...stage, hasIssuedAllocation: false }));
  assert.equal(projections.reduce((sum, stage) => sum + stage.knownSharePercent, 0), 75);
  assert.equal(projections.reduce((sum, stage) => sum + stage.futureProjectedNet, 0), 0);
  assert.equal(stages.reduce((sum, stage) => sum + stage.sharePercent, 0), 75);
});
test("one grouped invoice is economic across two stages without fiscal duplication", () => {
  const a = stageInvoiceEconomics(groupedStage("a", "4000"));
  const b = stageInvoiceEconomics(groupedStage("b", "6000"));
  assert.equal(a.gross.plus(b.gross).toString(), "10000");
  assert.equal(a.withheld.plus(b.withheld).toFixed(2), "201.01");
  assert.equal(a.payable.plus(b.payable).toFixed(2), "400.01");
  assert.equal(a.payableSeparated.plus(b.payableSeparated).toFixed(2), "400.01");
});
test("withholding reduces cash once while company tax reduces only economic net", () => {
  const value = stageInvoiceEconomics(groupedStage("a", "4000"));
  assert.equal(value.cashExpected.plus(value.withheld).toString(), "4000");
  assert.equal(value.economicNet.plus(value.payable).toString(), value.cashExpected.toString());
});
test("two partial PIX receipts reduce only the correct allocation balance", () => {
  const value = stageInvoiceEconomics(groupedStage("a", "4000", ["1000", "1500"]));
  assert.equal(value.received.toString(), "2500");
  assert.equal(value.cashBalance.plus(value.received).toString(), value.cashExpected.toString());
});
test("mixed remittance sums grouped and individual shares into one bank amount", () => {
  assert.equal(receiptRemittanceTotal([d("4000"), d("2000"), d("3000")]).toString(), "9000");
  assert.equal(invoiceCashBalance(d("5000"), [d("250")], [d("2000")]).balance.toString(), "2750");
});
test("fiscal status of an individual invoice refreshes its original stage", () => {
  assert.deepEqual(invoiceStageIds({ stageId: "a", allocations: [] }), ["a"]);
});
test("fiscal status of a grouped invoice refreshes every allocated stage once", () => {
  assert.deepEqual(invoiceStageIds({ stageId: null, allocations: [{ stageId: "a" }, { stageId: "b" }, { stageId: "a" }] }), ["a", "b"]);
});
test("production individual remittance path still offers four separate invoices", async () => {
  const source = ["a", "b", "c", "d"].map((id) => ({ id, stageId: `stage-${id}`, number: id,
    grossAmount: d("5000"), taxEntries: [], receipts: [],
    stage: { receipts: [], sale: { construtoraId: "builder" } } }));
  const db = { financialInvoice: { findMany: async () => source } };
  const entries = await availableIndividualInvoices(db as never, "tenant");
  assert.equal(entries.length, 4);
  assert.equal(receiptRemittanceTotal(entries.map((item) => item.balance)).toString(), "20000");
});
test("production individual remittance path excludes legacy unlinked stage receipt", async () => {
  const db = { financialInvoice: { findMany: async () => [{ id: "old", stageId: "a", grossAmount: d("100"),
    taxEntries: [], receipts: [], stage: { receipts: [{ id: "unlinked" }], sale: { construtoraId: "builder" } } }] } };
  assert.equal((await availableIndividualInvoices(db as never, "tenant")).length, 0);
});
test("one grouped invoice exposes separate balances by invoice and stage", async () => {
  const invoice = { id: "nf", number: "123", grossAmount: d("10000"), construtoraId: "builder",
    construtora: { name: "Builder" }, taxEntries: [], receipts: [{ stageId: "a", amount: d("1000") }],
    allocations: allocations.map((item) => ({ ...item, stage: { tenantId: "tenant", status: "AWAITING_RECEIPT",
      receipts: [], sale: { tenantId: "tenant", status: "OPEN", construtoraId: "builder" } } })) };
  const db = { financialInvoice: { findMany: async () => [invoice] } };
  const entries = await availableGroupedAllocations(db as never, "tenant");
  assert.equal(entries.length, 2);
  assert.equal(entries.find((item) => item.allocation.stageId === "a")!.balance.toString(), "3000");
  assert.equal(entries.find((item) => item.allocation.stageId === "b")!.balance.toString(), "6000");
});
