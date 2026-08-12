import FinanceiroDashboard from "@/components/financeiro/FinanceiroDashboard";
import FinanceiroNav from "@/components/financeiro/FinanceiroNav";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { decimalToNumber } from "@/lib/financeiro/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const session =
    await requireFinanceAccess();

  const tenantId =
    session.tenant.id;

  const [
    totalSales,
    salesVgv,
    invoices,
    receipts,
    openEntitlements,
    pendingTaxes,
    companyAllocations,
    pendingStages,
  ] = await Promise.all([
    prisma.financialSale.count({
      where: {
        tenantId,
        status: {
          not: "CANCELLED",
        },
      },
    }),

    prisma.financialSale.aggregate({
      where: {
        tenantId,
        status: {
          not: "CANCELLED",
        },
      },

      _sum: {
        vgv: true,
      },
    }),

    prisma.financialInvoice.aggregate({
      where: {
        tenantId,
        status: "ISSUED",
      },

      _sum: {
        grossAmount: true,
      },
    }),

    prisma.financialReceipt.aggregate({
      where: {
        tenantId,
        status: "CONFIRMED",
      },

      _sum: {
        amount: true,
      },
    }),

    prisma.financialEntitlement.findMany({
      where: {
        tenantId,

        status: {
          in: [
            "OPEN",
            "PARTIAL",
          ],
        },
      },

      select: {
        finalAmount: true,

        paymentAllocations: {
          select: {
            amount: true,
          },
        },

        adjustmentAllocations: {
          select: {
            amount: true,

            adjustment: {
              select: {
                effect: true,
              },
            },
          },
        },
      },
    }),

    prisma.financialTaxEntry.aggregate({
      where: {
        tenantId,

        kind: "PAYABLE_BY_COMPANY",

        status: {
          in: [
            "PENDING",
            "PROVISIONED",
          ],
        },
      },

      _sum: {
        amount: true,
      },
    }),

    prisma.financialCompanyAllocation.aggregate({
      where: {
        tenantId,
        status: "APPROPRIATED",
      },

      _sum: {
        amount: true,
      },
    }),

    prisma.financialStage.count({
      where: {
        tenantId,

        status: {
          notIn: [
            "RESOLVED",
            "CANCELLED",
          ],
        },
      },
    }),
  ]);

  const invoiced =
    decimalToNumber(
      invoices._sum.grossAmount
    );

  const received =
    decimalToNumber(
      receipts._sum.amount
    );

  const receivable =
    Math.max(
      0,
      invoiced - received
    );

  let payableParticipants = 0;

  for (
    const entitlement
    of openEntitlements
  ) {
    let settled = 0;

    for (
      const allocation
      of entitlement.paymentAllocations
    ) {
      settled +=
        decimalToNumber(
          allocation.amount
        );
    }

    for (
      const allocation
      of entitlement.adjustmentAllocations
    ) {
      const amount =
        decimalToNumber(
          allocation.amount
        );

      if (
        allocation.adjustment.effect ===
        "DEBIT"
      ) {
        settled += amount;
      }

      if (
        allocation.adjustment.effect ===
        "CREDIT"
      ) {
        settled -= amount;
      }
    }

    payableParticipants +=
      Math.max(
        0,
        decimalToNumber(
          entitlement.finalAmount
        ) - settled
      );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Financeiro
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Controle financeiro da operação{" "}
              {session.tenant.name}.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <FinanceiroDashboard
        totalSales={totalSales}

        vgv={decimalToNumber(
          salesVgv._sum.vgv
        )}

        invoiced={invoiced}

        received={received}

        receivable={receivable}

        payableParticipants={
          payableParticipants
        }

        taxToSeparate={
          decimalToNumber(
            pendingTaxes._sum.amount
          )
        }

        companyNet={
          decimalToNumber(
            companyAllocations._sum.amount
          )
        }

        pendingStages={
          pendingStages
        }
      />
    </div>
  );
}