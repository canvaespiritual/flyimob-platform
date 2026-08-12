import Link from "next/link";
import { notFound } from "next/navigation";

import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import SaleOverview from "@/components/financeiro/SaleOverview";
import StageCard from "@/components/financeiro/StageCard";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function VendaFinanceiraPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const session = await requireFinanceAccess();

  const { id } = await params;

  const tenantId = session.tenant.id;

  const [sale, participants] = await Promise.all([
    prisma.financialSale.findFirst({
      where: {
        id,
        tenantId,
      },

      include: {
        construtora: {
          select: {
            name: true,
          },
        },

        empreendimento: {
          select: {
            name: true,
          },
        },

        stages: {
          orderBy: {
            sequence: "asc",
          },

          include: {
            invoices: {
              orderBy: {
                createdAt: "asc",
              },

              include: {
                taxEntries: {
                  orderBy: {
                    createdAt: "asc",
                  },
                },
              },
            },

            receipts: {
              orderBy: {
                receivedAt: "asc",
              },
            },

            entitlements: {
              orderBy: {
                createdAt: "asc",
              },

              include: {
                participant: {
                  select: {
                    name: true,
                  },
                },

                paymentAllocations: {
                  select: {
                    amount: true,

                    payment: {
                      select: {
                        status: true,
                      },
                    },
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
            },

            companyAllocations: {
              where: {
                status: "APPROPRIATED",
              },

              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
      },
    }),

    prisma.financialParticipant.findMany({
      where: {
        tenantId,
        active: true,
      },

      orderBy: {
        name: "asc",
      },

      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!sale) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link
                href="/admin/financeiro/vendas"
                className="hover:text-gray-900"
              >
                Vendas
              </Link>

              <span>/</span>

              <span>{sale.clientName}</span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold text-gray-900">
              {sale.clientName}
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Dossiê financeiro completo da venda.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <SaleOverview
        clientName={sale.clientName}
        saleDate={sale.saleDate}
        construtora={
          sale.construtora?.name ||
          sale.construtoraNameManual
        }
        empreendimento={
          sale.empreendimento?.name ||
          sale.empreendimentoNameManual
        }
        block={sale.block}
        unit={sale.unit}
        vgv={
          sale.vgv
            ? Number(sale.vgv)
            : null
        }
        commission={
          sale.commissionFinalAmount
            ? Number(
                sale.commissionFinalAmount
              )
            : null
        }
        commissionPercent={
          sale.commissionPercent
            ? Number(
                sale.commissionPercent
              )
            : null
        }
      />

      <div className="space-y-6">
        {sale.stages.map(
          (stage, stageIndex) => {
            const isPrincipal =
              stage.type === "ATO" ||
              stage.type === "BANCO";

            const hasPreviousPrincipal =
              sale.stages
                .slice(
                  0,
                  stageIndex
                )
                .some(
                  (previous) =>
                    previous.type ===
                      "ATO" ||
                    previous.type ===
                      "BANCO"
                );

            return (
              <StageCard
                key={stage.id}
                participants={
                  participants
                }
                vgv={
                  sale.vgv
                    ? Number(
                        sale.vgv
                      )
                    : 0
                }
                canRedistribute={
                  isPrincipal &&
                  hasPreviousPrincipal
                }
                stage={{
                  id:
                    stage.id,

                  type:
                    stage.type,

                  label:
                    stage.label,

                  status:
                    stage.status,

                  commissionSharePercent:
                    stage.commissionSharePercent
                      ? Number(
                          stage.commissionSharePercent
                        )
                      : null,

                  expectedGrossAmount:
                    stage.expectedGrossAmount
                      ? Number(
                          stage.expectedGrossAmount
                        )
                      : null,

                  invoices:
                    stage.invoices.map(
                      (
                        invoice
                      ) => ({
                        id:
                          invoice.id,

                        number:
                          invoice.number,

                        grossAmount:
                          invoice.grossAmount
                            ? Number(
                                invoice.grossAmount
                              )
                            : null,

                        issuedAt:
                          invoice.issuedAt?.toISOString() ??
                          null,

                        status:
                          invoice.status,

                        taxEntries:
                          invoice.taxEntries.map(
                            (
                              tax
                            ) => ({
                              id:
                                tax.id,

                              invoiceId:
                                tax.invoiceId,

                              name:
                                tax.name,

                              kind:
                                tax.kind,

                              rate:
                                tax.rate
                                  ? Number(
                                      tax.rate
                                    )
                                  : null,

                              amount:
                                tax.amount
                                  ? Number(
                                      tax.amount
                                    )
                                  : null,

                              status:
                                tax.status,
                            })
                          ),
                      })
                    ),

                  receipts:
                    stage.receipts.map(
                      (
                        receipt
                      ) => ({
                        id:
                          receipt.id,

                        amount:
                          receipt.amount
                            ? Number(
                                receipt.amount
                              )
                            : null,

                        receivedAt:
                          receipt.receivedAt?.toISOString() ??
                          null,

                        status:
                          receipt.status,

                        reference:
                          receipt.reference,
                      })
                    ),

                  entitlements:
                    stage.entitlements.map(
                      (
                        entitlement
                      ) => ({
                        id:
                          entitlement.id,

                        role:
                          entitlement.role,

                        calculationBasis:
                          entitlement.calculationBasis,

                        percentage:
                          entitlement.percentage
                            ? Number(
                                entitlement.percentage
                              )
                            : null,

                        calculatedAmount:
                          entitlement.calculatedAmount
                            ? Number(
                                entitlement.calculatedAmount
                              )
                            : null,

                        overrideAmount:
                          entitlement.overrideAmount
                            ? Number(
                                entitlement.overrideAmount
                              )
                            : null,

                        finalAmount:
                          Number(
                            entitlement.finalAmount
                          ),

                        status:
                          entitlement.status,

                        participant: {
                          name:
                            entitlement
                              .participant
                              .name,
                        },

                        paymentAllocations:
                          entitlement.paymentAllocations.map(
                            (
                              allocation
                            ) => ({
                              amount:
                                Number(
                                  allocation.amount
                                ),

                              payment:
                                {
                                  status:
                                    allocation
                                      .payment
                                      .status,
                                },
                            })
                          ),

                        adjustmentAllocations:
                          entitlement.adjustmentAllocations.map(
                            (
                              allocation
                            ) => ({
                              amount:
                                Number(
                                  allocation.amount
                                ),

                              adjustment:
                                {
                                  effect:
                                    allocation
                                      .adjustment
                                      .effect,
                                },
                            })
                          ),
                      })
                    ),

                  companyAllocations:
                    stage.companyAllocations.map(
                      (
                        allocation
                      ) => ({
                        amount:
                          Number(
                            allocation.amount
                          ),
                      })
                    ),
                }}
              />
            );
          }
        )}
      </div>
    </div>
  );
}