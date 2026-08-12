"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  formatBRL,
} from "@/lib/financeiro/money";

import FinancialAttachmentsManager from "@/components/financeiro/FinancialAttachmentsManager";

type Adjustment = {
  id: string;

  type: string;
  effect: string;

  amount: number;
  used: number;
  remaining: number;

  occurredAt: string;

  appliedAt:
    | string
    | null;

  status: string;

  description:
    | string
    | null;

  notes:
    | string
    | null;

  allocations: Array<{
    id: string;
    amount: number;
    appliedAt: string;

    saleId: string;
    clientName: string;

    stageId: string;
    stageLabel:
      | string
      | null;

    stageType: string;
  }>;
};

type Summary = {
  openDebitBalance: number;
  openCreditBalance: number;
  netAdjustmentBalance: number;
};

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

function typeLabel(
  type: string
) {
  switch (type) {
    case "ADVANCE":
      return "Vale / adiantamento";

    case "DISCOUNT":
      return "Desconto";

    case "BONUS":
      return "Bônus";

    case "REIMBURSEMENT":
      return "Reembolso";

    default:
      return "Outro";
  }
}

function statusLabel(
  status: string
) {
  switch (status) {
    case "AVAILABLE":
      return "Disponível";

    case "PARTIAL":
      return "Parcial";

    case "APPLIED":
      return "Quitado";

    case "CANCELLED":
      return "Cancelado";

    default:
      return status;
  }
}

