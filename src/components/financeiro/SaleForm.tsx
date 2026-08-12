"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

type ConstrutoraOption = {
  id: string;
  name: string;
};

type EmpreendimentoOption = {
  id: string;
  name: string;
  construtoraId: string | null;
};

type StageType =
  | "ATO"
  | "BANCO"
  | "PREMIO"
  | "COMPLEMENTO"
  | "OUTRO";

type StageDraft = {
  key: string;
  type: StageType;
  label: string;
  sharePercent: string;
  expectedAmount: string;
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
    Number(normalized);

  return Number.isFinite(number)
    ? number
    : 0;
}

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

function formatInputMoney(
  value: number
) {
  return Math.max(
    0,
    value
  ).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}

function isPrincipalStage(
  type: StageType
) {
  return (
    type === "ATO" ||
    type === "BANCO"
  );
}

function rebalanceLastPrincipal(
  stages: StageDraft[],
  commission: number
) {
  const principalIndexes =
    stages
      .map(
        (stage, index) => ({
          stage,
          index,
        })
      )
      .filter(
        ({ stage }) =>
          isPrincipalStage(
            stage.type
          )
      )
      .map(
        ({ index }) =>
          index
      );

  if (
    principalIndexes.length ===
    0
  ) {
    return stages;
  }

  const lastIndex =
    principalIndexes[
      principalIndexes.length -
        1
    ];

  const usedBeforeLast =
    principalIndexes
      .filter(
        (index) =>
          index !== lastIndex
      )
      .reduce(
        (sum, index) =>
          sum +
          parseMoney(
            stages[index]
              .expectedAmount
          ),
        0
      );

  const remaining =
    Math.max(
      0,
      commission -
        usedBeforeLast
    );

  return stages.map(
    (stage, index) =>
      index === lastIndex
        ? {
            ...stage,
            expectedAmount:
              formatInputMoney(
                remaining
              ),
          }
        : stage
  );
}

