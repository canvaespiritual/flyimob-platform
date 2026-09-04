"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  formatBRL,
} from "@/lib/financeiro/money";

type Tax = {
  id: string;
  name: string;

  amount:
    | number
    | null;

  rate:
    | number
    | null;

  status: string;
};

function moneyInput(
  value: number
) {
  return value.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  );
}

export default function StageSettlementActions({
  stageId,
  taxes,
  cashDifference,
}: {
  stageId: string;

  taxes: Tax[];

  cashDifference: number;
}) {
  const router =
    useRouter();

  const [
    loadingId,
    setLoadingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    appropriating,
    setAppropriating,
  ] =
    useState(false);

  const [
    savingAllocation,
    setSavingAllocation,
  ] =
    useState(false);

  const [
    reopeningAllocation,
    setReopeningAllocation,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const payableTaxes =
    taxes.filter(
      (tax) =>
        tax.status !==
        "CANCELLED"
    );

  async function updateTax(
    taxId: string,
    action:
      | "SEPARATE"
      | "PAY"
  ) {
    const label =
      action ===
      "SEPARATE"
        ? "separado"
        : "pago";

    const confirmed =
      window.confirm(
        `Marcar este imposto como ${label}?`
      );

    if (!confirmed) {
      return;
    }

    setLoadingId(
      taxId
    );

    setError(null);

    try {
      const response =
        await fetch(
          "/api/financeiro/impostos/status",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                taxId,

                action,

                date:
                  new Date()
                    .toISOString()
                    .slice(
                      0,
                      10
                    ),
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ||
            "Erro ao atualizar imposto."
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
      setLoadingId(
        null
      );
    }
  }

  async function saveAllocation(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget
      );

    setSavingAllocation(
      true
    );

    setError(null);

    try {
      const response =
        await fetch(
          "/api/financeiro/apropriacoes",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                stageId,

                amount:
                  String(
                    form.get(
                      "amount"
                    ) || ""
                  ),

                appropriatedAt:
                  String(
                    form.get(
                      "appropriatedAt"
                    ) || ""
                  ),

                notes:
                  String(
                    form.get(
                      "notes"
                    ) || ""
                  ).trim() ||
                  null,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ||
            "Erro ao apropriar líquido."
        );
      }

      setAppropriating(
        false
      );

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
      setSavingAllocation(
        false
      );
    }
  }

  async function reopenAllocation() {
    const confirmed =
      window.confirm(
        "Reabrir a apropriação desta etapa? A apropriação ativa será cancelada para efeito de cálculo, o histórico será preservado e o saldo será recalculado."
      );

    if (!confirmed) {
      return;
    }

    setReopeningAllocation(
      true
    );

    setError(null);

    try {
      const response =
        await fetch(
          "/api/financeiro/apropriacoes/reabrir",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                stageId,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ||
            "Erro ao reabrir apropriação."
        );
      }

      setAppropriating(
        false
      );

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
      setReopeningAllocation(
        false
      );
    }
  }

  const hasExcessAllocation =
    cashDifference <
    -0.01;

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <div className="font-medium text-gray-900">
          Liquidação da etapa
        </div>

        <div className="mt-1 text-xs text-gray-500">
          Separe os impostos e
          aproprie o saldo restante
          para fechar a conciliação.
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {payableTaxes.length >
        0 && (
        <div className="divide-y border-b">
          {payableTaxes.map(
            (tax) => (
              <div
                key={
                  tax.id
                }
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <div className="font-medium">
                    {
                      tax.name
                    }
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    {tax.rate !=
                    null
                      ? `${tax.rate}% • `
                      : ""}
                    {
                      tax.status
                    }
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="font-medium">
                    {formatBRL(
                      tax.amount ||
                        0
                    )}
                  </div>

                  {tax.status ===
                    "PENDING" ||
                  tax.status ===
                    "PROVISIONED" ? (
                    <button
                      type="button"
                      disabled={
                        loadingId ===
                        tax.id
                      }
                      onClick={() =>
                        updateTax(
                          tax.id,
                          "SEPARATE"
                        )
                      }
                      className="rounded-md border px-3 py-2 text-xs"
                    >
                      {loadingId ===
                      tax.id
                        ? "Salvando..."
                        : "Marcar como separado"}
                    </button>
                  ) : null}

                  {tax.status ===
                    "SEPARATED" && (
                    <button
                      type="button"
                      disabled={
                        loadingId ===
                        tax.id
                      }
                      onClick={() =>
                        updateTax(
                          tax.id,
                          "PAY"
                        )
                      }
                      className="rounded-md border px-3 py-2 text-xs"
                    >
                      {loadingId ===
                      tax.id
                        ? "Salvando..."
                        : "Marcar como pago"}
                    </button>
                  )}

                  {tax.status ===
                    "PAID" && (
                    <span className="rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                      Pago
                    </span>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-gray-500">
              {hasExcessAllocation
                ? "Apropriação excedente"
                : "Saldo ainda sem destino"}
            </div>

            <div
              className={[
                "mt-1 text-xl font-semibold",

                Math.abs(
                  cashDifference
                ) <= 0.01
                  ? "text-green-700"
                  : hasExcessAllocation
                    ? "text-red-700"
                    : "text-gray-900",
              ].join(" ")}
            >
              {formatBRL(
                hasExcessAllocation
                  ? Math.abs(
                      cashDifference
                    )
                  : cashDifference
              )}
            </div>
          </div>

          {cashDifference >
            0.01 && (
            <button
              type="button"
              onClick={() =>
                setAppropriating(
                  (value) =>
                    !value
                )
              }
              className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
            >
              Apropriar líquido
              Flyimob
            </button>
          )}

          {hasExcessAllocation && (
            <button
              type="button"
              disabled={
                reopeningAllocation
              }
              onClick={
                reopenAllocation
              }
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              {reopeningAllocation
                ? "Reabrindo..."
                : "Revisar apropriação"}
            </button>
          )}
        </div>

        {hasExcessAllocation && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            O resultado da etapa mudou depois de uma apropriação anterior.
            Reabra a apropriação para recalcular o saldo e apropriar novamente.
          </div>
        )}

        {appropriating && (
          <form
            onSubmit={
              saveAllocation
            }
            className="mt-4 space-y-3 rounded-md border bg-gray-50 p-4"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-600">
                  Valor a apropriar
                </span>

                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  defaultValue={
                    moneyInput(
                      Math.max(
                        0,
                        cashDifference
                      )
                    )
                  }
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-gray-600">
                  Data da apropriação
                </span>

                <input
                  name="appropriatedAt"
                  required
                  type="date"
                  defaultValue={
                    new Date()
                      .toISOString()
                      .slice(
                        0,
                        10
                      )
                  }
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-gray-600">
                Observação
              </span>

              <input
                name="notes"
                placeholder="Ex.: líquido da etapa apropriado"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setAppropriating(
                    false
                  )
                }
                className="rounded-md border bg-white px-3 py-2 text-sm"
              >
                Cancelar
              </button>

              <button
                disabled={
                  savingAllocation
                }
                className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {savingAllocation
                  ? "Salvando..."
                  : "Confirmar apropriação"}
              </button>
            </div>
          </form>
        )}

        {Math.abs(
          cashDifference
        ) <= 0.01 && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            Conciliação financeira
            zerada.
          </div>
        )}
      </div>
    </div>
  );
}