"use client";

import Link from "next/link";
import { useState } from "react";

import { formatBRL } from "@/lib/financeiro/money";

export type SalesOverviewStage = {
  id: string;
  type: string;
  label: string | null;

  visualStatus:
    | "CONSOLIDATED"
    | "PENDING"
    | "WAITING"
    | "CANCELLED";

  pendingLabels: string[];

  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceGross: number;

  receivedAmount: number;
  receivedDate: string | null;

  withheldTax: number;
  payableTax: number;
  totalTax: number;

  companyNet: number;
  companyNetLabel:
    | "REALIZADO"
    | "PROJETADO";

  participants: Array<{
    id: string;
    name: string;
    role: string;
    amount: number;

    status:
      | "PAID"
      | "PARTIAL"
      | "OPEN"
      | "CANCELLED";
  }>;
};

export type SalesOverviewRow = {
  id: string;

  clientName: string;

  brokerName: string;

  construtoraName: string | null;
  empreendimentoName: string | null;

  block: string | null;
  unit: string | null;

  saleDate: string | null;

  vgv: number | null;
  commission: number | null;

  companyNet: number | null;

  companyNetLabel:
    | "REALIZADO"
    | "PROJETADO"
    | "SEM_BASE";

  stage1: SalesOverviewStage | null;
  stage2: SalesOverviewStage | null;

  extraStages: SalesOverviewStage[];

  latestInvoiceDate: string | null;
};

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone: "UTC",
    }
  ).format(
    new Date(value)
  );
}

function roleLabel(
  role: string
) {
  switch (role) {
    case "BROKER":
      return "Corretor";

    case "MANAGER":
      return "Gerente";

    case "FILE_OPERATOR":
      return "Operador";

    case "MARKETING":
      return "Marketing";

    case "INDICATOR":
      return "Indicador";

    case "CLOSER":
      return "Fechamento";

    case "BONUS":
      return "Bônus";

    default:
      return role;
  }
}

function participantStatusLabel(
  status: string
) {
  switch (status) {
    case "PAID":
      return "Pago";

    case "PARTIAL":
      return "Parcial";

    case "OPEN":
      return "Pendente";

    case "CANCELLED":
      return "Cancelado";

    default:
      return status;
  }
}