export default function ParticipantAdjustmentsCard({
  participantId,
}: {
  participantId: string;
}) {
  const [
    adjustments,
    setAdjustments,
  ] =
    useState<
      Adjustment[]
    >([]);

  const [
    summary,
    setSummary,
  ] =
    useState<Summary>({
      openDebitBalance: 0,
      openCreditBalance: 0,
      netAdjustmentBalance: 0,
    });

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

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
    type,
    setType,
  ] =
    useState(
      "ADVANCE"
    );

  const [
    otherEffect,
    setOtherEffect,
  ] =
    useState(
      "DEBIT"
    );

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetch(
              `/api/financeiro/ajustes?participantId=${encodeURIComponent(
                participantId
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              data?.error ||
                "Erro ao carregar vales."
            );
          }

          setAdjustments(
            data.adjustments ||
              []
          );

          setSummary(
            data.summary || {
              openDebitBalance:
                0,

              openCreditBalance:
                0,

              netAdjustmentBalance:
                0,
            }
          );
        } catch (
          err
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro inesperado."
          );
        } finally {
          setLoading(false);
        }
      },
      [participantId]
    );

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setCreating(false);
    setEditingId(null);

    setType(
      "ADVANCE"
    );

    setOtherEffect(
      "DEBIT"
    );

    setError(null);
  }

  function startCreate() {
    resetForm();

    setCreating(
      true
    );
  }

  function startEdit(
    item: Adjustment
  ) {
    setCreating(false);

    setEditingId(
      item.id
    );

    setType(
      item.type
    );

    setOtherEffect(
      item.effect
    );

    setError(null);
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
    item?: Adjustment
  ) {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget
      );

    setSaving(true);
    setError(null);

    try {
      const response =
        await fetch(
          item
            ? "/api/financeiro/ajustes/update"
            : "/api/financeiro/ajustes",
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
                  item?.id ??
                  null,

                participantId,

                type,

                effect:
                  type ===
                  "OTHER"
                    ? otherEffect
                    : null,

                amount:
                  String(
                    form.get(
                      "amount"
                    ) || ""
                  ),

                occurredAt:
                  String(
                    form.get(
                      "occurredAt"
                    ) || ""
                  ),

                description:
                  String(
                    form.get(
                      "description"
                    ) || ""
                  ).trim() ||
                  null,

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
            "Erro ao salvar vale."
        );
      }

      resetForm();

      await load();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelAdjustment(
    item: Adjustment
  ) {
    const confirmed =
      window.confirm(
        `Cancelar "${item.description || typeLabel(
          item.type
        )}"?`
      );

    if (
      !confirmed
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/financeiro/ajustes/update",
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
                  item.id,

                action:
                  "CANCEL",
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
            "Não foi possível cancelar."
        );
      }

      resetForm();

      await load();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado."
      );
    } finally {
      setSaving(false);
    }
  }

  function adjustmentForm(
    item?: Adjustment
  ) {
    return (
      <form
        onSubmit={(
          event
        ) =>
          save(
            event,
            item
          )
        }
        className="space-y-4 border-b bg-gray-50 p-4"
      >
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">
              Tipo
            </span>

            <select
              value={
                type
              }
              onChange={(
                event
              ) =>
                setType(
                  event
                    .target
                    .value
                )
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="ADVANCE">
                Vale /
                adiantamento
              </option>

              <option value="DISCOUNT">
                Desconto
              </option>

              <option value="BONUS">
                Bônus
              </option>

              <option value="REIMBURSEMENT">
                Reembolso
              </option>

              <option value="OTHER">
                Outro
              </option>
            </select>
          </label>

          {type ===
            "OTHER" && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Efeito
              </span>

              <select
                value={
                  otherEffect
                }
                onChange={(
                  event
                ) =>
                  setOtherEffect(
                    event
                      .target
                      .value
                  )
                }
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="DEBIT">
                  Deve para a casa
                </option>

                <option value="CREDIT">
                  Crédito do
                  participante
                </option>
              </select>
            </label>
          )}

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">
              Valor
            </span>

            <input
              name="amount"
              required
              inputMode="decimal"
              defaultValue={
                item
                  ? moneyInput(
                      item.amount
                    )
                  : ""
              }
              placeholder="0,00"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
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
                item
                  ? item.occurredAt.slice(
                      0,
                      10
                    )
                  : new Date()
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
          <span className="text-xs font-medium text-gray-600">
            Descrição
          </span>

          <input
            name="description"
            defaultValue={
              item?.description ??
              ""
            }
            placeholder="Ex.: Gasolina, Facebook, adiantamento pessoal..."
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Observações
          </span>

          <textarea
            name="notes"
            rows={2}
            defaultValue={
              item?.notes ??
              ""
            }
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        {item &&
          item.used >
            0 && (
          <div className="rounded-md border bg-white px-4 py-3 text-sm">
            Este ajuste já
            teve{" "}
            <strong>
              {formatBRL(
                item.used
              )}
            </strong>{" "}
            compensados. O
            valor total não
            pode ser reduzido
            abaixo disso.
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={
              resetForm
            }
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            Cancelar
          </button>

          <button
            disabled={
              saving
            }
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving
              ? "Salvando..."
              : item
                ? "Salvar alterações"
                : "Registrar vale"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4">
        <div>
          <div className="font-semibold text-gray-900">
            Conta corrente —
            vales e ajustes
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Registre
            adiantamentos antes
            mesmo de existir uma
            venda. O saldo será
            oferecido para
            abatimento nos
            pagamentos futuros.
          </div>
        </div>

        <button
          type="button"
          onClick={
            startCreate
          }
          className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
        >
          Registrar vale
        </button>
      </div>

      <div className="grid gap-3 border-b bg-gray-50 p-4 sm:grid-cols-3">
        <div className="rounded-md border bg-white p-3">
          <div className="text-xs uppercase text-gray-500">
            Vales em aberto
          </div>

          <div className="mt-1 text-lg font-semibold text-red-700">
            {formatBRL(
              summary.openDebitBalance
            )}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Saldo ainda devido
            à operação.
          </div>
        </div>

        <div className="rounded-md border bg-white p-3">
          <div className="text-xs uppercase text-gray-500">
            Créditos em aberto
          </div>

          <div className="mt-1 text-lg font-semibold">
            {formatBRL(
              summary.openCreditBalance
            )}
          </div>
        </div>

        <div className="rounded-md border bg-white p-3">
          <div className="text-xs uppercase text-gray-500">
            Saldo líquido dos
            ajustes
          </div>

          <div className="mt-1 text-lg font-semibold">
            {formatBRL(
              summary.netAdjustmentBalance
            )}
          </div>
        </div>
      </div>

      {creating &&
        adjustmentForm()}

      {loading ? (
        <div className="p-4 text-sm text-gray-500">
          Carregando conta
          corrente...
        </div>
      ) : adjustments.length ===
        0 ? (
        <div className="p-4 text-sm text-gray-500">
          Nenhum vale,
          adiantamento ou ajuste
          cadastrado.
        </div>
      ) : (
        <div className="divide-y">
          {adjustments.map(
            (item) =>
              editingId ===
              item.id ? (
                <div
                  key={
                    item.id
                  }
                >
                  {adjustmentForm(
                    item
                  )}
                </div>
              ) : (
                <div
                  key={
                    item.id
                  }
                  className={[
                    "px-4 py-4",
                    item.status ===
                    "CANCELLED"
                      ? "bg-gray-50 opacity-60"
                      : "",
                  ].join(
                    " "
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {item.description ||
                            typeLabel(
                              item.type
                            )}
                        </span>

                        <span className="rounded-full border px-2 py-0.5 text-xs text-gray-600">
                          {statusLabel(
                            item.status
                          )}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {new Intl.DateTimeFormat(
                          "pt-BR"
                        ).format(
                          new Date(
                            item.occurredAt
                          )
                        )}{" "}
                        •{" "}
                        {typeLabel(
                          item.type
                        )}
                      </div>

                      {item.notes && (
                        <div className="mt-2 text-sm text-gray-600">
                          {
                            item.notes
                          }
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-5">
                      <div className="grid grid-cols-3 gap-5 text-right">
                        <div>
                          <div className="text-xs text-gray-500">
                            Original
                          </div>

                          <div className="mt-1 font-medium">
                            {formatBRL(
                              item.amount
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">
                            Utilizado
                          </div>

                          <div className="mt-1 font-medium">
                            {formatBRL(
                              item.used
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">
                            Saldo
                          </div>

                          <div
                            className={[
                              "mt-1 font-semibold",
                              item.remaining >
                              0
                                ? "text-red-700"
                                : "text-green-700",
                            ].join(
                              " "
                            )}
                          >
                            {formatBRL(
                              item.remaining
                            )}
                          </div>
                        </div>
                      </div>

                      {item.status !==
                        "CANCELLED" && (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              startEdit(
                                item
                              )
                            }
                            className="text-xs font-medium underline"
                          >
                            Editar
                          </button>

                          {item.used ===
                            0 && (
                            <button
                              type="button"
                              disabled={
                                saving
                              }
                              onClick={() =>
                                cancelAdjustment(
                                  item
                                )
                              }
                              className="text-xs font-medium text-red-600 underline"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.allocations.length >
                    0 && (
                    <div className="mt-4 rounded-md border bg-gray-50">
                      <div className="border-b px-3 py-2 text-xs font-medium text-gray-600">
                        Histórico de
                        compensações
                      </div>

                      <div className="divide-y">
                        {item.allocations.map(
                          (
                            allocation
                          ) => (
                            <div
                              key={
                                allocation.id
                              }
                              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                            >
                              <div>
                                <div className="font-medium">
                                  {
                                    allocation.clientName
                                  }
                                </div>

                                <div className="text-xs text-gray-500">
                                  {allocation.stageLabel ||
                                    allocation.stageType}{" "}
                                  •{" "}
                                  {new Intl.DateTimeFormat(
                                    "pt-BR"
                                  ).format(
                                    new Date(
                                      allocation.appliedAt
                                    )
                                  )}
                                </div>
                              </div>

                              <div className="font-medium">
                                -
                                {formatBRL(
                                  allocation.amount
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  {item.status !==
  "CANCELLED" && (
  <div className="mt-4">
    <FinancialAttachmentsManager
      entityType="ADJUSTMENT"
      entityId={
        item.id
      }
      attachmentType={
        item.type ===
        "ADVANCE"
          ? "ADVANCE"
          : "OTHER"
      }
      title={
        item.type ===
        "ADVANCE"
          ? "Comprovantes do vale"
          : "Comprovantes do ajuste"
      }
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