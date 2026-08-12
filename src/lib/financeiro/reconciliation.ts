import {
  FinancialEntitlementStatus,
  FinancialStageStatus,
  FinancialTaxStatus,
} from "@prisma/client";

import {
  MoneyLike,
  isMoneyZero,
  moneyAdd,
  moneySubtract,
  roundMoney,
} from "./money";

export type StageReconciliationInput = {
  receivedAmounts: MoneyLike[];

  payableTaxes: Array<{
    amount: MoneyLike;
    status: FinancialTaxStatus;
  }>;

  entitlements: Array<{
    finalAmount: MoneyLike;
    status: FinancialEntitlementStatus;
  }>;

  companyAllocations: MoneyLike[];

  extraCompanyCosts?: MoneyLike[];
};

export type StageReconciliationResult = {
  totalReceived: ReturnType<typeof roundMoney>;
  totalPayableTaxes: ReturnType<typeof roundMoney>;
  totalEntitlements: ReturnType<typeof roundMoney>;
  totalCompanyAllocated: ReturnType<typeof roundMoney>;
  totalExtraCompanyCosts: ReturnType<typeof roundMoney>;

  calculatedCompanyNet: ReturnType<typeof roundMoney>;
  reconciliationDifference: ReturnType<typeof roundMoney>;

  allTaxesResolved: boolean;
  allEntitlementsResolved: boolean;
  companyAllocationResolved: boolean;
  resolved: boolean;

  suggestedStageStatus: FinancialStageStatus;
};

export function reconcileStage(
  input: StageReconciliationInput
): StageReconciliationResult {
  const totalReceived = roundMoney(
    moneyAdd(...input.receivedAmounts)
  );

  const totalPayableTaxes = roundMoney(
    moneyAdd(...input.payableTaxes.map((item) => item.amount))
  );

  const totalEntitlements = roundMoney(
    moneyAdd(...input.entitlements.map((item) => item.finalAmount))
  );

  const totalExtraCompanyCosts = roundMoney(
    moneyAdd(...(input.extraCompanyCosts ?? []))
  );

  const calculatedCompanyNet = roundMoney(
    moneySubtract(
      totalReceived,
      totalPayableTaxes,
      totalEntitlements,
      totalExtraCompanyCosts
    )
  );

  const totalCompanyAllocated = roundMoney(
    moneyAdd(...input.companyAllocations)
  );

  const reconciliationDifference = roundMoney(
    calculatedCompanyNet.minus(totalCompanyAllocated)
  );

  const allTaxesResolved = input.payableTaxes.every(
    (item) =>
      item.status === "SEPARATED" ||
      item.status === "PAID" ||
      item.status === "CANCELLED"
  );

  const allEntitlementsResolved = input.entitlements.every(
    (item) =>
      item.status === "PAID" ||
      item.status === "CANCELLED"
  );

  const companyAllocationResolved =
    isMoneyZero(reconciliationDifference);

  const resolved =
    totalReceived.gt(0) &&
    allTaxesResolved &&
    allEntitlementsResolved &&
    companyAllocationResolved;

  let suggestedStageStatus: FinancialStageStatus = "EXPECTED";

  if (resolved) {
    suggestedStageStatus = "RESOLVED";
  } else if (totalReceived.gt(0)) {
    suggestedStageStatus = "RECEIVED";
  }

  return {
    totalReceived,
    totalPayableTaxes,
    totalEntitlements,
    totalCompanyAllocated,
    totalExtraCompanyCosts,
    calculatedCompanyNet,
    reconciliationDifference,
    allTaxesResolved,
    allEntitlementsResolved,
    companyAllocationResolved,
    resolved,
    suggestedStageStatus,
  };
}