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

import EntitlementCard from "./EntitlementCard";
import FinancialStatusBadge from "./FinancialStatusBadge";
import InvoiceCard from "./InvoiceCard";
import ReceiptCard from "./ReceiptCard";
import ReconciliationCard from "./ReconciliationCard";
import TaxCard from "./TaxCard";
import StageSettlementActions from "./StageSettlementActions";


type Props = {
  stage: {
    id: string;
    type: string;
    label: string | null;
    status: string;

    commissionSharePercent:
      | number
      | null;

    expectedGrossAmount:
      | number
      | null;

    invoices: Array<{
      id: string;
      number: string | null;
      grossAmount: number | null;
      issuedAt: string | null;
      status: string;

      taxEntries: Array<{
        id: string;
        invoiceId: string;
        name: string;
        kind: string;
        rate: number | null;
        amount: number | null;
        status: string;
      }>;
    }>;

    receipts: Array<{
      id: string;
      amount: number | null;
      receivedAt: string | null;
      status: string;
      reference: string | null;
    }>;

    entitlements: Array<{
      id: string;
      role: string;
      calculationBasis: string;

      percentage:
        | number
        | null;

      calculatedAmount:
        | number
        | null;

      overrideAmount:
        | number
        | null;

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

      adjustmentAllocations: Array<{
        amount: number;

        adjustment: {
          effect: string;
        };
      }>;
    }>;

    companyAllocations: Array<{
      amount: number;
    }>;
  };

  participants: Array<{
    id: string;
    name: string;
  }>;

  vgv: number;

  canRedistribute?: boolean;
};

function sumRates(
  values: Array<{
    rate: number | null;
  }>
) {
  return values.reduce(
    (sum, item) =>
      sum +
      Number(
        item.rate || 0
      ),
    0
  );
}

