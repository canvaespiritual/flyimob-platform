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

import {
  formatBRL,
} from "@/lib/financeiro/money";

type Receipt = {
  id: string;

  amount:
    | number
    | null;

  receivedAt:
    | string
    | null;

  status: string;

  reference:
    | string
    | null;
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

export default function ReceiptCard({
  stageId,
  receipts,
  grossInvoiced,
  withheldTaxes,
}: {
  stageId: string;

  receipts: Receipt[];

  grossInvoiced: number;

  withheldTaxes: number;
}) {
  const router =
    useRouter();

  const [
    creating,
    setCreating,
  ] =
    useState(false);

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const expectedNetReceipt =
    useMemo(
      () =>
        Math.max(
          0,
          grossInvoiced -
            withheldTaxes
        ),
      [
        grossInvoiced,
        withheldTaxes,
      ]
    );

  async function save(
    event:
      FormEvent<HTMLFormElement>,
    receiptId?: string
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
          receiptId
            ? "/api/financeiro/recebimentos/update"
            : "/api/financeiro/recebimentos/create",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                id:
                  receiptId ??
                  null,

                stageId,

                amount:
                  String(
                    form.get(
                      "amount"
                    ) || ""
                  ),

                receivedAt:
                  String(
                    form.get(
                      "receivedAt"
                    ) || ""
                  ),

                reference:
                  String(
                    form.get(
                      "reference"
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
            "Erro ao salvar recebimento."
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

  function form(
    initial?: Receipt
  ) {
    const defaultAmount =
      initial?.amount != null
        ? initial.amount
        : expectedNetReceipt;

    return (
      <form
        onSubmit={(event) =>
          save(
            event,
            initial?.id
          )
        }
        className="space-y-4 border-b bg-gray-50 p-4"
      >
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!initial && (
          <div className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-gray-500">
                Valor bruto
                faturado
              </div>

              <div className="mt-1 font-medium">
                {formatBRL(
                  grossInvoiced
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500">
                Retido na fonte
              </div>

              <div className="mt-1 font-medium">
                {formatBRL(
                  withheldTaxes
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500">
                Entrada líquida
                esperada
              </div>

              <div className="mt-1 font-semibold text-gray-900">
                {formatBRL(
                  expectedNetReceipt
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-gray-600">
              Valor efetivamente
              recebido
            </span>

            <input
              name="amount"
              required
              inputMode="decimal"
              defaultValue={
                moneyInput(
                  defaultAmount
                )
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />

            {!initial && (
              <div className="text-xs text-gray-500">
                Pré-preenchido pelo
                líquido esperado, mas
                você pode alterar.
              </div>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-xs text-gray-600">
              Data do recebimento
            </span>

            <input
              name="receivedAt"
              type="date"
              required
              defaultValue={
                initial?.receivedAt
                  ? initial.receivedAt.slice(
                      0,
                      10
                    )
                  : ""
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-gray-600">
              Referência
            </span>

            <input
              name="reference"
              defaultValue={
                initial?.reference ??
                ""
              }
              placeholder="PIX, TED, lote da construtora..."
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
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
            disabled={
              loading
            }
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading
              ? "Salvando..."
              : "Salvar recebimento"}
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
            Recebimentos
          </div>

          <div className="text-xs text-gray-500">
            O sistema sugere
            automaticamente o valor
            líquido após retenção na
            fonte.
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setCreating(true);
          }}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Registrar entrada
        </button>
      </div>

      {creating &&
        form()}

      {receipts.length ===
        0 &&
      !creating ? (
        <div className="p-4 text-sm text-gray-500">
          Nenhum recebimento
          confirmado.
        </div>
      ) : (
        <div className="divide-y">
          {receipts.map(
            (receipt) =>
              editingId ===
              receipt.id ? (
                <div
                  key={
                    receipt.id
                  }
                >
                  {form(
                    receipt
                  )}
                </div>
              ) : (
                <div
                  key={
                    receipt.id
                  }
                  className="px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">
                        {receipt.receivedAt
                          ? new Intl.DateTimeFormat(
                              "pt-BR",
                              {
                                timeZone:
                                  "UTC",
                              }
                            ).format(
                              new Date(
                                receipt.receivedAt
                              )
                            )
                          : "Sem data"}
                      </div>

                      {receipt.reference && (
                        <div className="mt-1 text-xs text-gray-500">
                          {
                            receipt.reference
                          }
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="font-medium">
                        {formatBRL(
                          receipt.amount ||
                            0
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCreating(
                            false
                          );

                          setEditingId(
                            receipt.id
                          );
                        }}
                        className="text-xs font-medium underline"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {receipt.status !==
                    "CANCELLED" && (
                    <div className="mt-4">
                      <FinancialAttachmentsManager
                        entityType="RECEIPT"
                        entityId={
                          receipt.id
                        }
                        attachmentType="BUILDER_RECEIPT"
                        title="Comprovante do recebimento"
                        compact
                      />
                    </div>
                  )}
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}