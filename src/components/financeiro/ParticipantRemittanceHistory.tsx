"use client";

import { useState } from "react";
import Link from "next/link";

import FinancialAttachmentsManager from "@/components/financeiro/FinancialAttachmentsManager";
import { formatBRL } from "@/lib/financeiro/money";

type RemittanceItem = {
  allocationId: string;

  entitlementId: string;

  clientName: string;

  construtora:
    | string
    | null;

  empreendimento:
    | string
    | null;

  stageType: string;

  stageLabel:
    | string
    | null;

  vgv:
    | number
    | null;

  saleCommission:
    | number
    | null;

  calculationBasis: string;

  percentage:
    | number
    | null;

  calculationBaseAmount:
    | number
    | null;

  fixedAmount:
    | number
    | null;

  calculatedAmount:
    | number
    | null;

  overrideAmount:
    | number
    | null;

  entitlementFinalAmount: number;

  valeApplied: number;

  pixAllocation: number;
};

type RemittanceAttachment = {
  id: string;

  type: string;

  title:
    | string
    | null;

  originalName: string;

  url: string;

  mimeType:
    | string
    | null;

  sizeBytes:
    | number
    | null;

  createdAt:
    | string
    | Date;
};

export type RemittanceHistoryItem = {
  id: string;

  paidAt:
    | string
    | null;

  amount: number;

  status: string;

  notes:
    | string
    | null;

  destinationPixType:
    | string
    | null;

  destinationPixKey:
    | string
    | null;

  destinationBankName:
    | string
    | null;

  destinationHolderName:
    | string
    | null;

  totalRights: number;

  totalVales: number;

  items: RemittanceItem[];

  attachments: RemittanceAttachment[];
};

function dateBR(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "UTC",
    }
  ).format(
    new Date(value)
  );
}

function basisLabel(
  basis: string
) {
  switch (basis) {
    case "COMMISSION_GROSS":
      return "Sobre comissão bruta";

    case "COMMISSION_NET_AFTER_WITHHOLDING":
      return "Sobre comissão após retenção";

    case "COMMISSION_NET_AFTER_ALL_TAXES":
      return "Sobre comissão após impostos";

    case "VGV":
      return "Sobre VGV";

    case "FIXED":
      return "Valor fixo";

    case "MANUAL":
      return "Manual";

    default:
      return basis;
  }
}

function ruleText(
  item: RemittanceItem
) {
  if (
    item.calculationBasis ===
    "FIXED"
  ) {
    return `Valor fixo ${
      item.fixedAmount != null
        ? formatBRL(
            item.fixedAmount
          )
        : ""
    }`;
  }

  if (
    item.calculationBasis ===
    "MANUAL"
  ) {
    return "Valor definido manualmente";
  }

  if (
    item.percentage != null
  ) {
    return `${item.percentage.toLocaleString(
      "pt-BR",
      {
        maximumFractionDigits:
          4,
      }
    )}% • ${basisLabel(
      item.calculationBasis
    )}`;
  }

  return basisLabel(
    item.calculationBasis
  );
}

function paymentDestination(
  remittance: RemittanceHistoryItem
) {
  if (
    remittance.destinationPixKey
  ) {
    return `PIX ${
      remittance.destinationPixType ||
      ""
    } • ${
      remittance.destinationPixKey
    }`;
  }

  if (
    remittance.destinationBankName
  ) {
    return remittance.destinationBankName;
  }

  return "Destino não informado";
}