export default function StageCard({
  stage,
  participants,
  vgv,
  canRedistribute = false,
}: Props) {
  const router =
    useRouter();

  const [
    editingStage,
    setEditingStage,
  ] =
    useState(false);

  const [
    savingStage,
    setSavingStage,
  ] =
    useState(false);

  const [
    stageError,
    setStageError,
  ] =
    useState<
      string | null
    >(null);

    const [
  redistributing,
  setRedistributing,
] =
  useState(false);

const [
  redistributionError,
  setRedistributionError,
] =
  useState<
    string | null
  >(null);

  const taxes =
    stage.invoices.flatMap(
      (invoice) =>
        invoice.taxEntries
    );

  const activeTaxes =
    taxes.filter(
      (tax) =>
        tax.status !==
        "CANCELLED"
    );

  // =========================
  // NOTAS
  // =========================

  const invoiceGross =
    stage.invoices
      .filter(
        (invoice) =>
          invoice.status ===
          "ISSUED"
      )
      .reduce(
        (sum, invoice) =>
          sum +
          Number(
            invoice.grossAmount ||
              0
          ),
        0
      );

  const grossCommission =
    invoiceGross > 0
      ? invoiceGross
      : Number(
          stage.expectedGrossAmount ||
            0
        );

  // =========================
  // RETENÇÃO NA FONTE
  // =========================

  const withheldTaxEntries =
    activeTaxes.filter(
      (tax) =>
        tax.kind ===
        "WITHHELD_AT_SOURCE"
    );

  const withheldTaxes =
    withheldTaxEntries.reduce(
      (sum, tax) =>
        sum +
        Number(
          tax.amount || 0
        ),
      0
    );

  const withheldRate =
    sumRates(
      withheldTaxEntries
    );

  // =========================
  // IMPOSTO A PAGAR FUTURO
  // =========================

  const payableTaxEntries =
    activeTaxes.filter(
      (tax) =>
        tax.kind ===
        "PAYABLE_BY_COMPANY"
    );

  const payableTaxes =
    payableTaxEntries.reduce(
      (sum, tax) =>
        sum +
        Number(
          tax.amount || 0
        ),
      0
    );

  const payableRate =
    sumRates(
      payableTaxEntries
    );

  // =========================
  // CARGA TRIBUTÁRIA TOTAL
  // =========================

  const totalTaxes =
    withheldTaxes +
    payableTaxes;

  const totalTaxRate =
    withheldRate +
    payableRate;

  // =========================
  // LÍQUIDOS FISCAIS
  // =========================

  const expectedNetReceipt =
    Math.max(
      0,
      invoiceGross -
        withheldTaxes
    );

  const netAfterWithholding =
    grossCommission -
    withheldTaxes;

  const netAfterAllTaxes =
    grossCommission -
    withheldTaxes -
    payableTaxes;

  // =========================
  // RECEBIMENTO REAL
  // =========================

  const totalReceived =
    stage.receipts
      .filter(
        (receipt) =>
          receipt.status ===
          "CONFIRMED"
      )
      .reduce(
        (sum, receipt) =>
          sum +
          Number(
            receipt.amount || 0
          ),
        0
      );

  // =========================
  // DIREITOS DOS PARTICIPANTES
  // =========================

  const participantRights =
    stage.entitlements
      .filter(
        (entitlement) =>
          entitlement.status !==
          "CANCELLED"
      )
      .reduce(
        (sum, entitlement) =>
          sum +
          Number(
            entitlement.finalAmount
          ),
        0
      );

  // =========================
  // PARTICIPANTES PAGOS
  // =========================

  const participantPaid =
    stage.entitlements.reduce(
      (
        entitlementTotal,
        entitlement
      ) =>
        entitlementTotal +
        entitlement.paymentAllocations
          .filter(
            (allocation) =>
              allocation.payment
                .status ===
              "PAID"
          )
          .reduce(
            (
              allocationTotal,
              allocation
            ) =>
              allocationTotal +
              Number(
                allocation.amount
              ),
            0
          ),
      0
    );

    const participantDebitAdjustments =
  stage.entitlements.reduce(
    (
      entitlementTotal,
      entitlement
    ) =>
      entitlementTotal +
      entitlement.adjustmentAllocations
        .filter(
          (allocation) =>
            allocation.adjustment
              .effect ===
            "DEBIT"
        )
        .reduce(
          (
            allocationTotal,
            allocation
          ) =>
            allocationTotal +
            Number(
              allocation.amount
            ),
          0
        ),
    0
  );

const participantSettled =
  participantPaid +
  participantDebitAdjustments;
  // =========================
  // IMPOSTO JÁ SEPARADO
  // =========================

  const taxSeparated =
    payableTaxEntries
      .filter(
        (tax) =>
          tax.status ===
            "SEPARATED" ||
          tax.status ===
            "PAID"
      )
      .reduce(
        (sum, tax) =>
          sum +
          Number(
            tax.amount || 0
          ),
        0
      );

  // =========================
  // RESULTADO ECONÔMICO
  // =========================
  //
  // totalReceived já chegou
  // líquido da retenção.
  // Então NÃO descontamos
  // retenção novamente.
  // =========================

  const economicCompanyNet =
    totalReceived -
    payableTaxes -
    participantRights;

  // =========================
  // LÍQUIDO JÁ APROPRIADO
  // =========================

  const companyAllocated =
    stage.companyAllocations.reduce(
      (sum, allocation) =>
        sum +
        Number(
          allocation.amount
        ),
      0
    );

  // =========================
  // PROVA REAL
  // =========================

  const cashDifference =
  totalReceived -
  taxSeparated -
  participantSettled -
  companyAllocated;

  // =========================
  // STATUS VISUAL
  // =========================

  let tone:
    | "gray"
    | "blue"
    | "yellow"
    | "green"
    | "red" =
    "yellow";

  if (
    stage.status ===
    "EXPECTED"
  ) {
    tone = "gray";
  }

  if (
    stage.status ===
      "INVOICED" ||
    stage.status ===
      "AWAITING_RECEIPT" ||
    stage.status ===
      "RECEIVED"
  ) {
    tone = "blue";
  }

  if (
    stage.status ===
    "PARTIALLY_RECEIVED"
  ) {
    tone = "yellow";
  }

  if (
    stage.status ===
    "RESOLVED"
  ) {
    tone = "green";
  }

  if (
    stage.status ===
    "CANCELLED"
  ) {
    tone = "red";
  }

  async function handleStageUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget
      );

    setSavingStage(true);
    setStageError(null);

    try {
      const response =
        await fetch(
          "/api/financeiro/etapas/update",
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
                  stage.id,

                type:
                  String(
                    form.get(
                      "type"
                    ) || ""
                  ),

                label:
                  String(
                    form.get(
                      "label"
                    ) || ""
                  ),

                commissionSharePercent:
                  String(
                    form.get(
                      "commissionSharePercent"
                    ) || ""
                  ),

                expectedGrossAmount:
                  String(
                    form.get(
                      "expectedGrossAmount"
                    ) || ""
                  ),

                notes:
                  String(
                    form.get(
                      "notes"
                    ) || ""
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
            "Erro ao editar etapa."
        );
      }

      setEditingStage(
        false
      );

      router.refresh();
    } catch (error) {
      setStageError(
        error instanceof Error
          ? error.message
          : "Erro ao editar etapa."
      );
    } finally {
      setSavingStage(
        false
      );
    }
  }