export default function SaleForm({
  construtoras,
  empreendimentos,
}: {
  construtoras: ConstrutoraOption[];
  empreendimentos: EmpreendimentoOption[];
}) {
  const router =
    useRouter();

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

  const [
    construtoraId,
    setConstrutoraId,
  ] =
    useState("");

  const [
    inputMode,
    setInputMode,
  ] =
    useState<
      | "MANUAL_AMOUNT"
      | "VGV_PERCENT"
      | "VGV_PERCENT_OVERRIDE"
    >(
      "MANUAL_AMOUNT"
    );

  const [vgv, setVgv] =
    useState("");

  const [
    commissionPercent,
    setCommissionPercent,
  ] =
    useState("");

  const [
    manualCommission,
    setManualCommission,
  ] =
    useState("");

  const [
    stages,
    setStages,
  ] =
    useState<
      StageDraft[]
    >([
      {
        key:
          crypto.randomUUID(),
        type: "ATO",
        label: "Ato",
        sharePercent:
          "50",
        expectedAmount:
          "",
      },

      {
        key:
          crypto.randomUUID(),
        type: "BANCO",
        label:
          "Assinatura banco",
        sharePercent:
          "50",
        expectedAmount:
          "",
      },
    ]);

  const filteredEmpreendimentos =
    useMemo(() => {
      if (
        !construtoraId
      ) {
        return empreendimentos;
      }

      return empreendimentos.filter(
        (item) =>
          item.construtoraId ===
          construtoraId
      );
    }, [
      construtoraId,
      empreendimentos,
    ]);

  const calculatedByVgv =
    useMemo(() => {
      const base =
        parseMoney(vgv);

      const percent =
        parsePercent(
          commissionPercent
        );

      return (
        base *
        (percent / 100)
      );
    }, [
      vgv,
      commissionPercent,
    ]);

  const finalCommission =
    useMemo(() => {
      if (
        inputMode ===
        "MANUAL_AMOUNT"
      ) {
        return parseMoney(
          manualCommission
        );
      }

      if (
        inputMode ===
        "VGV_PERCENT_OVERRIDE"
      ) {
        const override =
          parseMoney(
            manualCommission
          );

        return override > 0
          ? override
          : calculatedByVgv;
      }

      return calculatedByVgv;
    }, [
      inputMode,
      manualCommission,
      calculatedByVgv,
    ]);

  const principalStages =
    useMemo(
      () =>
        stages.filter(
          (stage) =>
            isPrincipalStage(
              stage.type
            )
        ),
      [stages]
    );

  const additionalStages =
    useMemo(
      () =>
        stages.filter(
          (stage) =>
            !isPrincipalStage(
              stage.type
            )
        ),
      [stages]
    );

  const principalPercentTotal =
    principalStages.reduce(
      (sum, stage) =>
        sum +
        parsePercent(
          stage.sharePercent
        ),
      0
    );

  const principalAmountTotal =
    principalStages.reduce(
      (sum, stage) =>
        sum +
        parseMoney(
          stage.expectedAmount
        ),
      0
    );

  const additionalAmountTotal =
    additionalStages.reduce(
      (sum, stage) =>
        sum +
        parseMoney(
          stage.expectedAmount
        ),
      0
    );

  function distributePrincipalStages() {
    setStages(
      (current) => {
        const principalIndexes =
          current
            .map(
              (
                stage,
                index
              ) => ({
                stage,
                index,
              })
            )
            .filter(
              ({ stage }) =>
                isPrincipalStage(
                  stage.type
                )
            )
            .map(
              ({ index }) =>
                index
            );

        if (
          principalIndexes.length ===
          0
        ) {
          return current;
        }

        const lastIndex =
          principalIndexes[
            principalIndexes.length -
              1
          ];

        let used = 0;

        const next =
          current.map(
            (
              stage,
              index
            ) => {
              if (
                !isPrincipalStage(
                  stage.type
                )
              ) {
                return stage;
              }

              if (
                index ===
                lastIndex
              ) {
                return stage;
              }

              const amount =
                finalCommission *
                (parsePercent(
                  stage.sharePercent
                ) /
                  100);

              used += amount;

              return {
                ...stage,
                expectedAmount:
                  formatInputMoney(
                    amount
                  ),
              };
            }
          );

        const remaining =
          Math.max(
            0,
            finalCommission -
              used
          );

        return next.map(
          (
            stage,
            index
          ) =>
            index ===
            lastIndex
              ? {
                  ...stage,
                  expectedAmount:
                    formatInputMoney(
                      remaining
                    ),
                }
              : stage
        );
      }
    );
  }

  function updateStageType(
    key: string,
    type: StageType
  ) {
    setStages(
      (current) => {
        let next =
          current.map(
            (stage) => {
              if (
                stage.key !== key
              ) {
                return stage;
              }

              const becameExtra =
                !isPrincipalStage(
                  type
                );

              return {
                ...stage,
                type,

                label:
                  type ===
                  "ATO"
                    ? "Ato"
                    : type ===
                        "BANCO"
                      ? "Assinatura banco"
                      : type ===
                          "PREMIO"
                        ? "Prêmio"
                        : stage.label,

                sharePercent:
                  becameExtra
                    ? ""
                    : stage.sharePercent,
              };
            }
          );

        next =
          rebalanceLastPrincipal(
            next,
            finalCommission
          );

        return next;
      }
    );
  }

  function updateSharePercent(
    key: string,
    value: string
  ) {
    setStages(
      (current) => {
        const principalIndexes =
          current
            .map(
              (
                stage,
                index
              ) => ({
                stage,
                index,
              })
            )
            .filter(
              ({ stage }) =>
                isPrincipalStage(
                  stage.type
                )
            )
            .map(
              ({ index }) =>
                index
            );

        const currentIndex =
          current.findIndex(
            (stage) =>
              stage.key === key
          );

        const lastIndex =
          principalIndexes.at(
            -1
          );

        let next =
          current.map(
            (
              stage,
              index
            ) => {
              if (
                stage.key !== key
              ) {
                return stage;
              }

              const updated = {
                ...stage,
                sharePercent:
                  value,
              };

              if (
                isPrincipalStage(
                  stage.type
                ) &&
                index !==
                  lastIndex
              ) {
                updated.expectedAmount =
                  formatInputMoney(
                    finalCommission *
                      (parsePercent(
                        value
                      ) /
                        100)
                  );
              }

              return updated;
            }
          );

        if (
          currentIndex !==
          lastIndex
        ) {
          next =
            rebalanceLastPrincipal(
              next,
              finalCommission
            );
        }

        return next;
      }
    );
  }

  function updateExpectedAmount(
    key: string,
    value: string
  ) {
    setStages(
      (current) => {
        const currentIndex =
          current.findIndex(
            (stage) =>
              stage.key === key
          );

        let next =
          current.map(
            (stage) =>
              stage.key ===
              key
                ? {
                    ...stage,
                    expectedAmount:
                      value,
                  }
                : stage
          );

        const principalIndexes =
          next
            .map(
              (
                stage,
                index
              ) => ({
                stage,
                index,
              })
            )
            .filter(
              ({ stage }) =>
                isPrincipalStage(
                  stage.type
                )
            )
            .map(
              ({ index }) =>
                index
            );

        const lastIndex =
          principalIndexes.at(
            -1
          );

        if (
          currentIndex !==
            -1 &&
          currentIndex !==
            lastIndex &&
          isPrincipalStage(
            next[currentIndex]
              .type
          )
        ) {
          next =
            rebalanceLastPrincipal(
              next,
              finalCommission
            );
        }

        return next;
      }
    );
  }

  function updateLabel(
    key: string,
    label: string
  ) {
    setStages(
      (current) =>
        current.map(
          (stage) =>
            stage.key === key
              ? {
                  ...stage,
                  label,
                }
              : stage
        )
    );
  }

  function addStage() {
    setStages(
      (current) => [
        ...current,

        {
          key:
            crypto.randomUUID(),
          type: "PREMIO",
          label: "Prêmio",
          sharePercent:
            "",
          expectedAmount:
            "",
        },
      ]
    );
  }

  function removeStage(
    key: string
  ) {
    setStages(
      (current) => {
        const next =
          current.filter(
            (stage) =>
              stage.key !== key
          );

        return rebalanceLastPrincipal(
          next,
          finalCommission
        );
      }
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const form =
        new FormData(
          event.currentTarget
        );

      const body = {
        clientName:
          String(
            form.get(
              "clientName"
            ) || ""
          ).trim(),

        clientCpfCnpj:
          String(
            form.get(
              "clientCpfCnpj"
            ) || ""
          ).trim() ||
          null,

        clientPhone:
          String(
            form.get(
              "clientPhone"
            ) || ""
          ).trim() ||
          null,

        clientEmail:
          String(
            form.get(
              "clientEmail"
            ) || ""
          ).trim() ||
          null,

        construtoraId:
          String(
            form.get(
              "construtoraId"
            ) || ""
          ).trim() ||
          null,

        empreendimentoId:
          String(
            form.get(
              "empreendimentoId"
            ) || ""
          ).trim() ||
          null,

        construtoraNameManual:
          String(
            form.get(
              "construtoraNameManual"
            ) || ""
          ).trim() ||
          null,

        empreendimentoNameManual:
          String(
            form.get(
              "empreendimentoNameManual"
            ) || ""
          ).trim() ||
          null,

        unit:
          String(
            form.get("unit") ||
              ""
          ).trim() ||
          null,

        block:
          String(
            form.get("block") ||
              ""
          ).trim() ||
          null,

        saleDate:
          String(
            form.get(
              "saleDate"
            ) || ""
          ).trim() ||
          null,

        vgv:
          vgv || null,

        commissionInputMode:
          inputMode,

        commissionPercent:
          commissionPercent ||
          null,

        commissionManualAmount:
          manualCommission ||
          null,

        stages:
          stages.map(
            (
              stage,
              index
            ) => ({
              type:
                stage.type,

              label:
                stage.label.trim() ||
                null,

              sequence:
                index,

              commissionSharePercent:
                isPrincipalStage(
                  stage.type
                )
                  ? stage.sharePercent ||
                    null
                  : null,

              expectedGrossAmount:
                stage.expectedAmount ||
                null,
            })
          ),

        notes:
          String(
            form.get("notes") ||
              ""
          ).trim() ||
          null,
      };

      const response =
        await fetch(
          "/api/financeiro/vendas/create",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                body
              ),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível cadastrar a venda."
        );
      }

      router.push(
        `/admin/financeiro/vendas/${data.sale.id}`
      );
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

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-6"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold text-gray-900">
            Dados da venda
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Preencha o que já
            estiver disponível. Os
            dados podem ser
            complementados depois.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Cliente *
            </span>

            <input
              required
              name="clientName"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Data da venda
            </span>

            <input
              type="date"
              name="saleDate"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              CPF/CNPJ do cliente
            </span>

            <input
              name="clientCpfCnpj"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Telefone
            </span>

            <input
              name="clientPhone"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              E-mail
            </span>

            <input
              name="clientEmail"
              type="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div />

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Construtora cadastrada
            </span>

            <select
              name="construtoraId"
              value={
                construtoraId
              }
              onChange={(e) =>
                setConstrutoraId(
                  e.target.value
                )
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Não selecionar
              </option>

              {construtoras.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Empreendimento cadastrado
            </span>

            <select
              name="empreendimentoId"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Não selecionar
              </option>

              {filteredEmpreendimentos.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Construtora manual
            </span>

            <input
              name="construtoraNameManual"
              placeholder="Se ainda não estiver cadastrada"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Empreendimento manual
            </span>

            <input
              name="empreendimentoNameManual"
              placeholder="Se ainda não estiver cadastrado"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Bloco
            </span>

            <input
              name="block"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Unidade
            </span>

            <input
              name="unit"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold text-gray-900">
            Comissão da imobiliária
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Informe diretamente
            ou calcule pelo VGV.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              Forma de cálculo
            </span>

            <select
              value={
                inputMode
              }
              onChange={(e) =>
                setInputMode(
                  e.target
                    .value as typeof inputMode
                )
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="MANUAL_AMOUNT">
                Valor da comissão
                informado
              </option>

              <option value="VGV_PERCENT">
                Percentual sobre VGV
              </option>

              <option value="VGV_PERCENT_OVERRIDE">
                % VGV com ajuste
                manual
              </option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-gray-700">
              VGV
            </span>

            <input
              value={vgv}
              onChange={(e) =>
                setVgv(
                  e.target.value
                )
              }
              placeholder="0,00"
              inputMode="decimal"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {inputMode !==
            "MANUAL_AMOUNT" && (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">
                Comissão %
              </span>

              <input
                value={
                  commissionPercent
                }
                onChange={(e) =>
                  setCommissionPercent(
                    e.target.value
                  )
                }
                inputMode="decimal"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          {(inputMode ===
            "MANUAL_AMOUNT" ||
            inputMode ===
              "VGV_PERCENT_OVERRIDE") && (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">
                {inputMode ===
                "MANUAL_AMOUNT"
                  ? "Comissão total"
                  : "Valor final ajustado"}
              </span>

              <input
                value={
                  manualCommission
                }
                onChange={(e) =>
                  setManualCommission(
                    e.target.value
                  )
                }
                inputMode="decimal"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <div className="rounded-md border bg-gray-50 p-4 md:col-span-3">
            <div className="text-xs uppercase text-gray-500">
              Comissão principal
              considerada
            </div>

            <div className="mt-1 text-xl font-semibold">
              R${" "}
              {formatInputMoney(
                finalCommission
              )}
            </div>

            {inputMode ===
              "VGV_PERCENT_OVERRIDE" && (
              <div className="mt-1 text-xs text-gray-500">
                Cálculo original pelo
                VGV: R${" "}
                {formatInputMoney(
                  calculatedByVgv
                )}
              </div>
            )}

            <button
              type="button"
              onClick={
                distributePrincipalStages
              }
              className="mt-3 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Distribuir pelas
              etapas
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              Etapas de recebimento
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Ato e banco distribuem
              a comissão principal.
              Prêmios e complementos
              podem ser adicionais.
            </p>
          </div>

          <button
            type="button"
            onClick={
              addStage
            }
            className="rounded-md border px-3 py-2 text-sm"
          >
            Adicionar etapa
          </button>
        </div>

        <div className="space-y-4 p-5">
          {stages.map(
            (
              stage,
              index
            ) => {
              const principal =
                isPrincipalStage(
                  stage.type
                );

              const principalIndexes =
                stages
                  .map(
                    (
                      item,
                      itemIndex
                    ) => ({
                      item,
                      itemIndex,
                    })
                  )
                  .filter(
                    ({ item }) =>
                      isPrincipalStage(
                        item.type
                      )
                  )
                  .map(
                    ({
                      itemIndex,
                    }) =>
                      itemIndex
                  );

              const isLastPrincipal =
                principal &&
                principalIndexes.at(
                  -1
                ) === index;

              return (
                <div
                  key={
                    stage.key
                  }
                  className="rounded-lg border bg-gray-50 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-4">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600">
                        Tipo
                      </span>

                      <select
                        value={
                          stage.type
                        }
                        onChange={(e) =>
                          updateStageType(
                            stage.key,
                            e.target
                              .value as StageType
                          )
                        }
                        className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                      >
                        <option value="ATO">
                          Ato
                        </option>

                        <option value="BANCO">
                          Assinatura
                          banco
                        </option>

                        <option value="PREMIO">
                          Prêmio
                        </option>

                        <option value="COMPLEMENTO">
                          Complemento
                        </option>

                        <option value="OUTRO">
                          Outro
                        </option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600">
                        Nome /
                        observação
                      </span>

                      <input
                        value={
                          stage.label
                        }
                        onChange={(e) =>
                          updateLabel(
                            stage.key,
                            e.target
                              .value
                          )
                        }
                        className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                      />
                    </label>

                    {principal ? (
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600">
                          {isLastPrincipal
                            ? "% previsto"
                            : "% da comissão"}
                        </span>

                        <input
                          value={
                            stage.sharePercent
                          }
                          onChange={(e) =>
                            updateSharePercent(
                              stage.key,
                              e.target
                                .value
                            )
                          }
                          inputMode="decimal"
                          className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                        />

                        {isLastPrincipal && (
                          <div className="text-xs text-gray-500">
                            O valor final
                            fecha pelo saldo
                            restante.
                          </div>
                        )}
                      </label>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-gray-600">
                          Natureza
                        </span>

                        <div className="rounded-md border bg-white px-3 py-2 text-sm text-gray-600">
                          Adicional fora
                          da comissão
                          principal
                        </div>
                      </div>
                    )}

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600">
                        {principal
                          ? isLastPrincipal
                            ? "Saldo previsto"
                            : "Valor previsto"
                          : "Valor adicional"}
                      </span>

                      <input
                        value={
                          stage.expectedAmount
                        }
                        onChange={(e) =>
                          updateExpectedAmount(
                            stage.key,
                            e.target
                              .value
                          )
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Etapa{" "}
                      {index + 1}
                    </span>

                    {stages.length >
                      1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeStage(
                            stage.key
                          )
                        }
                        className="text-xs text-red-600"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div
              className={[
                "rounded-md border px-4 py-3 text-sm",
                Math.abs(
                  principalPercentTotal -
                    100
                ) < 0.001
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-yellow-200 bg-yellow-50 text-yellow-800",
              ].join(" ")}
            >
              Comissão principal
              distribuída:{" "}
              <strong>
                {principalPercentTotal.toLocaleString(
                  "pt-BR",
                  {
                    maximumFractionDigits: 4,
                  }
                )}
                %
              </strong>
            </div>

            <div className="rounded-md border bg-gray-50 px-4 py-3 text-sm">
              Valor principal nas
              etapas:{" "}
              <strong>
                R${" "}
                {formatInputMoney(
                  principalAmountTotal
                )}
              </strong>
            </div>

            <div className="rounded-md border bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Valores adicionais:{" "}
              <strong>
                R${" "}
                {formatInputMoney(
                  additionalAmountTotal
                )}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-gray-700">
            Observações gerais
          </span>

          <textarea
            name="notes"
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() =>
            router.back()
          }
          className="rounded-md border px-4 py-2 text-sm"
        >
          Cancelar
        </button>

        <button
          disabled={loading}
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading
            ? "Salvando..."
            : "Cadastrar venda"}
        </button>
      </div>
    </form>
  );
}