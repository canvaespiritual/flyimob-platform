import Link from "next/link";

import FinanceiroNav from "@/components/financeiro/FinanceiroNav";
import SalesOverviewTable, {
  SalesOverviewRow,
  SalesOverviewStage,
} from "@/components/financeiro/SalesOverviewTable";

import { requireFinanceAccess } from "@/lib/financeiro/access.server";
import { prisma } from "@/lib/prisma";

export const dynamic =
  "force-dynamic";

const PAGE_SIZE = 10;

function num(
  value: unknown
) {
  return Number(
    value || 0
  );
}

function round(
  value: number
) {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100
    ) / 100
  );
}

function iso(
  value:
    | Date
    | null
    | undefined
) {
  return value
    ? value.toISOString()
    : null;
}

function maxDate(
  values: Array<
    Date | null | undefined
  >
) {
  const dates =
    values.filter(
      (
        value
      ): value is Date =>
        value instanceof Date
    );

  if (
    dates.length === 0
  ) {
    return null;
  }

  return new Date(
    Math.max(
      ...dates.map(
        (date) =>
          date.getTime()
      )
    )
  );
}

type LoadedSale =
  Awaited<
    ReturnType<
      typeof loadSales
    >
  >[number];

async function loadSales(
  tenantId: string,
  filters: {
    search?: string;
    broker?: string;
    builder?: string;
    from?: Date;
    to?: Date;
  }
) {
  return prisma.financialSale.findMany({
    where: {
      tenantId,

      ...(filters.search
        ? {
            clientName: {
              contains:
                filters.search,

              mode:
                "insensitive" as const,
            },
          }
        : {}),

      ...(filters.builder
        ? {
            construtoraId:
              filters.builder,
          }
        : {}),

      ...(filters.broker
        ? {
            stages: {
              some: {
                entitlements: {
                  some: {
                    participantId:
                      filters.broker,

                    role:
                      "BROKER",
                  },
                },
              },
            },
          }
        : {}),

      ...(filters.from ||
      filters.to
        ? {
            stages: {
              some: {
                invoices: {
                  some: {
                    status:
                      "ISSUED",

                    issuedAt: {
                      ...(filters.from
                        ? {
                            gte:
                              filters.from,
                          }
                        : {}),

                      ...(filters.to
                        ? {
                            lte:
                              filters.to,
                          }
                        : {}),
                    },
                  },
                },
              },
            },
          }
        : {}),
    },

    orderBy: [
      {
        saleDate: "desc",
      },

      {
        createdAt: "desc",
      },
    ],

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
              issuedAt:
                "asc",
            },

            include: {
              taxEntries:
                true,
            },
          },

          receipts: {
            orderBy: {
              receivedAt:
                "asc",
            },
          },

          entitlements: {
            orderBy: {
              createdAt:
                "asc",
            },

            include: {
              participant: {
                select: {
                  id: true,
                  name: true,
                },
              },

              paymentAllocations: {
                include: {
                  payment: {
                    select: {
                      status:
                        true,

                      paidAt:
                        true,
                    },
                  },
                },
              },

              adjustmentAllocations: {
                include: {
                  adjustment: {
                    select: {
                      effect:
                        true,
                    },
                  },
                },
              },
            },
          },

          companyAllocations: {
            where: {
              status:
                "APPROPRIATED",
            },

            orderBy: {
              appropriatedAt:
                "asc",
            },
          },
        },
      },
    },
  });
}