function StageStatus({
  stage,
}: {
  stage:
    | SalesOverviewStage
    | null;
}) {
  if (!stage) {
    return (
      <div className="text-xs text-gray-400">
        —
      </div>
    );
  }

  if (
    stage.visualStatus ===
    "CONSOLIDATED"
  ) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Consolidada
      </div>
    );
  }

  if (
    stage.visualStatus ===
    "WAITING"
  ) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-500">
        <span className="h-2 w-2 rounded-full bg-gray-300" />
        Aguardando
      </div>
    );
  }

  if (
    stage.visualStatus ===
    "CANCELLED"
  ) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-500">
        Cancelada
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {stage.pendingLabels.map(
        (pending, index) => (
          <div
            key={`${pending}-${index}`}
            className="flex items-start gap-1.5 text-xs font-medium text-yellow-800"
          >
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />

            <span>
              {pending}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function ParticipantStatus({
  status,
}: {
  status: string;
}) {
  if (
    status === "PAID"
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Pago
      </span>
    );
  }

  if (
    status === "PARTIAL"
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
        Parcial
      </span>
    );
  }

  if (
    status === "CANCELLED"
  ) {
    return (
      <span className="text-xs text-gray-400">
        Cancelado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700">
      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
      Pendente
    </span>
  );
}

function StageDetail({
  stage,
}: {
  stage: SalesOverviewStage;
}) {
  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="font-medium text-gray-900">
            {stage.label ||
              (stage.type ===
              "ATO"
                ? "Ato"
                : stage.type ===
                    "BANCO"
                  ? "Assinatura banco"
                  : stage.type)}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            {stage.type}
          </div>
        </div>

        <StageStatus
          stage={stage}
        />
      </div>

      <div className="grid gap-4 border-b bg-gray-50 px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="text-[11px] uppercase text-gray-400">
            Nota fiscal
          </div>

          <div className="mt-1 text-sm font-medium">
            {stage.invoiceNumber
              ? `NF ${stage.invoiceNumber}`
              : "—"}
          </div>

          <div className="text-xs text-gray-500">
            {formatDate(
              stage.invoiceDate
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase text-gray-400">
            Bruto
          </div>

          <div className="mt-1 text-sm font-medium">
            {formatBRL(
              stage.invoiceGross
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase text-gray-400">
            Recebido
          </div>

          <div className="mt-1 text-sm font-medium">
            {formatBRL(
              stage.receivedAmount
            )}
          </div>

          <div className="text-xs text-gray-500">
            {formatDate(
              stage.receivedDate
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase text-gray-400">
            Impostos
          </div>

          <div className="mt-1 text-sm font-medium">
            {formatBRL(
              stage.totalTax
            )}
          </div>

          <div className="text-xs text-gray-500">
            Retido{" "}
            {formatBRL(
              stage.withheldTax
            )}{" "}
            • Futuro{" "}
            {formatBRL(
              stage.payableTax
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase text-gray-400">
            Líquido Flyimob
          </div>

          <div className="mt-1 text-sm font-semibold">
            {formatBRL(
              stage.companyNet
            )}
          </div>

          <div className="text-[10px] font-medium text-gray-400">
            {
              stage.companyNetLabel
            }
          </div>
        </div>
      </div>

      <div>
        <div className="border-b px-4 py-2 text-[11px] font-medium uppercase text-gray-400">
          Participantes
        </div>

        {stage.participants.length ===
        0 ? (
          <div className="px-4 py-3 text-xs text-gray-500">
            Nenhum participante
            cadastrado nesta etapa.
          </div>
        ) : (
          <div className="divide-y">
            {stage.participants.map(
              (
                participant
              ) => (
                <div
                  key={
                    participant.id
                  }
                  className="grid items-center gap-2 px-4 py-2 text-sm sm:grid-cols-[1fr_140px_120px]"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {
                        participant.name
                      }
                    </span>

                    <span className="ml-2 text-xs text-gray-400">
                      {roleLabel(
                        participant.role
                      )}
                    </span>
                  </div>

                  <div className="font-medium">
                    {formatBRL(
                      participant.amount
                    )}
                  </div>

                  <ParticipantStatus
                    status={
                      participant.status
                    }
                  />
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalesOverviewTable({
  sales,
}: {
  sales: SalesOverviewRow[];
}) {
  const [
    expandedId,
    setExpandedId,
  ] =
    useState<
      string | null
    >(null);

  if (
    sales.length === 0
  ) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-500">
        Nenhuma venda encontrada
        para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="hidden grid-cols-[34px_1.15fr_1fr_1.6fr_.8fr_.8fr_.9fr_1.1fr_1.1fr_.75fr_58px] gap-3 border-b bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 xl:grid">
        <div />

        <div>
          Cliente
        </div>

        <div>
          Corretor
        </div>

        <div>
          Construtora /
          empreendimento
        </div>

        <div>
          VGV
        </div>

        <div>
          Comissão
        </div>

        <div>
          Líq. Flyimob
        </div>

        <div>
          Etapa 1
        </div>

        <div>
          Etapa 2
        </div>

        <div>
          Última NF
        </div>

        <div />
      </div>

      <div className="divide-y">
        {sales.map(
          (sale) => {
            const expanded =
              expandedId ===
              sale.id;

            return (
              <div
                key={sale.id}
                className={
                  expanded
                    ? "bg-gray-50/40"
                    : "bg-white"
                }
              >
                <div className="grid gap-3 px-3 py-3 xl:grid-cols-[34px_1.15fr_1fr_1.6fr_.8fr_.8fr_.9fr_1.1fr_1.1fr_.75fr_58px] xl:items-center">
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(
                          expanded
                            ? null
                            : sale.id
                        )
                      }
                      className="flex h-7 w-7 items-center justify-center rounded border bg-white text-xs hover:bg-gray-50"
                      aria-label={
                        expanded
                          ? "Recolher venda"
                          : "Expandir venda"
                      }
                    >
                      {expanded
                        ? "⌄"
                        : "›"}
                    </button>
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {
                        sale.clientName
                      }
                    </div>

                    <div className="mt-0.5 text-[11px] text-gray-400">
                      Venda{" "}
                      {formatDate(
                        sale.saleDate
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-800">
                      {
                        sale.brokerName
                      }
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-800">
                      {sale.construtoraName ||
                        "Construtora não informada"}
                    </div>

                    <div className="truncate text-[11px] text-gray-400">
                      {sale.empreendimentoName ||
                        "Empreendimento não informado"}

                      {(sale.block ||
                        sale.unit) &&
                        ` • ${
                          sale.block
                            ? `Bl. ${sale.block}`
                            : ""
                        } ${
                          sale.unit
                            ? `Un. ${sale.unit}`
                            : ""
                        }`}
                    </div>
                  </div>

                  <div className="text-sm font-medium">
                    {sale.vgv !=
                    null
                      ? formatBRL(
                          sale.vgv
                        )
                      : "—"}
                  </div>

                  <div className="text-sm font-medium">
                    {sale.commission !=
                    null
                      ? formatBRL(
                          sale.commission
                        )
                      : "—"}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {sale.companyNet !=
                      null
                        ? formatBRL(
                            sale.companyNet
                          )
                        : "—"}
                    </div>

                    <div className="text-[9px] font-semibold tracking-wide text-gray-400">
                      {
                        sale.companyNetLabel
                      }
                    </div>
                  </div>

                  <div>
                    <StageStatus
                      stage={
                        sale.stage1
                      }
                    />
                  </div>

                  <div>
                    <StageStatus
                      stage={
                        sale.stage2
                      }
                    />
                  </div>

                  <div className="text-xs text-gray-600">
                    {formatDate(
                      sale.latestInvoiceDate
                    )}
                  </div>

                  <div className="text-right">
                    <Link
                      href={`/admin/financeiro/vendas/${sale.id}`}
                      className="text-xs font-medium text-gray-700 underline"
                    >
                      Abrir
                    </Link>
                  </div>
                </div>

                {sale.extraStages.length >
                  0 && (
                  <div className="border-t border-dashed bg-gray-50 px-12 py-1.5 text-[11px] text-gray-500">
                    {sale.extraStages.some(
                      (stage) =>
                        stage.visualStatus ===
                        "PENDING"
                    )
                      ? "🟡 "
                      : "+ "}

                    Venda contém{" "}
                    {
                      sale.extraStages
                        .length
                    }{" "}
                    {sale.extraStages
                      .length === 1
                      ? "lançamento extra"
                      : "lançamentos extras"}

                    {" • "}

                    {formatBRL(
                      sale.extraStages.reduce(
                        (
                          total,
                          stage
                        ) =>
                          total +
                          stage.invoiceGross,
                        0
                      )
                    )}
                  </div>
                )}

                {expanded && (
                  <div className="space-y-3 border-t bg-gray-50 p-4">
                    <div className="grid gap-3 xl:grid-cols-2">
                      {sale.stage1 && (
                        <StageDetail
                          stage={
                            sale.stage1
                          }
                        />
                      )}

                      {sale.stage2 && (
                        <StageDetail
                          stage={
                            sale.stage2
                          }
                        />
                      )}
                    </div>

                    {sale.extraStages.length >
                      0 && (
                      <details className="rounded-lg border bg-white">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
                          Premiações,
                          complementos e
                          extras (
                          {
                            sale.extraStages
                              .length
                          }
                          )
                        </summary>

                        <div className="grid gap-3 border-t bg-gray-50 p-3 xl:grid-cols-2">
                          {sale.extraStages.map(
                            (
                              stage
                            ) => (
                              <StageDetail
                                key={
                                  stage.id
                                }
                                stage={
                                  stage
                                }
                              />
                            )
                          )}
                        </div>
                      </details>
                    )}

                    <div className="flex justify-end">
                      <Link
                        href={`/admin/financeiro/vendas/${sale.id}`}
                        className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white"
                      >
                        Abrir venda
                        completa →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}