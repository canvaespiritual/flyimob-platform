import Link from "next/link";

import {
  formatBRL,
} from "@/lib/financeiro/money";

import FinancialStatusBadge from "./FinancialStatusBadge";

type SaleRow = {
  id: string;
  clientName: string;

  saleDate:
    | Date
    | null;

  vgv:
    | unknown
    | null;

  commissionFinalAmount:
    | unknown
    | null;

  status:
    | "OPEN"
    | "PARTIAL"
    | "RESOLVED"
    | "CANCELLED";

  construtora: {
    name: string;
  } | null;

  empreendimento: {
    name: string;
  } | null;

  construtoraNameManual:
    | string
    | null;

  empreendimentoNameManual:
    | string
    | null;

  stages: Array<{
    id: string;
    status: string;
  }>;
};

export default function SaleList({
  sales,
}: {
  sales: SaleRow[];
}) {
  if (
    sales.length === 0
  ) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center">
        <div className="font-medium text-gray-900">
          Nenhuma venda cadastrada
        </div>

        <p className="mt-2 text-sm text-gray-500">
          Cadastre a primeira operação
          financeira.
        </p>

        <Link
          href="/admin/financeiro/vendas/nova"
          className="mt-4 inline-flex rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Nova venda
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Cliente
              </th>

              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Construtora / empreendimento
              </th>

              <th className="px-4 py-3 text-right font-medium text-gray-600">
                VGV
              </th>

              <th className="px-4 py-3 text-right font-medium text-gray-600">
                Comissão
              </th>

              <th className="px-4 py-3 text-center font-medium text-gray-600">
                Etapas
              </th>

              <th className="px-4 py-3 text-center font-medium text-gray-600">
                Status
              </th>

              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y">
            {sales.map(
              (sale) => {
                const builder =
                  sale.construtora
                    ?.name ||
                  sale.construtoraNameManual ||
                  "—";

                const project =
                  sale.empreendimento
                    ?.name ||
                  sale.empreendimentoNameManual ||
                  "—";

                const resolvedStages =
                  sale.stages.filter(
                    (stage) =>
                      stage.status ===
                      "RESOLVED"
                  ).length;

                let tone:
                  | "gray"
                  | "yellow"
                  | "green"
                  | "red" =
                  "gray";

                let label =
                  "Aberta";

                if (
                  sale.status ===
                  "PARTIAL"
                ) {
                  tone =
                    "yellow";
                  label =
                    "Parcial";
                }

                if (
                  sale.status ===
                  "RESOLVED"
                ) {
                  tone =
                    "green";
                  label =
                    "Resolvida";
                }

                if (
                  sale.status ===
                  "CANCELLED"
                ) {
                  tone =
                    "red";
                  label =
                    "Cancelada";
                }

                return (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">
                        {sale.clientName}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {sale.saleDate
                          ? new Intl.DateTimeFormat(
                              "pt-BR"
                            ).format(
                              new Date(
                                sale.saleDate
                              )
                            )
                          : "Sem data"}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="text-gray-900">
                        {builder}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {project}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right text-gray-900">
                      {sale.vgv
                        ? formatBRL(
                            sale.vgv as never
                          )
                        : "—"}
                    </td>

                    <td className="px-4 py-4 text-right font-medium text-gray-900">
                      {sale.commissionFinalAmount
                        ? formatBRL(
                            sale.commissionFinalAmount as never
                          )
                        : "—"}
                    </td>

                    <td className="px-4 py-4 text-center">
                      {resolvedStages}/
                      {
                        sale.stages
                          .length
                      }
                    </td>

                    <td className="px-4 py-4 text-center">
                      <FinancialStatusBadge
                        label={label}
                        tone={tone}
                      />
                    </td>

                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/admin/financeiro/vendas/${sale.id}`}
                        className="font-medium text-gray-700 hover:text-gray-900"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}