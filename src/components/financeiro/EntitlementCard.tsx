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

import EntitlementPaymentPanel from "./EntitlementPaymentPanel";

type Participant = {
  id: string;
  name: string;
};

type Entitlement = {
  id: string;

  role: string;

  calculationBasis: string;

  percentage: number | null;

  calculatedAmount: number | null;

  overrideAmount: number | null;

  finalAmount: number;

  status: string;

  participant: {
    name: string;
  };

  paymentAllocations: Array<{
    amount: number;

    payment: {
      status: string;
    };
  }>;
};

type CalculationContext = {
  grossCommission: number;
  netAfterWithholding: number;
  netAfterAllTaxes: number;
  vgv: number;
};

function parseNumber(
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

export default function EntitlementCard({
  stageId,
  participants,
  entitlements,
  calculationContext,
}: {
  stageId: string;
  participants: Participant[];
  entitlements: Entitlement[];
  calculationContext: CalculationContext;
}) {
  const router =
    useRouter();

  const [creating, setCreating] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    calculationBasis,
    setCalculationBasis,
  ] = useState("MANUAL");

  const [percentage, setPercentage] =
    useState("");

  const [finalAmount, setFinalAmount] =
    useState("");

 const [
  payingId,
  setPayingId,
] = useState<string | null>(
  null
);   

  const [
    manuallyChanged,
    setManuallyChanged,
  ] = useState(false);

  const calculationBase =
    useMemo(() => {
      switch (
        calculationBasis
      ) {
        case "COMMISSION_GROSS":
          return calculationContext.grossCommission;

        case "COMMISSION_NET_AFTER_WITHHOLDING":
          return calculationContext.netAfterWithholding;

        case "COMMISSION_NET_AFTER_ALL_TAXES":
          return calculationContext.netAfterAllTaxes;

        case "VGV":
          return calculationContext.vgv;

        default:
          return 0;
      }
    }, [
      calculationBasis,
      calculationContext,
    ]);

  const percentageMode =
    [
      "COMMISSION_GROSS",
      "COMMISSION_NET_AFTER_WITHHOLDING",
      "COMMISSION_NET_AFTER_ALL_TAXES",
      "VGV",
    ].includes(
      calculationBasis
    );

  const calculated =
    calculationBase *
    (parseNumber(
      percentage
    ) /
      100);


  function changePercentage(
    value: string
  ) {
    setPercentage(value);

    if (
      !manuallyChanged
    ) {
      setFinalAmount(
        value
          ? moneyInput(
              calculationBase *
                (parseNumber(
                  value
                ) /
                  100)
            )
          : ""
      );
    }
  }

  function startCreate() {
    setEditingId(null);

    setCalculationBasis(
      "MANUAL"
    );

    setPercentage("");
    setFinalAmount("");

    setManuallyChanged(
      false
    );

    setCreating(true);
  }

  function startEdit(
    entitlement: Entitlement
  ) {
    setCreating(false);

    setEditingId(
      entitlement.id
    );

    setCalculationBasis(
      entitlement.calculationBasis
    );

    setPercentage(
      entitlement.percentage != null
        ? String(
            entitlement.percentage
          )
        : ""
    );

    setFinalAmount(
      moneyInput(
        entitlement.finalAmount
      )
    );

    setManuallyChanged(
      false
    );
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
    entitlementId?: string
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
          entitlementId
            ? "/api/financeiro/direitos/update"
            : "/api/financeiro/direitos/create",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                id:
                  entitlementId ??
                  null,

                stageId,

                participantId:
                  String(
                    form.get(
                      "participantId"
                    ) || ""
                  ),

                role:
                  String(
                    form.get(
                      "role"
                    ) || ""
                  ),

                calculationBasis,

                percentage:
                  percentage ||
                  null,

                finalAmount,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Erro ao salvar participante."
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
    initial?: Entitlement
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
          {initial ? (
            <div className="rounded-md border bg-white px-3 py-2 text-sm">
              {
                initial.participant
                  .name
              }

              <input
                type="hidden"
                name="participantId"
                value=""
              />
            </div>
          ) : (
            <select
              name="participantId"
              required
              className="rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Participante
              </option>

              {participants.map(
                (participant) => (
                  <option
                    key={
                      participant.id
                    }
                    value={
                      participant.id
                    }
                  >
                    {
                      participant.name
                    }
                  </option>
                )
              )}
            </select>
          )}

          <select
            name="role"
            required
            defaultValue={
              initial?.role ??
              "BROKER"
            }
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="BROKER">
              Corretor
            </option>

            <option value="MANAGER">
              Gerente
            </option>

            <option value="FILE_OPERATOR">
              Operador da pasta
            </option>

            <option value="MARKETING">
              Marketing
            </option>

            <option value="INDICATOR">
              Indicador
            </option>

            <option value="CLOSER">
              Fechamento
            </option>

            <option value="OTHER">
              Outro
            </option>
          </select>

          <select
            value={
              calculationBasis
            }
            onChange={(e) => {
              const next =
                e.target.value;

              setCalculationBasis(
                next
              );

              setPercentage("");
              setFinalAmount("");

              setManuallyChanged(
                false
              );
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="MANUAL">
              Valor manual
            </option>

            <option value="COMMISSION_GROSS">
              % comissão bruta
            </option>

            <option value="COMMISSION_NET_AFTER_WITHHOLDING">
              % após retenção
            </option>

            <option value="COMMISSION_NET_AFTER_ALL_TAXES">
              % após impostos
            </option>

            <option value="VGV">
              % do VGV
            </option>

            <option value="FIXED">
              Valor fixo
            </option>
          </select>

          <div>
            {percentageMode ? (
              <>
                <input
                  value={
                    percentage
                  }
                  onChange={(e) =>
                    changePercentage(
                      e.target.value
                    )
                  }
                  inputMode="decimal"
                  placeholder="%"
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                />

                <div className="mt-1 text-xs text-gray-500">
                  Base:{" "}
                  {formatBRL(
                    calculationBase
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-md border bg-white px-3 py-2 text-sm text-gray-500">
                Sem percentual
              </div>
            )}
          </div>

          <div>
            <input
              value={
                finalAmount
              }
              onChange={(e) => {
                setFinalAmount(
                  e.target.value
                );

                setManuallyChanged(
                  true
                );
              }}
              required
              inputMode="decimal"
              placeholder="Valor final"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />

            {percentageMode &&
              percentage && (
                <div className="mt-1 text-xs text-gray-500">
                  Calculado:{" "}
                  {formatBRL(
                    calculated
                  )}
                </div>
              )}
          </div>
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
              : "Salvar participante"}
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
            Participantes da etapa
          </div>

          <div className="text-xs text-gray-500">
            Corretor, gerente, operador,
            marketing etc.
          </div>
        </div>

        <button
          type="button"
          onClick={
            startCreate
          }
          className="rounded-md border px-3 py-2 text-sm"
        >
          Adicionar participante
        </button>
      </div>

      {creating &&
        form()}

      <div className="divide-y">
        {entitlements.length === 0 &&
          !creating && (
            <div className="p-4 text-sm text-gray-500">
              Nenhum participante financeiro nesta etapa.
            </div>
          )}

        {entitlements.map(
  (entitlement) =>
    editingId ===
    entitlement.id ? (
      <div
        key={
          entitlement.id
        }
      >
        {form(
          entitlement
        )}
      </div>
    ) : (
      <div
        key={
          entitlement.id
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div>
            <div className="font-medium">
              {
                entitlement
                  .participant
                  .name
              }
            </div>

            <div className="mt-1 text-xs text-gray-500">
              {
                entitlement.role
              }{" "}
              •{" "}
              {
                entitlement.calculationBasis
              }
            </div>

            {entitlement.calculatedAmount !=
              null && (
              <div className="mt-1 text-xs text-gray-500">
                Calculado:{" "}
                {formatBRL(
                  entitlement.calculatedAmount
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="font-medium">
                {formatBRL(
                  entitlement.finalAmount
                )}
              </div>

              <div className="text-xs text-gray-500">
                {
                  entitlement.status
                }
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {entitlement.status !==
                "CANCELLED" &&
                entitlement.status !==
                  "PAID" && (
                  <button
                    type="button"
                    onClick={() =>
                      setPayingId(
                        (
                          current
                        ) =>
                          current ===
                          entitlement.id
                            ? null
                            : entitlement.id
                      )
                    }
                    className="text-xs font-medium text-green-700 underline"
                  >
                    {payingId ===
                    entitlement.id
                      ? "Fechar pagamento"
                      : "Pagar"}
                  </button>
                )}

              <button
                type="button"
                onClick={() =>
                  startEdit(
                    entitlement
                  )
                }
                className="text-xs font-medium underline"
              >
                Editar
              </button>
            </div>
          </div>
        </div>

        {payingId ===
          entitlement.id && (
          <EntitlementPaymentPanel
            entitlementId={
              entitlement.id
            }
            onClose={() =>
              setPayingId(
                null
              )
            }
          />
        )}
      </div>
    )
)}
      </div>
    </div>
  );
}