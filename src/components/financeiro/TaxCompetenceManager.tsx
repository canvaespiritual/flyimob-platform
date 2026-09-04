"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import FinancialAttachmentsManager from "@/components/financeiro/FinancialAttachmentsManager";

type InvoiceRow = {
  id: string;
  number: string;
  issuedAt: string | null;
  clientName: string;
  construtoraName: string;
  stageType: string;
  stageLabel: string | null;
  grossAmount: number;
  withheldAmount: number;
  expectedCash: number;
  receivedAmount: number;
  receivableAmount: number;
  provisionedTaxAmount: number;
  taxEntries: Array<{
    id: string;
    name: string;
    rate: number | null;
    amount: number;
    status: string;
  }>;
};

type Closing = {
  id: string;
  status: string;
  competenceYear: number;
  competenceMonth: number;
  provisionedAmount: number;
  separatedAmount: number;
  actualTaxAmount: number | null;
  effectiveObligation: number;
  paidAmount: number;
  adjustmentsAmount: number;
  dueDate: string;
  closedAt: string | null;
  separatedAt: string | null;
  paidAt: string | null;
  reserveAccountId: string | null;
  notes: string | null;
  paymentsHaveProof: boolean;
  amountFullyPaid: boolean;
  readyToComplete: boolean;
  movements: Array<{
    id: string;
    type: string;
    amount: number;
    occurredAt: string;
    financialAccountId: string | null;
    accountName: string | null;
    description: string | null;
    notes: string | null;
    hasPaymentProof: boolean;
  }>;
};

type Account = {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  account: string | null;
};

type HistoryItem = {
  id: string;
  year: number;
  month: number;
  label: string;
  status: string;
  provisionedAmount: number;
  actualTaxAmount: number | null;
  adjustmentsAmount: number;
  paidAmount: number;
  dueDate: string | null;
};

type Competence = {
  year: number;
  month: number;
};

const statusLabels:
  Record<string, string> =
{
  OPEN:
    "Em formação",
  CLOSED:
    "Fechada",
  SEPARATED:
    "Separada",
  PAID:
    "Paga / concluída",
  CANCELLED:
    "Cancelada",
};

const movementLabels:
  Record<string, string> =
{
  SEPARATION:
    "Separação",
  PAYMENT:
    "Pagamento",
  ADJUSTMENT:
    "Ajuste",
};

function brl(
  value: number
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style:
        "currency",
      currency:
        "BRL",
    }
  ).format(
    value || 0
  );
}

function dateBr(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "UTC",
    }
  ).format(
    new Date(
      value
    )
  );
}

function inputDate(
  value:
    | string
    | null
) {
  if (!value) {
    return "";
  }

  return value.slice(
    0,
    10
  );
}

function indexOfCompetence(
  year: number,
  month: number
) {
  return (
    year * 12 +
    month -
    1
  );
}

function fromIndex(
  index: number
) {
  return {
    year:
      Math.floor(
        index / 12
      ),
    month:
      (index % 12) +
      1,
  };
}

function competenceText(
  year: number,
  month: number
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      month:
        "long",
      year:
        "numeric",
      timeZone:
        "UTC",
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        1
      )
    )
  );
}