function stageData(
  stage:
    LoadedSale["stages"][number],
  projectionFallback: {
    taxRate: number;
    participantRatio: number;
  } | undefined,
  attachmentKeys: Set<string>
): SalesOverviewStage {
  const issuedInvoices =
    stage.invoices.filter(
      (invoice) =>
        invoice.status ===
        "ISSUED"
    );

  const invoiceGross =
    round(
      issuedInvoices.reduce(
        (
          total,
          invoice
        ) =>
          total +
          num(
            invoice.grossAmount
          ),
        0
      )
    );

  const projectedGross =
    invoiceGross > 0
      ? invoiceGross
      : num(
          stage.expectedGrossAmount
        );

  const activeTaxes =
    issuedInvoices.flatMap(
      (invoice) =>
        invoice.taxEntries.filter(
          (tax) =>
            tax.status !==
            "CANCELLED"
        )
    );

  const withheldTaxes =
    activeTaxes.filter(
      (tax) =>
        tax.kind ===
        "WITHHELD_AT_SOURCE"
    );

  const payableTaxes =
    activeTaxes.filter(
      (tax) =>
        tax.kind ===
        "PAYABLE_BY_COMPANY"
    );

  const withheldTax =
    round(
      withheldTaxes.reduce(
        (
          total,
          tax
        ) =>
          total +
          num(tax.amount),
        0
      )
    );

  const payableTax =
    round(
      payableTaxes.reduce(
        (
          total,
          tax
        ) =>
          total +
          num(tax.amount),
        0
      )
    );

  let projectedTax =
    withheldTax +
    payableTax;

  if (
    projectedTax <= 0 &&
    projectedGross > 0 &&
    projectionFallback
      ?.taxRate
  ) {
    projectedTax =
      round(
        projectedGross *
          projectionFallback.taxRate
      );
  }

  const confirmedReceipts =
    stage.receipts.filter(
      (receipt) =>
        receipt.status ===
        "CONFIRMED"
    );

  const invoicesWithoutAttachment =
  issuedInvoices.filter(
    (invoice) =>
      !attachmentKeys.has(
        `INVOICE:${invoice.id}`
      )
  );

const receiptsWithoutAttachment =
  confirmedReceipts.filter(
    (receipt) =>
      !attachmentKeys.has(
        `RECEIPT:${receipt.id}`
      )
  );  
  const receivedAmount =
    round(
      confirmedReceipts.reduce(
        (
          total,
          receipt
        ) =>
          total +
          num(
            receipt.amount
          ),
        0
      )
    );

  const participantRows =
    stage.entitlements
      .filter(
        (entitlement) =>
          entitlement.status !==
          "CANCELLED"
      )
      .map(
        (entitlement) => {
          const paid =
            entitlement.paymentAllocations
              .filter(
                (allocation) =>
                  allocation.payment
                    .status ===
                  "PAID"
              )
              .reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

          const debit =
            entitlement.adjustmentAllocations
              .filter(
                (allocation) =>
                  allocation.adjustment
                    .effect ===
                  "DEBIT"
              )
              .reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

          const credit =
            entitlement.adjustmentAllocations
              .filter(
                (allocation) =>
                  allocation.adjustment
                    .effect ===
                  "CREDIT"
              )
              .reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

          const finalAmount =
            num(
              entitlement.finalAmount
            );

          const remaining =
            round(
              Math.max(
                0,
                finalAmount -
                  paid -
                  debit +
                  credit
              )
            );

          let visualStatus:
            | "PAID"
            | "PARTIAL"
            | "OPEN"
            | "CANCELLED" =
            "OPEN";

          if (
            remaining <=
            0.01
          ) {
            visualStatus =
              "PAID";
          } else if (
            paid > 0 ||
            debit > 0
          ) {
            visualStatus =
              "PARTIAL";
          }

          return {
            id:
              entitlement.id,

            name:
              entitlement
                .participant
                .name,

            role:
              entitlement.role,

            amount:
              finalAmount,

            status:
              visualStatus,

            remaining,
          };
        }
      );

  let participantRights =
    round(
      participantRows.reduce(
        (
          total,
          participant
        ) =>
          total +
          participant.amount,
        0
      )
    );

  if (
    participantRights <=
      0 &&
    projectedGross > 0 &&
    projectionFallback
      ?.participantRatio
  ) {
    participantRights =
      round(
        projectedGross *
          projectionFallback.participantRatio
      );
  }

  const participantPending =
    participantRows.filter(
      (participant) =>
        participant.status ===
          "OPEN" ||
        participant.status ===
          "PARTIAL"
    );

  const taxPending =
    payableTaxes.filter(
      (tax) =>
        tax.status ===
          "PENDING" ||
        tax.status ===
          "PROVISIONED"
    );

  const taxSeparated =
    round(
      payableTaxes
        .filter(
          (tax) =>
            tax.status ===
              "SEPARATED" ||
            tax.status ===
              "PAID"
        )
        .reduce(
          (
            total,
            tax
          ) =>
            total +
            num(
              tax.amount
            ),
          0
        )
    );

  const participantSettled =
    round(
      stage.entitlements.reduce(
        (
          stageTotal,
          entitlement
        ) => {
          const payments =
            entitlement.paymentAllocations
              .filter(
                (allocation) =>
                  allocation.payment
                    .status ===
                  "PAID"
              )
              .reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

          const debits =
            entitlement.adjustmentAllocations
              .filter(
                (allocation) =>
                  allocation.adjustment
                    .effect ===
                  "DEBIT"
              )
              .reduce(
                (
                  total,
                  allocation
                ) =>
                  total +
                  num(
                    allocation.amount
                  ),
                0
              );

          return (
            stageTotal +
            payments +
            debits
          );
        },
        0
      )
    );

  const companyAllocated =
    round(
      stage.companyAllocations.reduce(
        (
          total,
          allocation
        ) =>
          total +
          num(
            allocation.amount
          ),
        0
      )
    );

  const cashDifference =
    round(
      receivedAmount -
        taxSeparated -
        participantSettled -
        companyAllocated
    );

  const pendingLabels:
    string[] = [];

    if (
  invoicesWithoutAttachment.length >
  0
) {
  pendingLabels.push(
    invoicesWithoutAttachment.length ===
      1
      ? "Comprovante da NF pendente"
      : `${invoicesWithoutAttachment.length} NFs sem comprovante`
  );
}

if (
  receiptsWithoutAttachment.length >
  0
) {
  pendingLabels.push(
    receiptsWithoutAttachment.length ===
      1
      ? "Comprovante do recebimento pendente"
      : `${receiptsWithoutAttachment.length} recebimentos sem comprovante`
  );
}

  const hasMovement =
    issuedInvoices.length >
      0 ||
    confirmedReceipts.length >
      0 ||
    stage.entitlements.length >
      0;

  if (
    issuedInvoices.length ===
      0 &&
    hasMovement
  ) {
    pendingLabels.push(
      "NF não emitida"
    );
  }

  if (
    issuedInvoices.length >
      0 &&
    receivedAmount <= 0
  ) {
    pendingLabels.push(
      "Aguardando recebimento"
    );
  }

  if (
    taxPending.length >
    0
  ) {
    pendingLabels.push(
      "Imposto a separar"
    );
  }

  for (
    const participant
    of participantPending
  ) {
    pendingLabels.push(
      `${
        participant.name
      } — ${
        participant.status ===
        "PARTIAL"
          ? "pagamento parcial"
          : "pagamento pendente"
      }`
    );
  }

  if (
    receivedAmount > 0 &&
    taxPending.length ===
      0 &&
    participantPending.length ===
      0 &&
    cashDifference >
      0.01
  ) {
    pendingLabels.push(
      "Líquido não apropriado"
    );
  }

  let visualStatus:
    | "CONSOLIDATED"
    | "PENDING"
    | "WAITING"
    | "CANCELLED";

  if (
    stage.status ===
    "CANCELLED"
  ) {
    visualStatus =
      "CANCELLED";
  } else if (
  receivedAmount > 0 &&
  Math.abs(
    cashDifference
  ) <= 0.01 &&
  taxPending.length ===
    0 &&
  participantPending.length ===
    0 &&
  invoicesWithoutAttachment.length ===
    0 &&
  receiptsWithoutAttachment.length ===
    0
) {
  visualStatus =
    "CONSOLIDATED";
  } else if (
    issuedInvoices.length ===
      0 &&
    confirmedReceipts.length ===
      0 &&
    stage.status ===
      "EXPECTED"
  ) {
    visualStatus =
      "WAITING";
  } else {
    visualStatus =
      "PENDING";
  }

  if (
    visualStatus ===
      "PENDING" &&
    pendingLabels.length ===
      0
  ) {
    pendingLabels.push(
      "Etapa em andamento"
    );
  }

  const projectedCompanyNet =
    round(
      Math.max(
        0,
        projectedGross -
          projectedTax -
          participantRights
      )
    );

  const companyNet =
    visualStatus ===
      "CONSOLIDATED"
      ? companyAllocated
      : projectedCompanyNet;

  const invoiceDates =
    issuedInvoices.map(
      (invoice) =>
        invoice.issuedAt
    );

  const latestInvoice =
    maxDate(
      invoiceDates
    );

  const receivedDates =
    confirmedReceipts.map(
      (receipt) =>
        receipt.receivedAt
    );

  const latestReceipt =
    maxDate(
      receivedDates
    );

  return {
    id:
      stage.id,

    type:
      stage.type,

    label:
      stage.label,

    visualStatus,

    pendingLabels,

    invoiceNumber:
      issuedInvoices.at(
        -1
      )?.number ??
      null,

    invoiceDate:
      iso(
        latestInvoice
      ),

    invoiceGross:
      projectedGross,

    receivedAmount,

    receivedDate:
      iso(
        latestReceipt
      ),

    withheldTax,

    payableTax,

    totalTax:
      round(
        projectedTax
      ),

    companyNet,

    companyNetLabel:
      visualStatus ===
      "CONSOLIDATED"
        ? "REALIZADO"
        : "PROJETADO",

    participants:
      participantRows.map(
        (
          participant
        ) => ({
          id:
            participant.id,

          name:
            participant.name,

          role:
            participant.role,

          amount:
            participant.amount,

          status:
            participant.status,
        })
      ),
  };
}

