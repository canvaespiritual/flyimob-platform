"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import FinancialAttachmentsManager from "@/components/financeiro/FinancialAttachmentsManager";

import {
  formatBRL,
} from "@/lib/financeiro/money";

type Invoice = {
  id: string;

  number:
    | string
    | null;

  grossAmount:
    | number
    | null;

  issuedAt:
    | string
    | null;

  status: string;
};

export default function InvoiceCard({
  stageId,
  invoices,
}: {
  stageId: string;
  invoices: Invoice[];
}) {
  const router =
    useRouter();

  const [
    showCreate,
    setShowCreate,
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

  async function save(
    event:
      FormEvent<HTMLFormElement>,
    invoiceId?: string
  ) {
    event.preventDefault();

    const formElement =
      event.currentTarget;

    const form =
      new FormData(
        formElement
      );

    setLoading(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          invoiceId
            ? "/api/financeiro/notas/update"
            : "/api/financeiro/notas/create",
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
                  invoiceId ??
                  null,

                stageId,

                number:
                  String(
                    form.get(
                      "number"
                    ) || ""
                  ).trim() ||
                  null,

                grossAmount:
                  String(
                    form.get(
                      "grossAmount"
                    ) || ""
                  ).trim(),

                issuedAt:
                  String(
                    form.get(
                      "issuedAt"
                    ) || ""
                  ).trim(),
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
            "Não foi possível salvar a nota."
        );
      }

      setShowCreate(
        false
      );

      setEditingId(
        null
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
      setLoading(
        false
      );
    }
  }

  function form(
    initial?: Invoice
  ) {
    return (
      <form
        onSubmit={(
          event
        ) =>
          save(
            event,
            initial?.id
          )
        }
        className="grid gap-3 border-b bg-gray-50 p-4 md:grid-cols-3"
      >
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-3">
            {error}
          </div>
        )}

        <label className="space-y-1">
          <span className="text-xs text-gray-600">
            Número da NF
          </span>

          <input
            name="number"
            defaultValue={
              initial?.number ??
              ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-gray-600">
            Valor bruto
          </span>

          <input
            name="grossAmount"
            required
            inputMode="decimal"
            defaultValue={
              initial?.grossAmount !=
              null
                ? initial.grossAmount.toLocaleString(
                    "pt-BR",
                    {
                      minimumFractionDigits:
                        2,

                      maximumFractionDigits:
                        2,
                    }
                  )
                : ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-gray-600">
            Data da nota
          </span>

          <input
            name="issuedAt"
            type="date"
            required
            defaultValue={
              initial?.issuedAt
                ? initial.issuedAt.slice(
                    0,
                    10
                  )
                : ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex justify-end gap-2 md:col-span-3">
          <button
            type="button"
            onClick={() => {
              setShowCreate(
                false
              );

              setEditingId(
                null
              );
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
              : initial
                ? "Salvar alterações"
                : "Salvar NF"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="font-medium text-gray-900">
            Nota fiscal
          </div>

          <div className="text-xs text-gray-500">
            A competência fiscal é
            definida pela data da nota.
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingId(
              null
            );

            setShowCreate(
              true
            );
          }}
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Adicionar NF
        </button>
      </div>

      {showCreate &&
        form()}

      {invoices.length ===
        0 &&
      !showCreate ? (
        <div className="p-4 text-sm text-gray-500">
          Nenhuma nota emitida nesta
          etapa.
        </div>
      ) : (
        <div className="divide-y">
          {invoices.map(
            (
              invoice
            ) =>
              editingId ===
              invoice.id ? (
                <div
                  key={
                    invoice.id
                  }
                >
                  {form(
                    invoice
                  )}
                </div>
              ) : (
                <div
                  key={
                    invoice.id
                  }
                  className="px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-gray-900">
                        NF{" "}
                        {invoice.number ||
                          "sem número"}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {invoice.issuedAt
                          ? new Intl.DateTimeFormat(
                              "pt-BR",
                              {
                                timeZone:
                                  "UTC",
                              }
                            ).format(
                              new Date(
                                invoice.issuedAt
                              )
                            )
                          : "Sem data"}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="font-medium">
                        {formatBRL(
                          invoice.grossAmount ||
                            0
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowCreate(
                            false
                          );

                          setEditingId(
                            invoice.id
                          );
                        }}
                        className="text-xs font-medium text-gray-600 underline"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {invoice.status !==
                    "CANCELLED" && (
                    <div className="mt-4">
                      <FinancialAttachmentsManager
                        entityType="INVOICE"
                        entityId={
                          invoice.id
                        }
                        attachmentType="INVOICE"
                        title="Documento da nota fiscal"
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