async function redistributeRemaining() {
  const confirmed =
    window.confirm(
      "Redistribuir o saldo restante desta venda e herdar os mesmos participantes e regras da etapa principal anterior?"
    );

  if (!confirmed) {
    return;
  }

  setRedistributing(true);
  setRedistributionError(null);

  try {
    const response =
      await fetch(
        "/api/financeiro/etapas/redistribuir",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              stageId:
                stage.id,
            }),
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
          "Não foi possível redistribuir a etapa."
      );
    }

    router.refresh();
  } catch (error) {
    setRedistributionError(
      error instanceof Error
        ? error.message
        : "Erro ao redistribuir etapa."
    );
  } finally {
    setRedistributing(false);
  }
}

  return (
    <div className="overflow-hidden rounded-xl border bg-gray-50">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {stage.label ||
                (stage.type ===
                "ATO"
                  ? "Ato"
                  : stage.type ===
                      "BANCO"
                    ? "Assinatura banco"
                    : stage.type)}
            </h2>

            <FinancialStatusBadge
              label={
                stage.status
              }
              tone={
                tone
              }
            />
          </div>

          <div className="mt-1 text-sm text-gray-500">
            {stage.commissionSharePercent
              ? `${stage.commissionSharePercent}% da comissão`
              : stage.type ===
                    "PREMIO" ||
                  stage.type ===
                    "COMPLEMENTO" ||
                  stage.type ===
                    "OUTRO"
                ? "Valor adicional"
                : "Percentual não informado"}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs uppercase text-gray-500">
            Valor previsto
          </div>

          <div className="mt-1 text-xl font-semibold text-gray-900">
            {formatBRL(
              stage.expectedGrossAmount ||
                0
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setEditingStage(
                (value) =>
                  !value
              )
            }
            className="mt-2 text-xs font-medium text-gray-600 underline"
          >
            {editingStage
              ? "Cancelar edição"
              : "Editar etapa"}
          </button>
          {canRedistribute && (
  <div className="mt-2">
    <button
      type="button"
      disabled={
        redistributing
      }
      onClick={
        redistributeRemaining
      }
      className="rounded-md border bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {redistributing
        ? "Redistribuindo..."
        : "Redistribuir saldo restante"}
    </button>
  </div>
)}
        </div>
      </div>
    {redistributionError && (
  <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {redistributionError}
  </div>
)}
      {editingStage && (
        <form
          onSubmit={
            handleStageUpdate
          }
          className="space-y-3 border-b bg-gray-100 p-4"
        >
          {stageError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {
                stageError
              }
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs text-gray-600">
                Tipo
              </span>

              <select
                name="type"
                defaultValue={
                  stage.type
                }
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="ATO">
                  Ato
                </option>

                <option value="BANCO">
                  Assinatura banco
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
              <span className="text-xs text-gray-600">
                Nome
              </span>

              <input
                name="label"
                defaultValue={
                  stage.label ||
                  ""
                }
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-600">
                % da comissão
              </span>

              <input
                name="commissionSharePercent"
                defaultValue={
                  stage.commissionSharePercent ??
                  ""
                }
                inputMode="decimal"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-600">
                Valor previsto
              </span>

              <input
                name="expectedGrossAmount"
                defaultValue={
                  stage.expectedGrossAmount ??
                  ""
                }
                inputMode="decimal"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-gray-600">
              Observação da etapa
            </span>

            <input
              name="notes"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>

          <div className="flex justify-end">
            <button
              disabled={
                savingStage
              }
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingStage
                ? "Salvando..."
                : "Salvar etapa"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4 p-4">
        {/* 1. NOTA */}

        <InvoiceCard
          stageId={
            stage.id
          }
          invoices={
            stage.invoices
          }
        />

        {/* 2. IMPOSTOS */}

        <TaxCard
          invoices={stage.invoices.map(
            (invoice) => ({
              id:
                invoice.id,

              label: `NF ${
                invoice.number ||
                "sem número"
              }`,

              grossAmount:
                Number(
                  invoice.grossAmount ||
                    0
                ),
            })
          )}
          taxes={
            taxes
          }
        />

        {/* 3. RECEBIMENTO */}

        <ReceiptCard
          stageId={
            stage.id
          }
          receipts={
            stage.receipts
          }
          grossInvoiced={
            invoiceGross
          }
          withheldTaxes={
            withheldTaxes
          }
        />

        {/* 4. PARTICIPANTES */}

        <EntitlementCard
          stageId={
            stage.id
          }
          participants={
            participants
          }
          entitlements={
            stage.entitlements
          }
          calculationContext={{
            grossCommission,

            netAfterWithholding,

            netAfterAllTaxes,

            vgv,
          }}
        />

        {/* 5. RESULTADO + CONCILIAÇÃO */}

          <StageSettlementActions
  stageId={
    stage.id
  }
  taxes={
    payableTaxEntries.map(
      (tax) => ({
        id:
          tax.id,

        name:
          tax.name,

        amount:
          tax.amount,

        rate:
          tax.rate,

        status:
          tax.status,
      })
    )
  }
  cashDifference={
    cashDifference
  }
/>

        <ReconciliationCard
          invoiceGross={
            invoiceGross
          }

          withheldTax={
            withheldTaxes
          }

          withheldRate={
            withheldRate
          }

          expectedNetReceipt={
            expectedNetReceipt
          }

          received={
            totalReceived
          }

          payableTax={
            payableTaxes
          }

          payableRate={
            payableRate
          }

          totalTax={
            totalTaxes
          }

          totalTaxRate={
            totalTaxRate
          }

          participantRights={
            participantRights
          }

          economicCompanyNet={
            economicCompanyNet
          }

          taxSeparated={
            taxSeparated
          }

          participantPaid={
        participantSettled
        }

          companyAllocated={
            companyAllocated
          }

          cashDifference={
            cashDifference
          }
        />
      </div>
    </div>
  );
}