function projectionReference(
  stages:
    LoadedSale["stages"]
) {
  const mainStages =
    stages.filter(
      (stage) =>
        stage.type ===
          "ATO" ||
        stage.type ===
          "BANCO"
    );

  for (
    const stage
    of mainStages
  ) {
    const invoices =
      stage.invoices.filter(
        (invoice) =>
          invoice.status ===
          "ISSUED"
      );

    const gross =
      invoices.reduce(
        (
          total,
          invoice
        ) =>
          total +
          num(
            invoice.grossAmount
          ),
        0
      );

    if (
      gross <= 0
    ) {
      continue;
    }

    const taxes =
      invoices.flatMap(
        (invoice) =>
          invoice.taxEntries.filter(
            (tax) =>
              tax.status !==
              "CANCELLED"
          )
      );

    const totalTax =
      taxes.reduce(
        (
          total,
          tax
        ) =>
          total +
          num(
            tax.amount
          ),
        0
      );

    const participantRights =
      stage.entitlements
        .filter(
          (entitlement) =>
            entitlement.status !==
            "CANCELLED"
        )
        .reduce(
          (
            total,
            entitlement
          ) =>
            total +
            num(
              entitlement.finalAmount
            ),
          0
        );

    return {
      taxRate:
        gross > 0
          ? totalTax /
            gross
          : 0,

      participantRatio:
        gross > 0
          ? participantRights /
            gross
          : 0,
    };
  }

  return {
    taxRate: 0,
    participantRatio: 0,
  };
}

