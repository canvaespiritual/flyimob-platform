import { Prisma } from "@prisma/client";
import { calculateEntitlementSettlement, calculateAdjustmentBalance } from "@/lib/financeiro/calculations";
import { toDecimal, moneyAdd } from "@/lib/financeiro/money";
type Money = Prisma.Decimal;
export function officeEntitlement(e: { finalAmount: Money; paymentAllocations: { amount: Money; payment: { status: string } }[]; adjustmentAllocations: { amount: Money; adjustment: { effect: "CREDIT" | "DEBIT" } }[] }) {
  const paid = e.paymentAllocations.filter(a => a.payment.status === "PAID");
  const settlement = calculateEntitlementSettlement({ entitlementAmount: e.finalAmount, paymentAllocations: paid.map(a => a.amount), adjustmentAllocations: e.adjustmentAllocations.map(a => ({ amount: a.amount, effect: a.adjustment.effect })) });
  return { amount: e.finalAmount.toFixed(2), paid: moneyAdd(...paid.map(a => a.amount)).toFixed(2), settled: settlement.settledAmount.toFixed(2), remaining: Prisma.Decimal.max(settlement.balance, 0).toFixed(2) };
}
export function officeAdjustment(a: { amount: Money; allocations: { amount: Money }[] }) {
  return Prisma.Decimal.max(calculateAdjustmentBalance({ adjustmentAmount: a.amount, allocatedAmounts: a.allocations.map(x => x.amount) }), 0).toFixed(2);
}
export const sumMoney = (values: (string | Money)[]) => values.reduce<Prisma.Decimal>((sum, amount) => sum.plus(amount), toDecimal(0)).toFixed(2);
