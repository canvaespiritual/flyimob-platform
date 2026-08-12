"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  formatBRL,
} from "@/lib/financeiro/money";

type Attachment = {
  id: string;
  title: string | null;
  originalName: string;
  url: string;
  mimeType: string | null;
};

type StatementItem = {
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

  role: string;

  customRoleLabel:
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

  entitlementFinalAmount: number;

  pixAllocation: number;

  stageContext:
    | "FIRST_WITH_FUTURE"
    | "LATER_WITH_PREVIOUS_PAID"
    | "SINGLE"
    | "EXTRA";

  stageSequence: number;

  stageNumber:
    | number
    | null;

  totalPrincipalStages: number;

  previousStage:
    | {
        type: string;

        label:
          | string
          | null;

        status: string;

        paidAmount: number;

        paidAt:
          | string
          | null;
      }
    | null;

  nextStage:
    | {
        type: string;

        label:
          | string
          | null;

        status: string;

        expectedParticipantAmount:
          | number
          | null;
      }
    | null;
};

type StatementAdjustment = {
  id: string;

  type: string;
  effect: string;

  description:
    | string
    | null;

  occurredAt: string;

  originalAmount: number;

  appliedInRemittance: number;

  attachments: Attachment[];
};

export type RemittanceStatementData = {
  id: string;

  participant: {
    id: string;
    name: string;
    cpfCnpj:
      | string
      | null;
  };

  paidAt:
    | string
    | null;

  amount: number;

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

  items: StatementItem[];

  adjustments:
    StatementAdjustment[];

  attachments: Attachment[];
};

type Options = {
  showClient: boolean;
  showBuilder: boolean;
  showDevelopment: boolean;

  showVgv: boolean;
  showSaleCommission: boolean;
  showStageContext: boolean;

  showRole: boolean;
  showRule: boolean;

  showEntitlement: boolean;
  showPixAllocation: boolean;

  showAdjustments: boolean;
  showAdjustmentBalance: boolean;

  showPaymentDestination: boolean;
  showPaymentDate: boolean;

  showPaymentNotes: boolean;

  showServiceNotice: boolean;
  showDirectorMessage: boolean;
};

const DIRECTOR_MESSAGES = [
  "Obrigado por mais uma venda. Cada resultado é construído com constância, profissionalismo e compromisso com o cliente.",

  "Parabéns por mais uma etapa concluída. Seguimos construindo resultados sólidos, venda após venda.",

  "Mais uma venda entregue e mais um resultado construído. Obrigado pelo comprometimento com a operação.",

  "Obrigado pelo trabalho realizado nesta venda. Que este resultado seja combustível para os próximos.",

  "Cada venda representa confiança conquistada e trabalho bem executado. Parabéns por mais este resultado.",

  "Seguimos avançando juntos. Obrigado pela dedicação e pelo profissionalismo em mais uma venda.",

  "Resultado é consequência de processo bem executado. Parabéns por mais esta entrega.",

  "Mais um ciclo concluído com sucesso. Obrigado por fazer parte da construção deste resultado.",

  "Uma venda termina, novas oportunidades começam. Parabéns pelo resultado e seguimos para a próxima.",

  "Obrigado pela parceria e pelo trabalho realizado. Que este seja apenas mais um entre muitos bons resultados.",
];

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
      return "Valor manual";

    default:
      return basis;
  }
}

function roleLabel(
  role: string,
  custom:
    | string
    | null
) {
  if (
    role === "OTHER" &&
    custom
  ) {
    return custom;
  }

  switch (role) {
    case "BROKER":
      return "Corretor";

    case "MANAGER":
      return "Gerente";

    case "FILE_OPERATOR":
      return "Operador de cadastro";

    case "MARKETING":
      return "Marketing";

    case "INDICATOR":
      return "Indicador";

    case "CLOSER":
      return "Closer";

    case "INCORPORATOR":
      return "Incorporador";

    case "BONUS":
      return "Bonificação";

    default:
      return role;
  }
}