function buildSaleRow(
  sale: LoadedSale,
  attachmentKeys: Set<string>
): SalesOverviewRow {
  const mainStages =
    sale.stages.filter(
      (stage) =>
        stage.type ===
          "ATO" ||
        stage.type ===
          "BANCO"
    );

  const extraStages =
    sale.stages.filter(
      (stage) =>
        stage.type !==
          "ATO" &&
        stage.type !==
          "BANCO"
    );

  const reference =
    projectionReference(
      sale.stages
    );

  const mainSnapshots =
  mainStages.map(
    (stage) =>
      stageData(
        stage,
        reference,
        attachmentKeys
      )
  );

  const extraSnapshots =
  extraStages.map(
    (stage) =>
      stageData(
        stage,
        reference,
        attachmentKeys
      )
  );

  const brokerNames =
    Array.from(
      new Set(
        mainStages
          .flatMap(
            (stage) =>
              stage.entitlements
          )
          .filter(
            (entitlement) =>
              entitlement.role ===
              "BROKER"
          )
          .map(
            (entitlement) =>
              entitlement
                .participant
                .name
          )
      )
    );

  const allMainConsolidated =
    mainSnapshots.length >
      0 &&
    mainSnapshots.every(
      (stage) =>
        stage.visualStatus ===
        "CONSOLIDATED"
    );

  const companyNet =
    mainSnapshots.length >
    0
      ? round(
          mainSnapshots.reduce(
            (
              total,
              stage
            ) =>
              total +
              stage.companyNet,
            0
          )
        )
      : null;

  const latestInvoice =
    maxDate(
      sale.stages.flatMap(
        (stage) =>
          stage.invoices
            .filter(
              (invoice) =>
                invoice.status ===
                "ISSUED"
            )
            .map(
              (invoice) =>
                invoice.issuedAt
            )
      )
    );

  return {
    id:
      sale.id,

    clientName:
      sale.clientName,

    brokerName:
      brokerNames.length >
      0
        ? brokerNames.join(
            " / "
          )
        : "—",

    construtoraName:
      sale.construtora
        ?.name ||
      sale.construtoraNameManual,

    empreendimentoName:
      sale.empreendimento
        ?.name ||
      sale.empreendimentoNameManual,

    block:
      sale.block,

    unit:
      sale.unit,

    saleDate:
      iso(
        sale.saleDate
      ),

    vgv:
      sale.vgv
        ? num(
            sale.vgv
          )
        : null,

    commission:
      sale.commissionFinalAmount
        ? num(
            sale.commissionFinalAmount
          )
        : null,

    companyNet,

    companyNetLabel:
      companyNet == null
        ? "SEM_BASE"
        : allMainConsolidated
          ? "REALIZADO"
          : "PROJETADO",

    stage1:
      mainSnapshots[0] ||
      null,

    stage2:
      mainSnapshots[1] ||
      null,

    extraStages:
      extraSnapshots,

    latestInvoiceDate:
      iso(
        latestInvoice
      ),
  };
}

