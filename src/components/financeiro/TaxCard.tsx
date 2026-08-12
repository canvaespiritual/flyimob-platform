"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  formatBRL,
} from "@/lib/financeiro/money";

type Tax = {
  id: string;
  invoiceId: string;
  name: string;
  kind: string;
  rate: number | null;
  amount: number | null;
  status: string;
};

type InvoiceOption = {
  id: string;
  label: string;
  grossAmount: number;
};

function parsePercent(
  value: string
) {
  const parsed =
    Number(
      value
        .replace("%", "")
        .replace(",", ".")
    );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function moneyInput(
  value: number
) {
  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}

export default function TaxCard({
  invoices,
  taxes,
}: {
  invoices: InvoiceOption[];
  taxes: Tax[];
}) {
  const router = useRouter();

  const [creating, setCreating] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [invoiceId, setInvoiceId] =
    useState(
      invoices[0]?.id ?? ""
    );

  const [rate, setRate] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [
    manualAmountChanged,
    setManualAmountChanged,
  ] = useState(false);

  const selectedInvoice =
    useMemo(
      () =>
        invoices.find(
          (item) =>
            item.id ===
            invoiceId
        ) ?? null,
      [
        invoiceId,
        invoices,
      ]
    );

  function calculate(
    nextRate: string,
    targetInvoiceId =
      invoiceId
  ) {
    const invoice =
      invoices.find(
        (item) =>
          item.id ===
          targetInvoiceId
      );

    if (!invoice) {
      return 0;
    }

    return (
      invoice.grossAmount *
      (parsePercent(
        nextRate
      ) /
        100)
    );
  }

  function changeRate(
    value: string
  ) {
    setRate(value);

    if (
      !manualAmountChanged
    ) {
      setAmount(
        value
          ? moneyInput(
              calculate(value)
            )
          : ""
      );
    }
  }

  function startCreate() {
    setEditingId(null);

    setInvoiceId(
      invoices[0]?.id ??
        ""
    );

    setRate("");
    setAmount("");

    setManualAmountChanged(
      false
    );

    setCreating(true);
  }

  function startEdit(
    tax: Tax
  ) {
    setCreating(false);

    setEditingId(
      tax.id
    );

    setInvoiceId(
      tax.invoiceId
    );

    setRate(
      tax.rate != null
        ? String(tax.rate)
        : ""
    );

    setAmount(
      tax.amount != null
        ? moneyInput(
            tax.amount
          )
        : ""
    );

    setManualAmountChanged(
      false
    );
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
    taxId?: string
  ) {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget
      );

    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          taxId
            ? "/api/financeiro/impostos/update"
            : "/api/financeiro/impostos/lancamentos",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                id:
                  taxId ??
                  null,

                invoiceId,

                name:
                  String(
                    form.get(
                      "name"
                    ) || ""
                  ).trim(),

                kind:
                  String(
                    form.get(
                      "kind"
                    ) || ""
                  ),

                rate:
                  rate ||
                  null,

                amount,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao salvar imposto."
        );
      }

      setCreating(false);
      setEditingId(null);

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setLoading(false);
    }
  }

  function taxForm(
    initial?: Tax
  ) {
    return (
      <form
        onSubmit={(event) =>
          save(
            event,
            initial?.id
          )
        }
        className="space-y-3 border-b bg-gray-50 p-4"
      >
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-5">
          <select
            value={
              invoiceId
            }
            onChange={(e) => {
              const next =
                e.target.value;

              setInvoiceId(
                next
              );

              if (
                rate &&
                !manualAmountChanged
              ) {
                setAmount(
                  moneyInput(
                    calculate(
                      rate,
                      next
                    )
                  )
                );
              }
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            {invoices.map(
              (invoice) => (
                <option
                  key={
                    invoice.id
                  }
                  value={
                    invoice.id
                  }
                >
                  {
                    invoice.label
                  }
                </option>
              )
            )}
          </select>

          <input
            name="name"
            required
            defaultValue={
              initial?.name ??
              ""
            }
            placeholder="Imposto"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />

          <select
            name="kind"
            required
            defaultValue={
              initial?.kind ??
              "PAYABLE_BY_COMPANY"
            }
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="PAYABLE_BY_COMPANY">
              A separar /
              recolher
            </option>

            <option value="WITHHELD_AT_SOURCE">
              Retido na fonte
            </option>

            <option value="OTHER">
              Outro
            </option>
          </select>

          <div>
            <input
              value={rate}
              onChange={(e) =>
                changeRate(
                  e.target.value
                )
              }
              inputMode="decimal"
              placeholder="%"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />

            {rate && (
              <div className="mt-1 text-xs text-gray-500">
                Calculado:{" "}
                {formatBRL(
                  calculate(rate)
                )}
              </div>
            )}
          </div>

          <input
            value={amount}
            onChange={(e) => {
              setAmount(
                e.target.value
              );

              setManualAmountChanged(
                true
              );
            }}
            required
            inputMode="decimal"
            placeholder="Valor final"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setEditingId(null);
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            Cancelar
          </button>

          <button
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
          >
            {loading
              ? "Salvando..."
              : "Salvar imposto"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="font-medium">
            Impostos
          </div>

          <div className="text-xs text-gray-500">
            Retenção na fonte é separada do
            tributo que a operação precisa
            recolher.
          </div>
        </div>

        {invoices.length > 0 && (
          <button
            type="button"
            onClick={
              startCreate
            }
            className="rounded-md border px-3 py-2 text-sm"
          >
            Adicionar imposto
          </button>
        )}
      </div>

      {creating &&
        taxForm()}

      {invoices.length === 0 && (
        <div className="p-4 text-sm text-gray-500">
          Cadastre uma nota fiscal primeiro.
        </div>
      )}

      <div className="divide-y">
        {taxes.map((tax) =>
          editingId ===
          tax.id ? (
            <div key={tax.id}>
              {taxForm(tax)}
            </div>
          ) : (
            <div
              key={tax.id}
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <div className="font-medium">
                  {tax.name}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {tax.kind ===
                  "WITHHELD_AT_SOURCE"
                    ? "Retido na fonte"
                    : tax.kind ===
                        "PAYABLE_BY_COMPANY"
                      ? "A recolher pela Flyimob"
                      : "Outro"}

                  {tax.rate !=
                  null
                    ? ` • ${tax.rate}%`
                    : ""}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-medium">
                    {formatBRL(
                      tax.amount ||
                        0
                    )}
                  </div>

                  <div className="text-xs text-gray-500">
                    {
                      tax.status
                    }
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    startEdit(
                      tax
                    )
                  }
                  className="text-xs font-medium underline"
                >
                  Editar
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}