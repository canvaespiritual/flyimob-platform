"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  formatBRL,
} from "@/lib/financeiro/money";

type Account = {
  id: string;

  pixType:
    | string
    | null;

  pixKey:
    | string
    | null;

  bankName:
    | string
    | null;

  agency:
    | string
    | null;

  account:
    | string
    | null;

  accountType:
    | string
    | null;

  holderName:
    | string
    | null;

  holderCpfCnpj:
    | string
    | null;

  preferred: boolean;
};

type Adjustment = {
  id: string;
  type: string;

  description:
    | string
    | null;

  occurredAt: string;

  originalAmount: number;
  usedAmount: number;
  remainingAmount: number;

  status: string;
};

type Preview = {
  entitlement: {
    id: string;

    status: string;

    participantId: string;
    participantName: string;

    clientName: string;

    stageLabel:
      | string
      | null;

    stageType: string;

    finalAmount: number;

    paidAmount: number;

    debitApplied: number;

    creditApplied: number;

    balance: number;
  };

  accounts: Account[];

  adjustments: Adjustment[];

  history: {
    payments: Array<{
      id: string;
      amount: number;
      status: string;

      paidAt:
        | string
        | null;
    }>;

    adjustments: Array<{
      id: string;
      adjustmentId: string;

      description:
        | string
        | null;

      effect: string;

      amount: number;

      appliedAt: string;
    }>;
  };
};