function buildUrl(
  current: {
    search: string;
    broker: string;
    builder: string;
    from: string;
    to: string;
    situation: string;
  },
  page: number
) {
  const params =
    new URLSearchParams();

  if (
    current.search
  ) {
    params.set(
      "search",
      current.search
    );
  }

  if (
    current.broker
  ) {
    params.set(
      "broker",
      current.broker
    );
  }

  if (
    current.builder
  ) {
    params.set(
      "builder",
      current.builder
    );
  }

  if (
    current.from
  ) {
    params.set(
      "from",
      current.from
    );
  }

  if (
    current.to
  ) {
    params.set(
      "to",
      current.to
    );
  }

  if (
    current.situation
  ) {
    params.set(
      "situation",
      current.situation
    );
  }

  params.set(
    "page",
    String(page)
  );

  return `/admin/financeiro/vendas?${params.toString()}`;
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    broker?: string;
    builder?: string;
    from?: string;
    to?: string;
    situation?: string;
    page?: string;
  }>;
}) {
  const session =
    await requireFinanceAccess();

  const tenantId =
    session.tenant.id;

  const query =
    await searchParams;

  const search =
    String(
      query.search ||
        ""
    ).trim();

  const broker =
    String(
      query.broker ||
        ""
    ).trim();

  const builder =
    String(
      query.builder ||
        ""
    ).trim();

  const from =
    String(
      query.from ||
        ""
    ).trim();

  const to =
    String(
      query.to ||
        ""
    ).trim();

  const situation =
    String(
      query.situation ||
        ""
    ).trim();

  const requestedPage =
    Math.max(
      1,
      Number(
        query.page ||
          1
      ) || 1
    );

  const fromDate =
    from
      ? new Date(
          `${from}T00:00:00.000Z`
        )
      : undefined;

  const toDate =
    to
      ? new Date(
          `${to}T23:59:59.999Z`
        )
      : undefined;

  const [
    rawSales,
    brokers,
    builders,
  ] =
    await Promise.all([
      loadSales(
        tenantId,
        {
          search,
          broker,
          builder,
          from:
            fromDate,

          to:
            toDate,
        }
      ),

      prisma.financialParticipant.findMany({
        where: {
          tenantId,
          active: true,

          entitlements: {
            some: {
              role:
                "BROKER",
            },
          },
        },

        orderBy: {
          name: "asc",
        },

        select: {
          id: true,
          name: true,
        },
      }),

      prisma.construtora.findMany({
        where: {
          tenantId,
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
const invoiceIds =
  rawSales.flatMap((sale) =>
    sale.stages.flatMap((stage) =>
      stage.invoices.map((invoice) => invoice.id)
    )
  );

const receiptIds =
  rawSales.flatMap((sale) =>
    sale.stages.flatMap((stage) =>
      stage.receipts.map((receipt) => receipt.id)
    )
  );

const financialAttachments =
  await prisma.financialAttachment.findMany({
    where: {
      tenantId,

      OR: [
        {
          entityType: "INVOICE",
          entityId: {
            in: invoiceIds,
          },
        },
        {
          entityType: "RECEIPT",
          entityId: {
            in: receiptIds,
          },
        },
      ],
    },

    select: {
      id: true,
      entityType: true,
      entityId: true,
      type: true,
      url: true,
    },
  });

const attachmentKeys =
  new Set(
    financialAttachments.map(
      (attachment) =>
        `${attachment.entityType}:${attachment.entityId}`
    )
  );

  let rows =
  rawSales.map(
    (sale) =>
      buildSaleRow(
        sale,
        attachmentKeys
      )
  );

  /*
   * O filtro de situação é aplicado
   * depois de calcularmos os status
   * operacionais das etapas.
   *
   * Com o volume atual isso é
   * simples e mantém a regra correta.
   */
  if (
    situation ===
    "ATTENTION"
  ) {
    rows =
      rows.filter(
        (sale) =>
          sale.stage1
            ?.visualStatus ===
            "PENDING" ||
          sale.stage2
            ?.visualStatus ===
            "PENDING" ||
          sale.extraStages.some(
            (stage) =>
              stage.visualStatus ===
              "PENDING"
          )
      );
  }

  if (
    situation ===
    "STAGE1_DONE"
  ) {
    rows =
      rows.filter(
        (sale) =>
          sale.stage1
            ?.visualStatus ===
          "CONSOLIDATED"
      );
  }

  if (
    situation ===
    "WAITING_STAGE2"
  ) {
    rows =
      rows.filter(
        (sale) =>
          sale.stage1
            ?.visualStatus ===
            "CONSOLIDATED" &&
          sale.stage2
            ?.visualStatus ===
            "WAITING"
      );
  }

  if (
    situation ===
    "DONE"
  ) {
    rows =
      rows.filter(
        (sale) =>
          sale.stage1
            ?.visualStatus ===
            "CONSOLIDATED" &&
          (
            !sale.stage2 ||
            sale.stage2
              .visualStatus ===
              "CONSOLIDATED"
          )
      );
  }

  const total =
    rows.length;

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        total /
          PAGE_SIZE
      )
    );

  const page =
    Math.min(
      requestedPage,
      pageCount
    );

  const paginated =
    rows.slice(
      (page - 1) *
        PAGE_SIZE,

      page *
        PAGE_SIZE
    );

  const currentFilters = {
    search,
    broker,
    builder,
    from,
    to,
    situation,
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Vendas
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Panorama operacional
              das vendas e suas
              etapas financeiras.
            </p>
          </div>

          <Link
            href="/admin/financeiro/vendas/nova"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Nova venda
          </Link>
        </div>

        <div className="mt-5">
          <FinanceiroNav />
        </div>
      </div>

      <form
        method="get"
        className="rounded-lg border bg-white p-3"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_150px_150px_1fr_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">
              Cliente
            </span>

            <input
              name="search"
              defaultValue={
                search
              }
              placeholder="Buscar cliente..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">
              Corretor
            </span>

            <select
              name="broker"
              defaultValue={
                broker
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Todos
              </option>

              {brokers.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">
              Construtora
            </span>

            <select
              name="builder"
              defaultValue={
                builder
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Todas
              </option>

              {builders.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">
              NF de
            </span>

            <input
              name="from"
              type="date"
              defaultValue={
                from
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">
              NF até
            </span>

            <input
              name="to"
              type="date"
              defaultValue={
                to
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">
              Situação
            </span>

            <select
              name="situation"
              defaultValue={
                situation
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Todas
              </option>

              <option value="ATTENTION">
                Somente pendências
              </option>

              <option value="STAGE1_DONE">
                Etapa 1 consolidada
              </option>

              <option value="WAITING_STAGE2">
                Aguardando etapa 2
              </option>

              <option value="DONE">
                Principal consolidado
              </option>
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Filtrar
            </button>

            <Link
              href="/admin/financeiro/vendas"
              className="rounded-md border px-3 py-2 text-sm text-gray-600"
            >
              Limpar
            </Link>
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>
          <strong className="text-gray-700">
            {total}
          </strong>{" "}
          {total === 1
            ? "venda encontrada"
            : "vendas encontradas"}
        </div>

        <div>
          Página{" "}
          <strong>
            {page}
          </strong>{" "}
          de{" "}
          <strong>
            {pageCount}
          </strong>
        </div>
      </div>

      <SalesOverviewTable
        sales={
          paginated
        }
      />

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <div>
            {page > 1 && (
              <Link
                href={buildUrl(
                  currentFilters,
                  page - 1
                )}
                className="rounded-md border bg-white px-4 py-2 text-sm"
              >
                ← Anterior
              </Link>
            )}
          </div>

          <div className="flex gap-1">
            {Array.from(
              {
                length:
                  pageCount,
              },
              (
                _,
                index
              ) =>
                index + 1
            )
              .filter(
                (
                  number
                ) =>
                  number ===
                    1 ||
                  number ===
                    pageCount ||
                  Math.abs(
                    number -
                      page
                  ) <=
                    2
              )
              .map(
                (
                  number,
                  index,
                  array
                ) => {
                  const previous =
                    array[
                      index -
                        1
                    ];

                  return (
                    <div
                      key={
                        number
                      }
                      className="flex items-center gap-1"
                    >
                      {previous &&
                        number -
                          previous >
                          1 && (
                          <span className="px-1 text-gray-400">
                            …
                          </span>
                        )}

                      <Link
                        href={buildUrl(
                          currentFilters,
                          number
                        )}
                        className={[
                          "flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm",
                          number ===
                          page
                            ? "bg-gray-900 text-white"
                            : "bg-white",
                        ].join(
                          " "
                        )}
                      >
                        {
                          number
                        }
                      </Link>
                    </div>
                  );
                }
              )}
          </div>

          <div>
            {page <
              pageCount && (
              <Link
                href={buildUrl(
                  currentFilters,
                  page + 1
                )}
                className="rounded-md border bg-white px-4 py-2 text-sm"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}