function ruleText(
  item: StatementItem
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

function stageTypeLabel(
  type: string,
  label:
    | string
    | null
) {
  if (
    label &&
    label.trim()
  ) {
    return label;
  }

  switch (type) {
    case "ATO":
      return "Ato";

    case "BANCO":
      return "Assinatura bancária";

    case "PREMIO":
      return "Premiação";

    case "COMPLEMENTO":
      return "Complemento";

    case "OUTRO":
      return "Outra etapa";

    default:
      return type;
  }
}

function stageTitle(
  item: StatementItem
) {
  const label =
    stageTypeLabel(
      item.stageType,
      item.stageLabel
    );

  if (
    item.stageNumber !=
      null &&
    item.totalPrincipalStages >
      1
  ) {
    return `Etapa ${item.stageNumber} — ${label}`;
  }

  if (
    item.stageContext ===
    "EXTRA"
  ) {
    return label;
  }

  return `Etapa única — ${label}`;
}

function stageContextText(
  item: StatementItem
) {
  if (
    item.stageContext ===
      "FIRST_WITH_FUTURE" &&
    item.nextStage
  ) {
    const nextLabel =
      stageTypeLabel(
        item.nextStage.type,
        item.nextStage.label
      );

    if (
      item.nextStage
        .expectedParticipantAmount !=
      null
    ) {
      return `Pagamento referente à primeira etapa da venda. Há previsão de direito financeiro futuro de ${formatBRL(
        item.nextStage
          .expectedParticipantAmount
      )} na etapa ${nextLabel}.`;
    }

    return `Pagamento referente à primeira etapa da venda. A venda possui uma etapa financeira futura prevista: ${nextLabel}.`;
  }

  if (
    item.stageContext ===
      "LATER_WITH_PREVIOUS_PAID" &&
    item.previousStage
  ) {
    const previousLabel =
      stageTypeLabel(
        item.previousStage.type,
        item.previousStage.label
      );

    const dateText =
      item.previousStage.paidAt
        ? ` em ${dateBR(
            item.previousStage.paidAt
          )}`
        : "";

    const amountText =
      item.previousStage
        .paidAmount >
      0
        ? ` no valor de ${formatBRL(
            item.previousStage
              .paidAmount
          )}`
        : "";

    return `${previousLabel} já foi liquidada anteriormente${dateText}${amountText}. Este pagamento corresponde à etapa atual da venda.`;
  }

  if (
    item.stageContext ===
    "EXTRA"
  ) {
    return "Lançamento extraordinário separado das etapas principais da comissão.";
  }

  return "Pagamento referente à etapa financeira única desta venda.";
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;

  onChange:
    (
      value: boolean
    ) => void;

  children:
    React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2">
      <input
        type="checkbox"
        checked={
          checked
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.checked
          )
        }
        className="mt-0.5"
      />

      <span className="text-sm text-gray-700">
        {children}
      </span>
    </label>
  );
}

