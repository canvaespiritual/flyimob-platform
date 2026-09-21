import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { invoiceCashBalance, parsePositiveMoney, receiptRemittanceTotal } from "../../src/lib/financeiro/receipt-remittances.server";

const money = (value: string) => new Prisma.Decimal(value);

test("one bank credit equals exactly the sum of four receipt shares", () => {
  assert.equal(receiptRemittanceTotal([money("5000"), money("4000"), money("6000"), money("5000")]).toString(), "20000");
  assert.equal(receiptRemittanceTotal([money("5000"), money("4000"), money("6000"), money("4999.99")]).eq(money("20000")), false);
});

test("withholding reduces expected cash once and partial payments preserve balance", () => {
  assert.equal(invoiceCashBalance(money("10000"), [money("200")], []).expected.toString(), "9800");
  assert.equal(invoiceCashBalance(money("10000"), [money("200")], [money("6000")]).balance.toString(), "3800");
  assert.equal(invoiceCashBalance(money("10000"), [money("200")], [money("6000"), money("3800")]).balance.toString(), "0");
});

test("company payable tax is outside the bank balance calculation", () => {
  assert.equal(invoiceCashBalance(money("10000"), [], []).expected.toString(), "10000");
});

test("amount parser rejects extra precision and zero", () => {
  assert.equal(parsePositiveMoney("9.80", "Parcela").toString(), "9.8");
  assert.throws(() => parsePositiveMoney("9.801", "Parcela"));
  assert.throws(() => parsePositiveMoney("0", "Parcela"));
});
