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

  holderName:
    | string
    | null;

  holderCpfCnpj:
    | string
    | null;

  preferred: boolean;
};

type Entitlement = {
  id: string;
  stageId: string;
  saleId: string;

  clientName: string;

  stageType: string;

  stageLabel:
    | string
    | null;

  role: string;

  finalAmount: number;

  balance: number;

  receivedAt:
    | string
    | null;

  construtora:
    | string
    | null;

  empreendimento:
    | string
    | null;
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
};

type Data = {
  participant: {
    id: string;
    name: string;
  };

  accounts:
    Account[];

  entitlements:
    Entitlement[];

  adjustments:
    Adjustment[];
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
      .replace(
        /\./g,
        ""
      )
      .replace(
        ",",
        "."
      );

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

function date(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR"
  ).format(
    new Date(
      value
    )
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
    } • ${
      account.pixKey
    }`;
  }

  return [
    account.bankName,
    account.agency
      ? `Ag ${account.agency}`
      : null,
    account.account
      ? `Conta ${account.account}`
      : null,
  ]
    .filter(
      Boolean
    )
    .join(
      " • "
    );
}

export default function ParticipantRemittancePanel({
  participantId,
}: {
  participantId: string;
}) {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<
      Data | null
    >(null);

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

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
    selected,
    setSelected,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >({});

  const [
    adjustmentValues,
    setAdjustmentValues,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    destinationAccountId,
    setDestinationAccountId,
  ] =
    useState("");

  const load =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setError(
          null
        );

        try {
          const response =
            await fetch(
              `/api/financeiro/remessas?participantId=${encodeURIComponent(
                participantId
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
                "Erro ao carregar remessa."
            );
          }

          const loaded =
            json as Data;

          setData(
            loaded
          );

          /*
           * Por padrão já marcamos todas as comissões
           * elegíveis.
           *
           * No dia a dia isso reduz cliques.
           */
          const defaults:
            Record<
              string,
              boolean
            > =
            {};

          for (
            const entitlement
            of loaded.entitlements
          ) {
            defaults[
              entitlement.id
            ] =
              true;
          }

          setSelected(
            defaults
          );

          const adjustmentDefaults:
            Record<
              string,
              string
            > =
            {};

          for (
            const adjustment
            of loaded.adjustments
          ) {
            adjustmentDefaults[
              adjustment.id
            ] =
              "0,00";
          }

          setAdjustmentValues(
            adjustmentDefaults
          );

          const preferred =
            loaded.accounts.find(
              (
                account
              ) =>
                account.preferred
            ) ||
            loaded.accounts[0];

          setDestinationAccountId(
            preferred?.id ||
              ""
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
          setLoading(
            false
          );
        }
      },
      [
        participantId,
      ]
    );

  useEffect(() => {
    if (
      open
    ) {
      load();
    }
  }, [
    open,
    load,
  ]);

  const selectedEntitlements =
    useMemo(
      () =>
        data?.entitlements.filter(
          (
            entitlement
          ) =>
            selected[
              entitlement.id
            ]
        ) || [],
      [
        data,
        selected,
      ]
    );

  const totalRights =
    useMemo(
      () =>
        selectedEntitlements.reduce(
          (
            total,
            entitlement
          ) =>
            total +
            entitlement.balance,
          0
        ),
      [
        selectedEntitlements,
      ]
    );

  const totalAdjustments =
    useMemo(
      () => {
        if (!data) {
          return 0;
        }

        return data.adjustments.reduce(
          (
            total,
            adjustment
          ) =>
            total +
            Math.min(
              adjustment.remainingAmount,
              Math.max(
                0,
                parseMoney(
                  adjustmentValues[
                    adjustment.id
                  ] ||
                    ""
                )
              )
            ),
          0
        );
      },
      [
        data,
        adjustmentValues,
      ]
    );

  const pixAmount =
    Math.max(
      0,
      Math.round(
        (
          totalRights -
          totalAdjustments
        ) *
          100
      ) /
        100
    );

  function useMaximumVale(
    adjustment:
      Adjustment
  ) {
    const other =
      data?.adjustments.reduce(
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
              adjustmentValues[
                item.id
              ] ||
                ""
            )
          );
        },
        0
      ) || 0;

    const maximum =
      Math.max(
        0,
        Math.min(
          adjustment.remainingAmount,
          totalRights -
            other
        )
      );

    setAdjustmentValues(
      (
        current
      ) => ({
        ...current,

        [adjustment.id]:
          moneyInput(
            maximum
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
      selectedEntitlements.length ===
      0
    ) {
      setError(
        "Selecione pelo menos uma comissão."
      );

      return;
    }

    if (
      totalAdjustments >
      totalRights +
        0.009
    ) {
      setError(
        "Os vales ultrapassam o total das comissões selecionadas."
      );

      return;
    }

    if (
      pixAmount >
        0.009 &&
      !destinationAccountId
    ) {
      setError(
        "Selecione a conta/PIX do participante."
      );

      return;
    }

    const confirmed =
      window.confirm(
        [
          `Comissões: ${formatBRL(
            totalRights
          )}`,
          `Vales: ${formatBRL(
            totalAdjustments
          )}`,
          `PIX único: ${formatBRL(
            pixAmount
          )}`,
          "",
          `Quantidade de comissões: ${selectedEntitlements.length}`,
          "",
          "Confirmar esta remessa?",
        ].join(
          "\n"
        )
      );

    if (
      !confirmed
    ) {
      return;
    }

    const form =
      new FormData(
        event.currentTarget
      );

    setSaving(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          "/api/financeiro/remessas",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                participantId,

                destinationAccountId,

                entitlementIds:
                  selectedEntitlements.map(
                    (
                      entitlement
                    ) =>
                      entitlement.id
                  ),

                adjustments:
                  data.adjustments
                    .map(
                      (
                        adjustment
                      ) => ({
                        adjustmentId:
                          adjustment.id,

                        amount:
                          parseMoney(
                            adjustmentValues[
                              adjustment.id
                            ] ||
                              ""
                          ),
                      })
                    )
                    .filter(
                      (
                        adjustment
                      ) =>
                        adjustment.amount >
                        0
                    ),

                paidAt:
                  String(
                    form.get(
                      "paidAt"
                    ) ||
                      ""
                  ),

                notes:
                  String(
                    form.get(
                      "notes"
                    ) ||
                      ""
                  ).trim() ||
                  null,
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
            "Não foi possível registrar a remessa."
        );
      }

      setOpen(
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
      setSaving(
        false
      );
    }
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <div className="font-semibold text-gray-900">
            Remessas de pagamento
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Agrupe várias
            comissões recebidas
            em um único PIX.
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setOpen(
              (
                current
              ) =>
                !current
            )
          }
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {open
            ? "Fechar"
            : "Nova remessa"}
        </button>
      </div>

      {open && (
        <div className="border-t bg-gray-50 p-4">
          {loading ? (
            <div className="text-sm text-gray-500">
              Carregando
              comissões...
            </div>
          ) : !data ? (
            <div className="text-sm text-red-600">
              {error ||
                "Erro ao carregar."}
            </div>
          ) : (
            <form
              onSubmit={
                submit
              }
              className="space-y-4"
            >
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-3">
                  <div className="font-medium">
                    Comissões
                    disponíveis
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Somente etapas
                    já recebidas
                    aparecem aqui.
                    As mais antigas
                    entram primeiro.
                  </div>
                </div>

                {data.entitlements.length ===
                0 ? (
                  <div className="p-4 text-sm text-gray-500">
                    Nenhuma
                    comissão
                    recebida está
                    pendente para
                    este
                    participante.
                  </div>
                ) : (
                  <div className="divide-y">
                    {data.entitlements.map(
                      (
                        entitlement
                      ) => (
                        <label
                          key={
                            entitlement.id
                          }
                          className="grid cursor-pointer items-center gap-3 px-4 py-3 md:grid-cols-[26px_1fr_130px_130px]"
                        >
                          <input
                            type="checkbox"
                            checked={
                              Boolean(
                                selected[
                                  entitlement.id
                                ]
                              )
                            }
                            onChange={(
                              event
                            ) =>
                              setSelected(
                                (
                                  current
                                ) => ({
                                  ...current,

                                  [entitlement.id]:
                                    event
                                      .target
                                      .checked,
                                })
                              )
                            }
                          />

                          <div>
                            <div className="font-medium text-gray-900">
                              {
                                entitlement.clientName
                              }
                            </div>

                            <div className="mt-0.5 text-xs text-gray-500">
                              {entitlement.construtora ||
                                "—"}

                              {" • "}

                              {entitlement.empreendimento ||
                                "—"}

                              {" • "}

                              {entitlement.stageLabel ||
                                entitlement.stageType}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase text-gray-400">
                              Recebido
                            </div>

                            <div className="mt-1 text-sm">
                              {date(
                                entitlement.receivedAt
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] uppercase text-gray-400">
                              Saldo
                            </div>

                            <div className="mt-1 font-semibold">
                              {formatBRL(
                                entitlement.balance
                              )}
                            </div>
                          </div>
                        </label>
                      )
                    )}
                  </div>
                )}
              </div>

              {data.adjustments.length >
                0 && (
                <div className="rounded-lg border bg-white">
                  <div className="border-b px-4 py-3">
                    <div className="font-medium">
                      Vales em
                      aberto
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      Escolha
                      quanto deseja
                      descontar
                      nesta remessa.
                      O sistema
                      distribui
                      automaticamente
                      entre as
                      comissões.
                    </div>
                  </div>

                  <div className="divide-y">
                    {data.adjustments.map(
                      (
                        adjustment
                      ) => (
                        <div
                          key={
                            adjustment.id
                          }
                          className="grid items-end gap-3 px-4 py-3 md:grid-cols-[1fr_140px_160px_auto]"
                        >
                          <div>
                            <div className="font-medium">
                              {adjustment.description ||
                                "Vale / adiantamento"}
                            </div>

                            <div className="mt-1 text-xs text-gray-500">
                              {date(
                                adjustment.occurredAt
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase text-gray-400">
                              Saldo
                            </div>

                            <div className="mt-1 font-medium">
                              {formatBRL(
                                adjustment.remainingAmount
                              )}
                            </div>
                          </div>

                          <label className="space-y-1">
                            <span className="text-xs text-gray-600">
                              Descontar
                              agora
                            </span>

                            <input
                              value={
                                adjustmentValues[
                                  adjustment.id
                                ] ||
                                ""
                              }
                              onChange={(
                                event
                              ) =>
                                setAdjustmentValues(
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
                              useMaximumVale(
                                adjustment
                              )
                            }
                            className="rounded-md border px-3 py-2 text-xs"
                          >
                            Usar máximo
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">
                    Conta / PIX
                  </span>

                  <select
                    value={
                      destinationAccountId
                    }
                    onChange={(
                      event
                    ) =>
                      setDestinationAccountId(
                        event
                          .target
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
                    Data do
                    repasse
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
                  placeholder="Ex.: remessa de comissões recebidas no período"
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="rounded-lg border bg-white p-4">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-gray-500">
                      Comissões
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      {
                        selectedEntitlements.length
                      }
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Direitos
                    </div>

                    <div className="mt-1 font-semibold">
                      {formatBRL(
                        totalRights
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      Vales
                    </div>

                    <div className="mt-1 font-semibold text-red-700">
                      -
                      {formatBRL(
                        totalAdjustments
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">
                      PIX único
                    </div>

                    <div className="mt-1 text-xl font-semibold">
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
                    saving ||
                    selectedEntitlements.length ===
                      0
                  }
                  className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving
                    ? "Registrando remessa..."
                    : `Registrar PIX de ${formatBRL(
                        pixAmount
                      )}`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}