function statusClass(
  status: string
) {
  if (
    status ===
    "PAID"
  ) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (
    status ===
    "SEPARATED"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (
    status ===
    "CLOSED"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function TaxCompetenceManager({
  year,
  month,
  competenceLabel,
  firstCompetence,
  currentCompetence,
  invoices,
  totals,
  closing,
  accounts,
  history,
  defaultDueDate,
}: {
  year: number;
  month: number;
  competenceLabel: string;
  firstCompetence: Competence;
  currentCompetence: Competence;
  invoices: InvoiceRow[];
  totals: {
    invoiceCount: number;
    grossAmount: number;
    withheldAmount: number;
    expectedCash: number;
    receivedAmount: number;
    receivableAmount: number;
    provisionedTaxAmount: number;
  };
  closing: Closing | null;
  accounts: Account[];
  history: HistoryItem[];
  defaultDueDate: string;
}) {
  const router =
    useRouter();

  const [
    filter,
    setFilter,
  ] =
    useState<
      "ALL" |
      "RECEIVED" |
      "OPEN"
    >(
      "ALL"
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState<
      string | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const firstIndex =
    indexOfCompetence(
      firstCompetence.year,
      firstCompetence.month
    );

  const currentIndex =
    indexOfCompetence(
      currentCompetence.year,
      currentCompetence.month
    );

  const selectedIndex =
    indexOfCompetence(
      year,
      month
    );

  const competenceOptions =
    useMemo(
      () => {
        const items:
          Competence[] =
          [];

        for (
          let index =
            currentIndex;
          index >=
          firstIndex;
          index -= 1
        ) {
          items.push(
            fromIndex(
              index
            )
          );
        }

        return items;
      },
      [
        firstIndex,
        currentIndex,
      ]
    );

  const filteredInvoices =
    useMemo(
      () => {
        const term =
          search
            .trim()
            .toLowerCase();

        return invoices.filter(
          (
            invoice
          ) => {
            if (
              filter ===
                "RECEIVED" &&
              invoice.receivableAmount >
                0.009
            ) {
              return false;
            }

            if (
              filter ===
                "OPEN" &&
              invoice.receivableAmount <=
                0.009
            ) {
              return false;
            }

            if (
              !term
            ) {
              return true;
            }

            return [
              invoice.number,
              invoice.clientName,
              invoice.construtoraName,
              invoice.stageLabel ||
                "",
              invoice.stageType,
            ]
              .join(
                " "
              )
              .toLowerCase()
              .includes(
                term
              );
          }
        );
      },
      [
        invoices,
        filter,
        search,
      ]
    );

  function changeCompetence(
    nextYear: number,
    nextMonth: number
  ) {
    router.push(
      `/admin/financeiro/impostos?year=${nextYear}&month=${nextMonth}`
    );
  }

  function previousMonth() {
    if (
      selectedIndex <=
      firstIndex
    ) {
      return;
    }

    const next =
      fromIndex(
        selectedIndex -
          1
      );

    changeCompetence(
      next.year,
      next.month
    );
  }

  function nextMonth() {
    if (
      selectedIndex >=
      currentIndex
    ) {
      return;
    }

    const next =
      fromIndex(
        selectedIndex +
          1
      );

    changeCompetence(
      next.year,
      next.month
    );
  }

  async function ensureClosing() {
    setBusy(
      "ensure"
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/financeiro/impostos/fechamentos",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action:
                  "ensure",
                competenceYear:
                  year,
                competenceMonth:
                  month,
              }),
          }
        );

      const json =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          json?.error ||
            "Erro ao criar fechamento."
        );
      }

      router.refresh();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function updateClosing(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !closing ||
      closing.status ===
        "PAID"
    ) {
      return;
    }

    setBusy(
      "closing"
    );

    setError(
      null
    );

    const formData =
      new FormData(
        event.currentTarget
      );

    try {
      const response =
        await fetch(
          "/api/financeiro/impostos/fechamentos",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action:
                  "update",
                closingId:
                  closing.id,
                actualTaxAmount:
                  formData.get(
                    "actualTaxAmount"
                  ),
                dueDate:
                  formData.get(
                    "dueDate"
                  ),
                reserveAccountId:
                  formData.get(
                    "reserveAccountId"
                  ),
                notes:
                  formData.get(
                    "notes"
                  ),
              }),
          }
        );

      const json =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          json?.error ||
            "Erro ao salvar fechamento."
        );
      }

      router.refresh();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function closingAction(
    action:
      | "close"
      | "reopen"
      | "complete"
  ) {
    if (
      !closing
    ) {
      return;
    }

    const message =
      action ===
      "close"
        ? "Fechar esta competência fiscal? As notas e impostos atuais serão congelados no fechamento."
        : action ===
          "reopen"
        ? "Reabrir esta competência? Ela voltará a acompanhar os lançamentos atuais."
        : `Concluir ${competenceLabel}? Confirme o encerramento fiscal após conferir apuração, pagamentos e comprovantes.`;

    if (
      !window.confirm(
        message
      )
    ) {
      return;
    }

    setBusy(
      action
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/financeiro/impostos/fechamentos/status",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                closingId:
                  closing.id,
                action,
              }),
          }
        );

      const json =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          json?.error ||
            "Erro ao alterar situação."
        );
      }

      router.refresh();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  async function createMovement(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !closing ||
      closing.status ===
        "PAID"
    ) {
      return;
    }

    const form =
      event.currentTarget;

    const formData =
      new FormData(
        form
      );

    setBusy(
      "movement"
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/financeiro/impostos/movimentos",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                closingId:
                  closing.id,
                type:
                  formData.get(
                    "type"
                  ),
                amount:
                  formData.get(
                    "amount"
                  ),
                occurredAt:
                  formData.get(
                    "occurredAt"
                  ),
                financialAccountId:
                  formData.get(
                    "financialAccountId"
                  ),
                adjustmentCategory:
                  formData.get(
                    "adjustmentCategory"
                  ),
                description:
                  formData.get(
                    "description"
                  ),
                notes:
                  formData.get(
                    "notes"
                  ),
              }),
          }
        );

      const json =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          json?.error ||
            "Erro ao registrar movimentação."
        );
      }

      form.reset();

      router.refresh();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setBusy(
        null
      );
    }
  }

  const concluded =
    closing?.status ===
    "PAID";

  const obligation =
    closing?.effectiveObligation ??
    totals.provisionedTaxAmount;

  const remainingTax =
    Math.max(
      0,
      obligation -
        (
          closing?.paidAmount ||
          0
        )
    );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500">
            Competência fiscal
          </div>

          <h1 className="mt-1 text-2xl font-semibold capitalize text-gray-950">
            {competenceLabel}
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            A competência acompanha as notas emitidas no mês.
            Recebimento financeiro e pagamento do DAS continuam
            independentes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={`${year}-${month}`}
            onChange={
              (
                event
              ) => {
                const [
                  nextYear,
                  nextMonth,
                ] =
                  event.target.value
                    .split(
                      "-"
                    )
                    .map(
                      Number
                    );

                changeCompetence(
                  nextYear,
                  nextMonth
                );
              }
            }
            className="min-w-52 rounded-lg border bg-white px-3 py-2 text-sm font-medium capitalize"
          >
            {competenceOptions.map(
              (
                item
              ) => (
                <option
                  key={`${item.year}-${item.month}`}
                  value={`${item.year}-${item.month}`}
                >
                  {competenceText(
                    item.year,
                    item.month
                  )}
                </option>
              )
            )}
          </select>

          <button
            type="button"
            onClick={
              previousMonth
            }
            disabled={
              selectedIndex <=
              firstIndex
            }
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Anterior
          </button>

          <button
            type="button"
            onClick={
              nextMonth
            }
            disabled={
              selectedIndex >=
              currentIndex
            }
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima →
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Notas emitidas"
          value={
            String(
              totals.invoiceCount
            )
          }
          detail={
            brl(
              totals.grossAmount
            ) +
            " faturados"
          }
        />

        <Metric
          label="Recebido"
          value={
            brl(
              totals.receivedAmount
            )
          }
          detail={
            brl(
              totals.receivableAmount
            ) +
            " ainda a receber"
          }
        />

        <Metric
          label="Imposto provisionado"
          value={
            brl(
              totals.provisionedTaxAmount
            )
          }
          detail={
            totals.withheldAmount >
            0
              ? brl(
                  totals.withheldAmount
                ) +
                " retido na fonte"
              : "Tributo da empresa nas NFs"
          }
        />

        <Metric
          label="Obrigação fiscal"
          value={
            brl(
              obligation
            )
          }
          detail={
            concluded
              ? "Competência concluída"
              : closing
              ? brl(
                  remainingTax
                ) +
                " ainda não pago"
              : "Crie o fechamento para apurar"
          }
        />
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Notas da competência
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Faturamento bruto, entrada financeira e provisão
                tributária por nota.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={
                  filter
                }
                onChange={
                  (
                    event
                  ) =>
                    setFilter(
                      event.target.value as
                        | "ALL"
                        | "RECEIVED"
                        | "OPEN"
                    )
                }
                className="rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <option value="ALL">
                  Todas
                </option>
                <option value="RECEIVED">
                  Recebidas
                </option>
                <option value="OPEN">
                  A receber
                </option>
              </select>

              <input
                value={
                  search
                }
                onChange={
                  (
                    event
                  ) =>
                    setSearch(
                      event.target.value
                    )
                }
                placeholder="NF, cliente ou construtora"
                className="min-w-64 rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">
                  NF
                </th>
                <th className="px-4 py-3">
                  Emissão
                </th>
                <th className="px-4 py-3">
                  Cliente
                </th>
                <th className="px-4 py-3">
                  Construtora
                </th>
                <th className="px-4 py-3">
                  Etapa
                </th>
                <th className="px-4 py-3 text-right">
                  Faturado
                </th>
                <th className="px-4 py-3 text-right">
                  Recebido
                </th>
                <th className="px-4 py-3 text-right">
                  A receber
                </th>
                <th className="px-4 py-3 text-right">
                  Imposto
                </th>
                <th className="px-4 py-3">
                  Arquivo
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filteredInvoices.map(
                (
                  invoice
                ) => (
                  <tr
                    key={
                      invoice.id
                    }
                    className="align-top"
                  >
                    <td className="px-4 py-3 font-medium text-gray-950">
                      {invoice.number}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {dateBr(
                        invoice.issuedAt
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {invoice.clientName}
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      {invoice.construtoraName}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {invoice.stageLabel ||
                          invoice.stageType}
                      </div>

                      {invoice.stageLabel && (
                        <div className="mt-0.5 text-xs text-gray-500">
                          {invoice.stageType}
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {brl(
                        invoice.grossAmount
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right text-green-700">
                      {brl(
                        invoice.receivedAmount
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {brl(
                        invoice.receivableAmount
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="font-medium">
                        {brl(
                          invoice.provisionedTaxAmount
                        )}
                      </div>

                      {invoice.taxEntries.length >
                        0 && (
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {invoice.taxEntries
                            .map(
                              (
                                tax
                              ) =>
                                tax.rate !==
                                null
                                  ? `${tax.name} ${tax.rate}%`
                                  : tax.name
                            )
                            .join(
                              " • "
                            )}
                        </div>
                      )}
                    </td>

                    <td className="min-w-64 px-4 py-3">
                      <FinancialAttachmentsManager
                        entityType="INVOICE"
                        entityId={
                          invoice.id
                        }
                        attachmentType="INVOICE"
                        title="Arquivo da NF"
                        compact
                      />
                    </td>
                  </tr>
                )
              )}

              {filteredInvoices.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      10
                    }
                    className="px-4 py-10 text-center text-sm text-gray-500"
                  >
                    Nenhuma nota encontrada para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!closing ? (
        <section className="rounded-xl border border-dashed bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">
            Fechamento fiscal ainda não criado
          </h2>

          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500">
            O sistema vai registrar a competência, trazer a provisão
            atual das NFs e preparar o controle fiscal sem alterar
            nenhum imposto já gravado nas vendas.
          </p>

          <button
            type="button"
            disabled={
              busy !==
              null
            }
            onClick={
              ensureClosing
            }
            className="mt-4 rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ===
            "ensure"
              ? "Criando..."
              : "Criar fechamento da competência"}
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-xl border bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    Fechamento fiscal
                  </h2>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(
                      closing.status
                    )}`}
                  >
                    {statusLabels[
                      closing.status
                    ] ||
                      closing.status}
                  </span>
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  Provisionado é o cálculo das NFs. Apurado é o
                  valor real informado pelo contador.
                </p>
              </div>

              {!concluded && (
                <div className="flex gap-2">
                  {closing.status ===
                    "OPEN" && (
                    <button
                      type="button"
                      disabled={
                        busy !==
                        null
                      }
                      onClick={() =>
                        closingAction(
                          "close"
                        )
                      }
                      className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Fechar competência
                    </button>
                  )}

                  {closing.status !==
                    "OPEN" &&
                    closing.movements.length ===
                      0 && (
                      <button
                        type="button"
                        disabled={
                          busy !==
                          null
                        }
                        onClick={() =>
                          closingAction(
                            "reopen"
                          )
                        }
                        className="rounded-lg border px-4 py-2 text-sm font-medium"
                      >
                        Reabrir
                      </button>
                    )}
                </div>
              )}
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Provisionado"
                value={
                  brl(
                    closing.provisionedAmount
                  )
                }
                detail="Snapshot do fechamento"
              />

              <Metric
                label="Apurado"
                value={
                  closing.actualTaxAmount !==
                  null
                    ? brl(
                        closing.actualTaxAmount
                      )
                    : "Não informado"
                }
                detail="Tributo real, sem multa/juros"
              />

              <Metric
                label="Separado"
                value={
                  brl(
                    closing.separatedAmount
                  )
                }
                detail="Movimentos de reserva"
              />

              <Metric
                label="Pago"
                value={
                  brl(
                    closing.paidAmount
                  )
                }
                detail={
                  concluded
                    ? "Encerrado"
                    : brl(
                        remainingTax
                      ) +
                      " restante"
                }
              />
            </div>

            {concluded ? (
              <div className="border-t bg-green-50 px-5 py-4">
                <div className="font-semibold text-green-800">
                  Competência concluída
                </div>

                <div className="mt-1 text-sm text-green-700">
                  A obrigação fiscal foi integralmente paga e o
                  encerramento desta competência está confirmado.
                </div>
              </div>
            ) : (
              <form
                onSubmit={
                  updateClosing
                }
                className="grid gap-4 border-t bg-gray-50 p-5 lg:grid-cols-4"
              >
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">
                    Valor real apurado
                  </span>

                  <input
                    name="actualTaxAmount"
                    defaultValue={
                      closing.actualTaxAmount ??
                      ""
                    }
                    placeholder="0,00"
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">
                    Vencimento
                  </span>

                  <input
                    name="dueDate"
                    type="date"
                    defaultValue={
                      inputDate(
                        closing.dueDate ||
                          defaultDueDate
                      )
                    }
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">
                    Conta de reserva
                  </span>

                  <select
                    name="reserveAccountId"
                    defaultValue={
                      closing.reserveAccountId ||
                      ""
                    }
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  >
                    <option value="">
                      Não definida
                    </option>

                    {accounts.map(
                      (
                        account
                      ) => (
                        <option
                          key={
                            account.id
                          }
                          value={
                            account.id
                          }
                        >
                          {account.name}
                          {account.type ===
                          "TAX_RESERVE"
                            ? " • reserva fiscal"
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="space-y-1 lg:col-span-4">
                  <span className="text-xs font-medium text-gray-600">
                    Observações
                  </span>

                  <textarea
                    name="notes"
                    defaultValue={
                      closing.notes ||
                      ""
                    }
                    rows={
                      2
                    }
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  />
                </label>

                <div className="lg:col-span-4">
                  <button
                    disabled={
                      busy !==
                      null
                    }
                    className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ===
                    "closing"
                      ? "Salvando..."
                      : "Salvar apuração"}
                  </button>
                </div>
              </form>
            )}
          </section>

          {!concluded &&
            closing.status !==
              "OPEN" &&
            closing.amountFullyPaid && (
              <section
                className={`rounded-xl border p-5 shadow-sm ${
                  closing.readyToComplete
                    ? "border-green-200 bg-green-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3
                      className={`font-semibold ${
                        closing.readyToComplete
                          ? "text-green-900"
                          : "text-amber-900"
                      }`}
                    >
                      {closing.readyToComplete
                        ? "Competência pronta para concluir"
                        : "Pagamento bateu; falta validar os comprovantes"}
                    </h3>

                    <p
                      className={`mt-1 text-sm ${
                        closing.readyToComplete
                          ? "text-green-700"
                          : "text-amber-700"
                      }`}
                    >
                      Obrigação efetiva{" "}
                      {brl(
                        closing.effectiveObligation
                      )}{" "}
                      • Pago{" "}
                      {brl(
                        closing.paidAmount
                      )}
                      {!closing.paymentsHaveProof &&
                        " • Existe pagamento sem comprovante anexado."}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      busy !==
                      null
                    }
                    onClick={() =>
                      closingAction(
                        "complete"
                      )
                    }
                    className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ===
                    "complete"
                      ? "Concluindo..."
                      : "Concluir competência"}
                  </button>
                </div>
              </section>
            )}

          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-lg font-semibold">
                  Movimentações fiscais
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Histórico de reservas, pagamentos e ajustes fiscais.
                </p>
              </div>

              <div className="divide-y">
                {closing.movements.map(
                  (
                    movement
                  ) => (
                    <div
                      key={
                        movement.id
                      }
                      className="p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium text-gray-950">
                            {movementLabels[
                              movement.type
                            ] ||
                              movement.type}
                            {movement.description
                              ? ` • ${movement.description}`
                              : ""}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {dateBr(
                              movement.occurredAt
                            )}
                            {movement.accountName
                              ? ` • ${movement.accountName}`
                              : ""}
                          </div>
                        </div>

                        <div className="text-base font-semibold">
                          {brl(
                            movement.amount
                          )}
                        </div>
                      </div>

                      {movement.notes && (
                        <div className="mt-2 text-sm text-gray-600">
                          {movement.notes}
                        </div>
                      )}

                      {movement.type ===
                        "PAYMENT" && (
                        <div className="mt-3">
                          <FinancialAttachmentsManager
                            entityType="TAX_MOVEMENT"
                            entityId={
                              movement.id
                            }
                            attachmentType="TAX_PAYMENT"
                            title="Comprovante deste pagamento"
                            compact
                            readOnly={
                              concluded
                            }
                            onChanged={() =>
                              router.refresh()
                            }
                          />
                        </div>
                      )}
                    </div>
                  )
                )}

                {closing.movements.length ===
                  0 && (
                  <div className="p-6 text-sm text-gray-500">
                    Nenhuma movimentação registrada.
                  </div>
                )}
              </div>

              {!concluded && (
                <form
                  onSubmit={
                    createMovement
                  }
                  className="grid gap-3 border-t bg-gray-50 p-5 md:grid-cols-2"
                >
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">
                      Tipo
                    </span>

                    <select
                      name="type"
                      required
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    >
                      <option value="SEPARATION">
                        Separação / reserva
                      </option>
                      <option value="PAYMENT">
                        Pagamento de imposto
                      </option>
                      <option value="ADJUSTMENT">
                        Multa, juros ou ajuste
                      </option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">
                      Valor
                    </span>

                    <input
                      name="amount"
                      required
                      placeholder="0,00"
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">
                      Data
                    </span>

                    <input
                      name="occurredAt"
                      type="date"
                      required
                      defaultValue={
                        new Date()
                          .toISOString()
                          .slice(
                            0,
                            10
                          )
                      }
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">
                      Conta
                    </span>

                    <select
                      name="financialAccountId"
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    >
                      <option value="">
                        Não informada
                      </option>

                      {accounts.map(
                        (
                          account
                        ) => (
                          <option
                            key={
                              account.id
                            }
                            value={
                              account.id
                            }
                          >
                            {account.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">
                      Categoria do ajuste
                    </span>

                    <select
                      name="adjustmentCategory"
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    >
                      <option value="">
                        Não se aplica
                      </option>
                      <option value="MULTA">
                        Multa
                      </option>
                      <option value="JUROS">
                        Juros
                      </option>
                      <option value="CORRECAO">
                        Correção
                      </option>
                      <option value="OUTRO">
                        Outro
                      </option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">
                      Descrição
                    </span>

                    <input
                      name="description"
                      placeholder={`Ex.: DAS ${String(
                        month
                      ).padStart(
                        2,
                        "0"
                      )}/${year}`}
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-gray-600">
                      Observações
                    </span>

                    <textarea
                      name="notes"
                      rows={
                        2
                      }
                      className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="md:col-span-2">
                    <button
                      disabled={
                        busy !==
                        null
                      }
                      className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busy ===
                      "movement"
                        ? "Registrando..."
                        : "Registrar movimentação"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="space-y-5">
              <FinancialAttachmentsManager
                entityType="TAX_CLOSING"
                entityId={
                  closing.id
                }
                attachmentType="TAX_DOCUMENT"
                title="Documentos da competência"
                readOnly={
                  concluded
                }
              />

              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-950">
                  Leitura gerencial
                </h3>

                <div className="mt-4 space-y-3 text-sm">
                  <Row
                    label="Faturamento bruto"
                    value={
                      brl(
                        totals.grossAmount
                      )
                    }
                  />
                  <Row
                    label="Recebimento financeiro"
                    value={
                      brl(
                        totals.receivedAmount
                      )
                    }
                  />
                  <Row
                    label="Ainda a receber"
                    value={
                      brl(
                        totals.receivableAmount
                      )
                    }
                  />
                  <Row
                    label="Provisão tributária"
                    value={
                      brl(
                        totals.provisionedTaxAmount
                      )
                    }
                  />
                  <Row
                    label="Ajustes fiscais"
                    value={
                      brl(
                        closing.adjustmentsAmount
                      )
                    }
                  />
                  <Row
                    label="Obrigação efetiva"
                    value={
                      brl(
                        closing.effectiveObligation
                      )
                    }
                    strong
                  />
                  <Row
                    label="Pago"
                    value={
                      brl(
                        closing.paidAmount
                      )
                    }
                    strong
                  />
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">
            Histórico de competências
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Clique em qualquer competência para abrir o histórico.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">
                  Competência
                </th>
                <th className="px-4 py-3">
                  Situação
                </th>
                <th className="px-4 py-3 text-right">
                  Provisionado
                </th>
                <th className="px-4 py-3 text-right">
                  Apurado
                </th>
                <th className="px-4 py-3 text-right">
                  Ajustes
                </th>
                <th className="px-4 py-3 text-right">
                  Pago
                </th>
                <th className="px-4 py-3">
                  Vencimento
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {history.map(
                (
                  item
                ) => (
                  <tr
                    key={
                      item.id
                    }
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() =>
                      changeCompetence(
                        item.year,
                        item.month
                      )
                    }
                  >
                    <td className="px-4 py-3 font-medium capitalize">
                      {item.label}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass(
                          item.status
                        )}`}
                      >
                        {statusLabels[
                          item.status
                        ] ||
                          item.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {brl(
                        item.provisionedAmount
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {item.actualTaxAmount !==
                      null
                        ? brl(
                            item.actualTaxAmount
                          )
                        : "—"}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {brl(
                        item.adjustmentsAmount
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {brl(
                        item.paidAmount
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {dateBr(
                        item.dueDate
                      )}
                    </td>
                  </tr>
                )
              )}

              {history.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      7
                    }
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Nenhum fechamento fiscal registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-gray-950">
        {value}
      </div>

      <div className="mt-1 text-xs text-gray-500">
        {detail}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-gray-600">
        {label}
      </span>

      <span
        className={
          strong
            ? "font-semibold text-gray-950"
            : "font-medium text-gray-950"
        }
      >
        {value}
      </span>
    </div>
  );
}