export default function ParticipantRemittanceHistory({
  remittances,
}: {
  remittances: RemittanceHistoryItem[];
}) {
  const [
    openId,
    setOpenId,
  ] =
    useState<
      string | null
    >(null);

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-gray-900">
          Histórico de remessas
        </h2>

        <p className="mt-1 text-xs text-gray-500">
          PIX agrupados e composição
          das comissões liquidadas.
        </p>
      </div>

      {remittances.length ===
      0 ? (
        <div className="p-6 text-sm text-gray-500">
          Nenhuma remessa registrada
          para este participante.
        </div>
      ) : (
        <div className="divide-y">
          {remittances.map(
            (
              remittance
            ) => {
              const open =
                openId ===
                remittance.id;

              const attachmentCount =
                remittance.attachments.length;

              return (
                <div
                  key={
                    remittance.id
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId(
                        open
                          ? null
                          : remittance.id
                      )
                    }
                    className="grid w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 md:grid-cols-[32px_120px_1fr_150px_150px_120px]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded border bg-white text-xs">
                      {open
                        ? "⌄"
                        : "›"}
                    </div>

                    <div>
                      <div className="text-xs text-gray-500">
                        Data
                      </div>

                      <div className="mt-1 font-medium text-gray-900">
                        {dateBR(
                          remittance.paidAt
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500">
                        Destino
                      </div>

                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {paymentDestination(
                          remittance
                        )}
                      </div>

                      {remittance.destinationHolderName && (
                        <div className="mt-0.5 text-xs text-gray-400">
                          {
                            remittance.destinationHolderName
                          }
                        </div>
                      )}

                      {attachmentCount >
                        0 && (
                        <div className="mt-1 text-[10px] font-medium text-green-700">
                          {attachmentCount}{" "}
                          {attachmentCount ===
                          1
                            ? "comprovante"
                            : "comprovantes"}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs text-gray-500">
                        Direitos
                      </div>

                      <div className="mt-1 font-medium">
                        {formatBRL(
                          remittance.totalRights
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500">
                        Vales
                      </div>

                      <div className="mt-1 font-medium text-red-700">
                        -
                        {formatBRL(
                          remittance.totalVales
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-gray-500">
                        PIX
                      </div>

                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {formatBRL(
                          remittance.amount
                        )}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t bg-gray-50 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
  <div>
    <div className="text-sm text-gray-600">
      {
        remittance.items.length
      }{" "}
      {remittance.items.length ===
      1
        ? "comissão"
        : "comissões"}{" "}
      nesta remessa
    </div>

    <div className="mt-1 text-[10px] text-gray-400">
      ID{" "}
      <span className="font-mono">
        {
          remittance.id
        }
      </span>
    </div>
  </div>

  <Link
    href={`/admin/financeiro/remessas/${remittance.id}/demonstrativo`}
    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
  >
    Gerar demonstrativo
  </Link>
</div>

                      <div className="space-y-3">
                        {remittance.items.map(
                          (
                            item
                          ) => (
                            <div
                              key={
                                item.allocationId
                              }
                              className="rounded-lg border bg-white"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4 border-b px-4 py-3">
                                <div>
                                  <div className="font-semibold text-gray-900">
                                    {
                                      item.clientName
                                    }
                                  </div>

                                  <div className="mt-1 text-xs text-gray-500">
                                    {item.construtora ||
                                      "Construtora não informada"}

                                    {" • "}

                                    {item.empreendimento ||
                                      "Empreendimento não informado"}

                                    {" • "}

                                    {item.stageLabel ||
                                      item.stageType}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="text-[10px] uppercase text-gray-400">
                                    Direito
                                  </div>

                                  <div className="font-semibold text-gray-900">
                                    {formatBRL(
                                      item.entitlementFinalAmount
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-4 px-4 py-3 md:grid-cols-3 lg:grid-cols-6">
                                <div>
                                  <div className="text-[10px] uppercase text-gray-400">
                                    VGV
                                  </div>

                                  <div className="mt-1 text-sm font-medium">
                                    {item.vgv !=
                                    null
                                      ? formatBRL(
                                          item.vgv
                                        )
                                      : "—"}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[10px] uppercase text-gray-400">
                                    Comissão venda
                                  </div>

                                  <div className="mt-1 text-sm font-medium">
                                    {item.saleCommission !=
                                    null
                                      ? formatBRL(
                                          item.saleCommission
                                        )
                                      : "—"}
                                  </div>
                                </div>

                                <div className="lg:col-span-2">
                                  <div className="text-[10px] uppercase text-gray-400">
                                    Regra
                                  </div>

                                  <div className="mt-1 text-sm font-medium text-gray-900">
                                    {ruleText(
                                      item
                                    )}
                                  </div>

                                  {item.calculationBaseAmount !=
                                    null && (
                                    <div className="mt-0.5 text-xs text-gray-500">
                                      Base histórica:{" "}
                                      {formatBRL(
                                        item.calculationBaseAmount
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div className="text-[10px] uppercase text-gray-400">
                                    Vale
                                  </div>

                                  <div
                                    className={[
                                      "mt-1 text-sm font-medium",
                                      item.valeApplied >
                                      0
                                        ? "text-red-700"
                                        : "text-gray-400",
                                    ].join(
                                      " "
                                    )}
                                  >
                                    {item.valeApplied >
                                    0
                                      ? `-${formatBRL(
                                          item.valeApplied
                                        )}`
                                      : formatBRL(
                                          0
                                        )}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[10px] uppercase text-gray-400">
                                    Neste PIX
                                  </div>

                                  <div className="mt-1 text-sm font-semibold text-gray-900">
                                    {formatBRL(
                                      item.pixAllocation
                                    )}
                                  </div>
                                </div>
                              </div>

                              {(item.overrideAmount !=
                                null ||
                                item.calculatedAmount !=
                                  null) && (
                                <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
                                  {item.calculatedAmount !=
                                    null && (
                                    <>
                                      Calculado:{" "}
                                      <strong>
                                        {formatBRL(
                                          item.calculatedAmount
                                        )}
                                      </strong>
                                    </>
                                  )}

                                  {item.overrideAmount !=
                                    null && (
                                    <>
                                      {" • "}
                                      Ajustado manualmente para{" "}
                                      <strong>
                                        {formatBRL(
                                          item.overrideAmount
                                        )}
                                      </strong>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3">
                        <div>
                          <div className="text-xs text-gray-500">
                            Total dos direitos
                          </div>

                          <div className="mt-1 font-semibold">
                            {formatBRL(
                              remittance.totalRights
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">
                            Vales compensados
                          </div>

                          <div className="mt-1 font-semibold text-red-700">
                            -
                            {formatBRL(
                              remittance.totalVales
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-gray-500">
                            PIX realizado
                          </div>

                          <div className="mt-1 text-lg font-semibold">
                            {formatBRL(
                              remittance.amount
                            )}
                          </div>
                        </div>
                      </div>

                      {remittance.notes && (
                        <div className="mt-3 rounded-lg border bg-white p-4">
                          <div className="text-xs font-medium uppercase text-gray-400">
                            Observação
                          </div>

                          <div className="mt-2 text-sm text-gray-700">
                            {
                              remittance.notes
                            }
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <FinancialAttachmentsManager
                          entityType="PAYMENT"
                          entityId={
                            remittance.id
                          }
                          attachmentType="PARTICIPANT_PAYMENT"
                          initialAttachments={
                            remittance.attachments
                          }
                          title="Comprovantes da remessa"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}