function parseMoney(
  value: string
) {
  if (!value) {
    return 0;
  }

  const normalized =
    value
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

  const number =
    Number(
      normalized
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

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

function accountLabel(
  account: Account
) {
  if (
    account.pixKey
  ) {
    return `PIX ${
      account.pixType ||
      ""
    } • ${account.pixKey}`;
  }

  const parts =
    [
      account.bankName,
      account.agency
        ? `Ag ${account.agency}`
        : null,
      account.account
        ? `Conta ${account.account}`
        : null,
    ].filter(Boolean);

  return (
    parts.join(" • ") ||
    "Conta cadastrada"
  );
}

export default function EntitlementPaymentPanel({
  entitlementId,

  onClose,
}: {
  entitlementId: string;

  onClose?: () => void;
}) {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<
      Preview | null
    >(null);

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
    destinationAccountId,
    setDestinationAccountId,
  ] =
    useState("");

  const [
    deductions,
    setDeductions,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetch(
              `/api/financeiro/pagamentos/comissao?entitlementId=${encodeURIComponent(
                entitlementId
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const json =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              json?.error ||
                "Erro ao carregar pagamento."
            );
          }

          const preview =
            json as Preview;

          setData(
            preview
          );

          const preferred =
            preview.accounts.find(
              (account) =>
                account.preferred
            ) ||
            preview.accounts[0];

          setDestinationAccountId(
            preferred?.id ||
              ""
          );

          const initial:
            Record<
              string,
              string
            > =
            {};

          for (
            const adjustment
            of preview.adjustments
          ) {
            initial[
              adjustment.id
            ] =
              "0,00";
          }

          setDeductions(
            initial
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
      [entitlementId]
    );

  useEffect(() => {
    load();
  }, [load]);

  const totalDeductions =
    useMemo(() => {
      if (!data) {
        return 0;
      }

      let total = 0;

      for (
        const adjustment
        of data.adjustments
      ) {
        const requested =
          parseMoney(
            deductions[
              adjustment.id
            ] || ""
          );

        total += Math.min(
          Math.max(
            0,
            requested
          ),
          adjustment.remainingAmount
        );
      }

      return (
        Math.round(
          total * 100
        ) / 100
      );
    }, [
      data,
      deductions,
    ]);

  const pixAmount =
    data
      ? Math.max(
          0,
          Math.round(
            (
              data.entitlement
                .balance -
              totalDeductions
            ) *
              100
          ) / 100
        )
      : 0;

  function useFullAdjustment(
    adjustment:
      Adjustment
  ) {
    if (!data) {
      return;
    }

    const otherTotal =
      data.adjustments.reduce(
        (
          total,
          item
        ) => {
          if (
            item.id ===
            adjustment.id
          ) {
            return total;
          }

          return (
            total +
            parseMoney(
              deductions[
                item.id
              ] || ""
            )
          );
        },
        0
      );

    const maxForThis =
      Math.max(
        0,
        data.entitlement
          .balance -
          otherTotal
      );

    const amount =
      Math.min(
        adjustment.remainingAmount,
        maxForThis
      );

    setDeductions(
      (current) => ({
        ...current,

        [adjustment.id]:
          moneyInput(
            amount
          ),
      })
    );
  }

  async function submit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!data) {
      return;
    }

    if (
      totalDeductions >
      data.entitlement
        .balance +
        0.009
    ) {
      setError(
        "Os vales selecionados ultrapassam o saldo desta comissão."
      );

      return;
    }

    if (
      pixAmount >
        0.009 &&
      !destinationAccountId
    ) {
      setError(
        "Selecione ou cadastre uma conta/PIX para registrar o pagamento."
      );

      return;
    }

    const confirmed =
      window.confirm(
        [
          `Comissão: ${formatBRL(
            data.entitlement
              .balance
          )}`,
          `Vales: ${formatBRL(
            totalDeductions
          )}`,
          `PIX: ${formatBRL(
            pixAmount
          )}`,
          "",
          "Confirmar esta liquidação?",
        ].join("\n")
      );

    if (!confirmed) {
      return;
    }

    const form =
      new FormData(
        event.currentTarget
      );

    setSaving(true);
    setError(null);

    try {
      const adjustments =
        data.adjustments
          .map(
            (adjustment) => ({
              adjustmentId:
                adjustment.id,

              amount:
                deductions[
                  adjustment.id
                ] || "0",
            })
          )
          .filter(
            (item) =>
              parseMoney(
                item.amount
              ) > 0
          );

      const response =
        await fetch(
          "/api/financeiro/pagamentos/comissao",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                entitlementId,

                destinationAccountId:
                  destinationAccountId ||
                  null,

                paidAt:
                  String(
                    form.get(
                      "paidAt"
                    ) || ""
                  ),

                notes:
                  String(
                    form.get(
                      "notes"
                    ) || ""
                  ).trim() ||
                  null,

                adjustments,
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
            "Não foi possível registrar o pagamento."
        );
      }

      await load();

      router.refresh();

      if (
        json.remainingAfter <=
        0.009
      ) {
        onClose?.();
      }
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

  if (loading) {
    return (
      <div className="border-t bg-gray-50 p-4 text-sm text-gray-500">
        Carregando pagamento...
      </div>
    );
  }

  if (
    !data
  ) {
    return (
      <div className="border-t bg-red-50 p-4 text-sm text-red-700">
        {error ||
          "Não foi possível carregar a comissão."}
      </div>
    );
  }

  const entitlement =
    data.entitlement;

  return (
    <form
      onSubmit={
        submit
      }
      className="space-y-4 border-t bg-gray-50 p-4"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-gray-900">
            Liquidar comissão
          </div>

          <div className="mt-1 text-xs text-gray-500">
            {
              entitlement.participantName
            }{" "}
            •{" "}
            {
              entitlement.clientName
            }{" "}
            •{" "}
            {entitlement.stageLabel ||
              entitlement.stageType}
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={
              onClose
            }
            className="text-xs font-medium underline"
          >
            Fechar
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border bg-white p-3">
          <div className="text-xs text-gray-500">
            Direito original
          </div>

          <div className="mt-1 font-semibold">
            {formatBRL(
              entitlement.finalAmount
            )}
          </div>
        </div>

        <div className="rounded-md border bg-white p-3">
          <div className="text-xs text-gray-500">
            Já pago
          </div>

          <div className="mt-1 font-semibold">
            {formatBRL(
              entitlement.paidAmount
            )}
          </div>
        </div>

        <div className="rounded-md border bg-white p-3">
          <div className="text-xs text-gray-500">
            Vales já compensados
          </div>

          <div className="mt-1 font-semibold">
            {formatBRL(
              entitlement.debitApplied
            )}
          </div>
        </div>

        <div className="rounded-md border bg-white p-3">
          <div className="text-xs text-gray-500">
            Saldo da comissão
          </div>

          <div className="mt-1 text-lg font-semibold">
            {formatBRL(
              entitlement.balance
            )}
          </div>
        </div>
      </div>

      {entitlement.balance <=
      0.009 ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Esta comissão já está
          liquidada.
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-white">
            <div className="border-b px-4 py-3">
              <div className="font-medium text-gray-900">
                Vales em aberto
              </div>

              <div className="mt-1 text-xs text-gray-500">
                Escolha quanto
                deseja descontar
                de cada vale neste
                pagamento.
              </div>
            </div>

            {data.adjustments
              .length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                Nenhum vale em
                aberto.
              </div>
            ) : (
              <div className="divide-y">
                {data.adjustments.map(
                  (
                    adjustment
                  ) => (
                    <div
                      key={
                        adjustment.id
                      }
                      className="grid items-end gap-3 px-4 py-3 md:grid-cols-[1fr_150px_150px_auto]"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {adjustment.description ||
                            "Vale / adiantamento"}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {new Intl.DateTimeFormat(
                            "pt-BR"
                          ).format(
                            new Date(
                              adjustment.occurredAt
                            )
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500">
                          Saldo do vale
                        </div>

                        <div className="mt-1 font-medium">
                          {formatBRL(
                            adjustment.remainingAmount
                          )}
                        </div>
                      </div>

                      <label className="space-y-1">
                        <span className="text-xs text-gray-600">
                          Descontar agora
                        </span>

                        <input
                          value={
                            deductions[
                              adjustment.id
                            ] ||
                            ""
                          }
                          onChange={(
                            event
                          ) =>
                            setDeductions(
                              (
                                current
                              ) => ({
                                ...current,

                                [adjustment.id]:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                          inputMode="decimal"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          useFullAdjustment(
                            adjustment
                          )
                        }
                        className="rounded-md border bg-white px-3 py-2 text-xs"
                      >
                        Usar máximo
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Conta / PIX usado
              </span>

              <select
                value={
                  destinationAccountId
                }
                onChange={(
                  event
                ) =>
                  setDestinationAccountId(
                    event.target
                      .value
                  )
                }
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">
                  Selecione
                </option>

                {data.accounts.map(
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
                      {accountLabel(
                        account
                      )}
                      {account.preferred
                        ? " • Preferencial"
                        : ""}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Data do repasse
              </span>

              <input
                name="paidAt"
                type="date"
                required
                defaultValue={new Date()
                  .toISOString()
                  .slice(
                    0,
                    10
                  )}
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">
              Observação
            </span>

            <input
              name="notes"
              placeholder="Ex.: PIX referente ao ato da venda..."
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>

          <div className="rounded-lg border bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-gray-500">
                  Saldo da comissão
                </div>

                <div className="mt-1 font-medium">
                  {formatBRL(
                    entitlement.balance
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">
                  Vales neste
                  pagamento
                </div>

                <div className="mt-1 font-medium text-red-700">
                  -
                  {formatBRL(
                    totalDeductions
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">
                  PIX a realizar
                </div>

                <div className="mt-1 text-xl font-semibold text-gray-900">
                  {formatBRL(
                    pixAmount
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              disabled={
                saving
              }
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving
                ? "Registrando..."
                : pixAmount >
                    0.009
                  ? `Confirmar pagamento de ${formatBRL(
                      pixAmount
                    )}`
                  : "Liquidar somente com vales"}
            </button>
          </div>
        </>
      )}

      {(data.history
        .payments.length >
        0 ||
        data.history
          .adjustments
          .length >
          0) && (
        <details className="rounded-md border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Histórico desta
            comissão
          </summary>

          <div className="divide-y border-t">
            {data.history.payments.map(
              (
                payment
              ) => (
                <div
                  key={
                    payment.id
                  }
                  className="flex justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    Pagamento •{" "}
                    {payment.paidAt
                      ? new Intl.DateTimeFormat(
                          "pt-BR"
                        ).format(
                          new Date(
                            payment.paidAt
                          )
                        )
                      : payment.status}
                  </span>

                  <strong>
                    {formatBRL(
                      payment.amount
                    )}
                  </strong>
                </div>
              )
            )}

            {data.history.adjustments.map(
              (
                adjustment
              ) => (
                <div
                  key={
                    adjustment.id
                  }
                  className="flex justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    Vale •{" "}
                    {adjustment.description ||
                      "Ajuste"}
                  </span>

                  <strong>
                    -
                    {formatBRL(
                      adjustment.amount
                    )}
                  </strong>
                </div>
              )
            )}
          </div>
        </details>
      )}
    </form>
  );
}