export default function RemittanceStatementConfigurator({
  remittance,
}: {
  remittance: RemittanceStatementData;
}) {
  const [
    options,
    setOptions,
  ] =
    useState<Options>({
      showClient: true,
      showBuilder: true,
      showDevelopment: true,

      showVgv: true,
      showSaleCommission: true,
      showStageContext: true,

      showRole: true,
      showRule: true,

      showEntitlement: true,
      showPixAllocation: true,

      showAdjustments: true,
      showAdjustmentBalance: true,

      showPaymentDestination: true,
      showPaymentDate: true,

      showPaymentNotes: false,

      showServiceNotice: true,
      showDirectorMessage: true,
    });

  const [
    directorMessage,
    setDirectorMessage,
  ] =
    useState(
      DIRECTOR_MESSAGES[
        Math.abs(
          remittance.id
            .split("")
            .reduce(
              (
                total,
                character
              ) =>
                total +
                character.charCodeAt(
                  0
                ),
              0
            )
        ) %
          DIRECTOR_MESSAGES.length
      ]
    );

  const [
    selectedPaymentAttachments,
    setSelectedPaymentAttachments,
  ] =
    useState<
      string[]
    >(
      remittance.attachments.map(
        (
          attachment
        ) =>
          attachment.id
      )
    );

  const allAdjustmentAttachments =
    useMemo(
      () =>
        remittance.adjustments.flatMap(
          (
            adjustment
          ) =>
            adjustment.attachments.map(
              (
                attachment
              ) => ({
                ...attachment,

                adjustmentId:
                  adjustment.id,

                adjustmentDescription:
                  adjustment.description,
              })
            )
        ),
      [
        remittance.adjustments,
      ]
    );

  const [
    selectedAdjustmentAttachments,
    setSelectedAdjustmentAttachments,
  ] =
    useState<
      string[]
    >([]);

  const [
    generatingPdf,
    setGeneratingPdf,
  ] =
    useState(false);

  const [
    pdfError,
    setPdfError,
  ] =
    useState<
      string | null
    >(null);

  const totalRights =
    useMemo(
      () =>
        remittance.items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.entitlementFinalAmount,
          0
        ),
      [
        remittance.items,
      ]
    );

  const totalAdjustments =
    useMemo(
      () =>
        remittance.adjustments.reduce(
          (
            total,
            adjustment
          ) =>
            total +
            adjustment.appliedInRemittance,
          0
        ),
      [
        remittance.adjustments,
      ]
    );

  function option(
    key:
      keyof Options,
    value: boolean
  ) {
    setOptions(
      (
        current
      ) => ({
        ...current,
        [key]:
          value,
      })
    );
  }

  function togglePaymentAttachment(
    id: string
  ) {
    setSelectedPaymentAttachments(
      (
        current
      ) =>
        current.includes(
          id
        )
          ? current.filter(
              (
                item
              ) =>
                item !==
                id
            )
          : [
              ...current,
              id,
            ]
    );
  }

  function toggleAdjustmentAttachment(
    id: string
  ) {
    setSelectedAdjustmentAttachments(
      (
        current
      ) =>
        current.includes(
          id
        )
          ? current.filter(
              (
                item
              ) =>
                item !==
                id
            )
          : [
              ...current,
              id,
            ]
    );
  }

  function suggestMessage() {
    const currentIndex =
      DIRECTOR_MESSAGES.indexOf(
        directorMessage
      );

    const nextIndex =
      currentIndex >=
      0
        ? (currentIndex +
            1) %
          DIRECTOR_MESSAGES.length
        : Math.floor(
            Math.random() *
              DIRECTOR_MESSAGES.length
          );

    setDirectorMessage(
      DIRECTOR_MESSAGES[
        nextIndex
      ]
    );
  }

  async function generatePdf() {
    if (
      generatingPdf
    ) {
      return;
    }

    setGeneratingPdf(
      true
    );

    setPdfError(
      null
    );

    /*
     * Abre a nova aba ainda dentro do clique
     * para evitar bloqueio de popup do navegador.
     */
    const pdfWindow =
      window.open(
        "",
        "_blank"
      );

    if (
      pdfWindow
    ) {
      pdfWindow.document.title =
        "Gerando demonstrativo...";

      pdfWindow.document.body.innerHTML =
        '<div style="font-family:Arial,sans-serif;padding:32px;color:#374151">Gerando demonstrativo Flyimob...</div>';
    }

    try {
      const response =
        await fetch(
          "/api/financeiro/remessas/demonstrativo",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                paymentId:
                  remittance.id,

                options,

                directorMessage,

                paymentAttachmentIds:
                  selectedPaymentAttachments,

                adjustmentAttachmentIds:
                  selectedAdjustmentAttachments,
              }),
          }
        );

      if (
        !response.ok
      ) {
        let message =
          "Não foi possível gerar o PDF.";

        try {
          const json =
            await response.json();

          if (
            typeof json?.error ===
              "string" &&
            json.error.trim()
          ) {
            message =
              json.error;
          }
        } catch {
          // A resposta pode não ser JSON.
        }

        throw new Error(
          message
        );
      }

      const blob =
        await response.blob();

      const pdfUrl =
        URL.createObjectURL(
          blob
        );

      if (
        pdfWindow
      ) {
        pdfWindow.location.href =
          pdfUrl;
      } else {
        /*
         * Fallback para navegadores que
         * bloquearam a nova aba.
         */
        const link =
          document.createElement(
            "a"
          );

        link.href =
          pdfUrl;

        link.target =
          "_blank";

        link.rel =
          "noreferrer";

        link.click();
      }

      /*
       * Mantém a URL viva tempo suficiente
       * para a nova aba terminar de carregar.
       */
      window.setTimeout(
        () => {
          URL.revokeObjectURL(
            pdfUrl
          );
        },
        60_000
      );
    } catch (
      error
    ) {
      if (
        pdfWindow
      ) {
        pdfWindow.close();
      }

      setPdfError(
        error instanceof Error
          ? error.message
          : "Erro inesperado ao gerar PDF."
      );
    } finally {
      setGeneratingPdf(
        false
      );
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      {/* CONFIGURAÇÃO */}
      <div className="space-y-5">
        <div className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold text-gray-900">
              Conteúdo do demonstrativo
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Escolha exatamente o
              que o participante
              verá no documento.
            </p>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
                Venda
              </div>

              <div className="grid gap-2">
                <Check
                  checked={
                    options.showClient
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showClient",
                      value
                    )
                  }
                >
                  Cliente
                </Check>

                <Check
                  checked={
                    options.showBuilder
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showBuilder",
                      value
                    )
                  }
                >
                  Construtora
                </Check>

                <Check
                  checked={
                    options.showDevelopment
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showDevelopment",
                      value
                    )
                  }
                >
                  Empreendimento
                </Check>

                <Check
                  checked={
                    options.showVgv
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showVgv",
                      value
                    )
                  }
                >
                  VGV
                </Check>

                <Check
                  checked={
                    options.showSaleCommission
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showSaleCommission",
                      value
                    )
                  }
                >
                  Comissão da venda
                </Check>

                <Check
                  checked={
                    options.showStageContext
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showStageContext",
                      value
                    )
                  }
                >
                  Contexto da etapa
                </Check>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
                Comissão do consultor
              </div>

              <div className="grid gap-2">
                <Check
                  checked={
                    options.showRole
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showRole",
                      value
                    )
                  }
                >
                  Função exercida
                </Check>

                <Check
                  checked={
                    options.showRule
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showRule",
                      value
                    )
                  }
                >
                  Regra da comissão
                </Check>

                <Check
                  checked={
                    options.showEntitlement
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showEntitlement",
                      value
                    )
                  }
                >
                  Direito financeiro
                </Check>

                <Check
                  checked={
                    options.showPixAllocation
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showPixAllocation",
                      value
                    )
                  }
                >
                  Valor pago nesta
                  remessa
                </Check>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
                Vales e ajustes
              </div>

              <div className="grid gap-2">
                <Check
                  checked={
                    options.showAdjustments
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showAdjustments",
                      value
                    )
                  }
                >
                  Mostrar vales
                  compensados
                </Check>

                <Check
                  checked={
                    options.showAdjustmentBalance
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showAdjustmentBalance",
                      value
                    )
                  }
                >
                  Mostrar valor
                  original e valor
                  utilizado
                </Check>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
                Pagamento
              </div>

              <div className="grid gap-2">
                <Check
                  checked={
                    options.showPaymentDate
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showPaymentDate",
                      value
                    )
                  }
                >
                  Data do pagamento
                </Check>

                <Check
                  checked={
                    options.showPaymentDestination
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showPaymentDestination",
                      value
                    )
                  }
                >
                  PIX / destino
                </Check>

                <Check
                  checked={
                    options.showPaymentNotes
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showPaymentNotes",
                      value
                    )
                  }
                >
                  Observações da
                  remessa
                </Check>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">
                Institucional
              </div>

              <div className="grid gap-2">
                <Check
                  checked={
                    options.showServiceNotice
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showServiceNotice",
                      value
                    )
                  }
                >
                  Aviso de serviço
                  avulso
                </Check>

                <Check
                  checked={
                    options.showDirectorMessage
                  }
                  onChange={(
                    value
                  ) =>
                    option(
                      "showDirectorMessage",
                      value
                    )
                  }
                >
                  Mensagem do Diretor
                </Check>
              </div>
            </div>
          </div>
        </div>

        {/* MENSAGEM */}
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">
                Mensagem do Diretor
              </h3>

              <p className="mt-1 text-xs text-gray-500">
                A sugestão pode ser
                editada livremente.
              </p>
            </div>

            <button
              type="button"
              onClick={
                suggestMessage
              }
              className="rounded-md border px-3 py-2 text-xs font-medium"
            >
              Sugerir outra
            </button>
          </div>

          <textarea
            value={
              directorMessage
            }
            onChange={(
              event
            ) =>
              setDirectorMessage(
                event.target.value
              )
            }
            rows={
              5
            }
            className="mt-4 w-full rounded-md border p-3 text-sm"
          />
        </div>

        {/* COMPROVANTES PIX */}
        <div className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <h3 className="font-semibold">
              Comprovantes da remessa
            </h3>

            <p className="mt-1 text-xs text-gray-500">
              Marque os arquivos
              que entrarão no PDF.
            </p>
          </div>

          {remittance.attachments.length ===
          0 ? (
            <div className="p-5 text-sm text-amber-700">
              Nenhum comprovante
              anexado à remessa.
            </div>
          ) : (
            <div className="divide-y">
              {remittance.attachments.map(
                (
                  attachment
                ) => (
                  <label
                    key={
                      attachment.id
                    }
                    className="flex cursor-pointer items-center gap-3 px-5 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPaymentAttachments.includes(
                        attachment.id
                      )}
                      onChange={() =>
                        togglePaymentAttachment(
                          attachment.id
                        )
                      }
                    />

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {attachment.title ||
                          attachment.originalName}
                      </div>

                      <div className="text-xs text-gray-400">
                        Comprovante de
                        pagamento
                      </div>
                    </div>
                  </label>
                )
              )}
            </div>
          )}
        </div>

        {/* COMPROVANTES VALES */}
        {allAdjustmentAttachments.length >
          0 && (
          <div className="rounded-xl border bg-white">
            <div className="border-b px-5 py-4">
              <h3 className="font-semibold">
                Comprovantes dos
                vales
              </h3>

              <p className="mt-1 text-xs text-gray-500">
                O padrão é não
                incluí-los. Marque
                apenas quando quiser.
              </p>
            </div>

            <div className="divide-y">
              {allAdjustmentAttachments.map(
                (
                  attachment
                ) => (
                  <label
                    key={
                      attachment.id
                    }
                    className="flex cursor-pointer items-center gap-3 px-5 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdjustmentAttachments.includes(
                        attachment.id
                      )}
                      onChange={() =>
                        toggleAdjustmentAttachment(
                          attachment.id
                        )
                      }
                    />

                    <div>
                      <div className="text-sm font-medium">
                        {attachment.title ||
                          attachment.originalName}
                      </div>

                      <div className="text-xs text-gray-400">
                        {attachment.adjustmentDescription ||
                          "Vale / adiantamento"}
                      </div>
                    </div>
                  </label>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* PREVIEW */}
      <div>
        <div className="sticky top-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">
                Prévia do
                demonstrativo
              </h2>

              <p className="text-xs text-gray-500">
                O PDF seguirá esta
                composição.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            {/* CABEÇALHO */}
            <div className="border-b px-8 py-7">
              <div className="text-xl font-bold tracking-tight text-gray-900">
                Flyimob
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Demonstrativo de
                pagamento
              </div>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase text-gray-400">
                    Consultor
                  </div>

                  <div className="mt-1 text-lg font-semibold">
                    {
                      remittance.participant.name
                    }
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase text-gray-400">
                    Valor transferido
                  </div>

                  <div className="mt-1 text-2xl font-bold">
                    {formatBRL(
                      remittance.amount
                    )}
                  </div>
                </div>
              </div>

              {(options.showPaymentDate ||
                options.showPaymentDestination) && (
                <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-600">
                  {options.showPaymentDate && (
                    <div>
                      Pagamento:{" "}
                      <strong>
                        {dateBR(
                          remittance.paidAt
                        )}
                      </strong>
                    </div>
                  )}

                  {options.showPaymentDestination && (
                    <div>
                      Destino:{" "}
                      <strong>
                        {remittance.destinationPixKey
                          ? `PIX ${remittance.destinationPixType || ""} • ${remittance.destinationPixKey}`
                          : remittance.destinationBankName ||
                            "Não informado"}
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {options.showServiceNotice && (
              <div className="border-b bg-gray-50 px-8 py-4 text-xs leading-relaxed text-gray-600">
                Demonstrativo
                referente a serviço
                prestado de forma
                avulsa por consultor
                independente.
              </div>
            )}

            {/* VENDAS */}
            <div className="space-y-4 p-8">
              {remittance.items.map(
                (
                  item,
                  index
                ) => (
                  <div
                    key={
                      item.allocationId
                    }
                    className="rounded-lg border"
                  >
                    <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                      <div>
                        <div className="text-xs text-gray-400">
                          Serviço{" "}
                          {index +
                            1}
                        </div>

                        {options.showClient && (
                          <div className="mt-1 font-semibold">
                            {
                              item.clientName
                            }
                          </div>
                        )}

                        {(options.showBuilder ||
                          options.showDevelopment) && (
                          <div className="mt-1 text-xs text-gray-500">
                            {options.showBuilder &&
                              (item.construtora ||
                                "—")}

                            {options.showBuilder &&
                              options.showDevelopment &&
                              " • "}

                            {options.showDevelopment &&
                              (item.empreendimento ||
                                "—")}
                          </div>
                        )}
                      </div>

                      {options.showPixAllocation && (
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-gray-400">
                            Nesta remessa
                          </div>

                          <div className="font-semibold">
                            {formatBRL(
                              item.pixAllocation
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {options.showStageContext && (
                      <div className="border-b bg-blue-50/40 px-5 py-3">
                        <div className="text-xs font-semibold text-gray-900">
                          {stageTitle(
                            item
                          )}
                        </div>

                        <div className="mt-1 text-xs leading-relaxed text-gray-600">
                          {stageContextText(
                            item
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                      {options.showVgv && (
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
                      )}

                      {options.showSaleCommission && (
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
                      )}

                      {options.showRole && (
                        <div>
                          <div className="text-[10px] uppercase text-gray-400">
                            Participação
                          </div>

                          <div className="mt-1 text-sm font-medium">
                            {roleLabel(
                              item.role,
                              item.customRoleLabel
                            )}
                          </div>
                        </div>
                      )}

                      {options.showEntitlement && (
                        <div>
                          <div className="text-[10px] uppercase text-gray-400">
                            Direito
                          </div>

                          <div className="mt-1 text-sm font-semibold">
                            {formatBRL(
                              item.entitlementFinalAmount
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {options.showRule && (
                      <div className="border-t bg-gray-50 px-5 py-3 text-xs text-gray-600">
                        Regra:{" "}
                        <strong>
                          {ruleText(
                            item
                          )}
                        </strong>

                        {item.calculationBaseAmount !=
                          null && (
                          <>
                            {" "}
                            • Base:{" "}
                            <strong>
                              {formatBRL(
                                item.calculationBaseAmount
                              )}
                            </strong>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}

              {/* VALES */}
              {options.showAdjustments &&
                remittance.adjustments.length >
                  0 && (
                  <div className="rounded-lg border">
                    <div className="border-b px-5 py-3 font-medium">
                      Vales e ajustes
                    </div>

                    <div className="divide-y">
                      {remittance.adjustments.map(
                        (
                          adjustment
                        ) => (
                          <div
                            key={
                              adjustment.id
                            }
                            className="flex flex-wrap items-center justify-between gap-4 px-5 py-3"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                {adjustment.description ||
                                  "Vale / adiantamento"}
                              </div>

                              <div className="mt-1 text-xs text-gray-400">
                                {dateBR(
                                  adjustment.occurredAt
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              {options.showAdjustmentBalance && (
                                <div className="text-xs text-gray-400">
                                  Original{" "}
                                  {formatBRL(
                                    adjustment.originalAmount
                                  )}
                                </div>
                              )}

                              <div className="font-semibold text-red-700">
                                -
                                {formatBRL(
                                  adjustment.appliedInRemittance
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              {/* RESUMO */}
              <div className="grid gap-4 rounded-lg border bg-gray-50 p-5 sm:grid-cols-3">
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
                    Vales / ajustes
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
                    Total pago
                  </div>

                  <div className="mt-1 text-lg font-bold">
                    {formatBRL(
                      remittance.amount
                    )}
                  </div>
                </div>
              </div>

              {options.showPaymentNotes &&
                remittance.notes && (
                  <div className="rounded-lg border p-5 text-sm text-gray-600">
                    {
                      remittance.notes
                    }
                  </div>
                )}

              {options.showDirectorMessage &&
                directorMessage.trim() && (
                  <div className="rounded-lg border p-5">
                    <div className="text-xs font-semibold uppercase text-gray-400">
                      Mensagem do
                      Diretor
                    </div>

                    <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                      {
                        directorMessage
                      }
                    </div>
                  </div>
                )}

              <div className="pt-3 text-center text-[10px] text-gray-400">
                Documento gerado
                pela plataforma
                Flyimob.
              </div>
            </div>
          </div>

          {pdfError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pdfError}
            </div>
          )}

          <button
            type="button"
            onClick={
              generatePdf
            }
            disabled={
              generatingPdf
            }
            className="mt-4 w-full rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generatingPdf
              ? "Gerando PDF..."
              : "Gerar PDF"}
          </button>

          <div className="mt-2 text-center text-xs text-gray-400">
            O PDF será aberto em
            uma nova aba com os
            comprovantes
            selecionados anexados
            ao final.
          </div>
        </div>
      </div>
    </div>
  );
}