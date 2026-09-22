import {
  FinancialCalculationBasis,
  FinancialAdjustmentEffect,
} from "@prisma/client";

import {
  MoneyLike,
  moneyAdd,
  moneySubtract,
  percentageOf,
  roundMoney,
  toDecimal,
} from "./money";

export type EntitlementCalculationInput = {
  basis: FinancialCalculationBasis;

  percentage?: MoneyLike;

  grossCommission?: MoneyLike;
  netAfterWithholding?: MoneyLike;
  netAfterAllTaxes?: MoneyLike;
  vgv?: MoneyLike;

  fixedAmount?: MoneyLike;
  manualAmount?: MoneyLike;
};

export function calculateEntitlement(
  input: EntitlementCalculationInput
) {
  switch (input.basis) {
    case "COMMISSION_GROSS":
      return roundMoney(
        percentageOf(
          input.grossCommission,
          input.percentage
        )
      );

    case "COMMISSION_NET_AFTER_WITHHOLDING":
      return roundMoney(
        percentageOf(
          input.netAfterWithholding,
          input.percentage
        )
      );

    case "COMMISSION_NET_AFTER_ALL_TAXES":
      return roundMoney(
        percentageOf(
          input.netAfterAllTaxes,
          input.percentage
        )
      );

    case "VGV":
      return roundMoney(
        percentageOf(
          input.vgv,
          input.percentage
        )
      );

    case "FIXED":
      return roundMoney(input.fixedAmount);

    case "MANUAL":
      return roundMoney(input.manualAmount);

    default:
      return toDecimal(0);
  }
}

export function calculateNetAfterWithholding(params: {
  grossAmount: MoneyLike;
  withheldTaxes: MoneyLike[];
}) {
  return roundMoney(
    moneySubtract(
      params.grossAmount,
      moneyAdd(...params.withheldTaxes)
    )
  );
}

export function calculateNetAfterAllTaxes(params: {
  grossAmount: MoneyLike;
  withheldTaxes: MoneyLike[];
  payableTaxes: MoneyLike[];
}) {
  return roundMoney(
    moneySubtract(
      params.grossAmount,
      moneyAdd(...params.withheldTaxes),
      moneyAdd(...params.payableTaxes)
    )
  );
}

export function calculateAdjustmentBalance(params: {
  adjustmentAmount: MoneyLike;
  allocatedAmounts: MoneyLike[];
}) {
  return roundMoney(
    moneySubtract(
      params.adjustmentAmount,
      moneyAdd(...params.allocatedAmounts)
    )
  );
}

export function calculatePaymentBalance(params: {
  paymentAmount: MoneyLike;
  allocatedAmounts: MoneyLike[];
}) {
  return roundMoney(
    moneySubtract(
      params.paymentAmount,
      moneyAdd(...params.allocatedAmounts)
    )
  );
}

export function calculateEntitlementSettlement(params: {
  entitlementAmount: MoneyLike;
  paymentAllocations: MoneyLike[];
  adjustmentAllocations: Array<{
    amount: MoneyLike;
    effect: FinancialAdjustmentEffect;
  }>;
}) {
  let settled = moneyAdd(...params.paymentAllocations);

  for (const adjustment of params.adjustmentAllocations) {
    const amount = toDecimal(adjustment.amount);

    if (adjustment.effect === "DEBIT") {
      settled = settled.plus(amount);
    }

    if (adjustment.effect === "CREDIT") {
      settled = settled.minus(amount);
    }
  }

  const balance = roundMoney(
    toDecimal(params.entitlementAmount).minus(settled)
  );

  return {
    settledAmount: roundMoney(settled),
    balance,
  };
}

export function calculateCompanyNet(params: {
  actualReceipts: MoneyLike[];
  companyPayableTaxes: MoneyLike[];
  participantEntitlements: MoneyLike[];
  companyCosts?: MoneyLike[];
}) {
  return roundMoney(
    moneySubtract(
      moneyAdd(...params.actualReceipts),
      moneyAdd(...params.companyPayableTaxes),
      moneyAdd(...params.participantEntitlements),
      moneyAdd(...(params.companyCosts ?? []))
    )
  );
}

/** Keep the pre-allocation dashboard projection unchanged for individual invoices. */
export function dashboardInvoicedProjection(params: {
  sharePercent: number;
  invoiceGross: number;
  expectedGross: number;
  companyEconomicNet: number;
  hasIssuedAllocation: boolean;
}) {
  if (!params.hasIssuedAllocation) {
    return { knownSharePercent: params.sharePercent, futureProjectedNet: 0 };
  }

  const knownSharePercent = params.sharePercent * Math.min(
    1,
    params.invoiceGross / Math.max(params.invoiceGross, params.expectedGross)
  );
  const unfactoredGross = Math.max(0, params.expectedGross - params.invoiceGross);
  const futureProjectedNet = unfactoredGross > 0 && params.invoiceGross > 0
    ? Math.max(0, params.companyEconomicNet / params.invoiceGross * unfactoredGross)
    : 0;
  return { knownSharePercent, futureProjectedNet };
}
