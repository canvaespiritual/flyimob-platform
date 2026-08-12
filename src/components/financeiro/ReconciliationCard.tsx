import {
  formatBRL,
} from "@/lib/financeiro/money";

function ValueCell({
  label,
  value,
  description,
  strong = false,
}: {
  label: string;
  value: number;
  description?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">
        {label}
      </div>

      <div
        className={[
          "mt-1",
          strong
            ? "text-lg font-semibold text-gray-900"
            : "font-medium text-gray-900",
        ].join(" ")}
      >
        {formatBRL(value)}
      </div>

      {description && (
        <div className="mt-1 text-xs text-gray-500">
          {description}
        </div>
      )}
    </div>
  );
}

function formatRate(
  rate: number
) {
  return rate.toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits: 4,
    }
  );
}

export default function ReconciliationCard({
  invoiceGross,

  withheldTax,
  withheldRate,

  expectedNetReceipt,
  received,

  payableTax,
  payableRate,

  totalTax,
  totalTaxRate,

  participantRights,
  economicCompanyNet,

  taxSeparated,
  participantPaid,
  companyAllocated,

  cashDifference,
}: {
  invoiceGross: number;

  withheldTax: number;
  withheldRate: number;

  expectedNetReceipt: number;
  received: number;

  payableTax: number;
  payableRate: number;

  totalTax: number;
  totalTaxRate: number;

  participantRights: number;
  economicCompanyNet: number;

  taxSeparated: number;
  participantPaid: number;
  companyAllocated: number;

  cashDifference: number;
}) {
  const cashResolved =
    received > 0 &&
    Math.abs(
      cashDifference
    ) <= 0.01;

  const receiptDifference =
    received -
    expectedNetReceipt;

  return (
    <div className="space-y-3">
      {/* RESUMO FISCAL */}

      <div className="rounded-lg border bg-white p-4">
        <div>
          <div className="font-semibold text-gray-900">
            Resumo fiscal e recebimento
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Da nota bruta até o valor que
            efetivamente entra na conta.
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ValueCell
            label="Valor bruto da nota"
            value={
              invoiceGross
            }
          />

          <ValueCell
            label="Retido na fonte"
            value={
              withheldTax
            }
            description={
              withheldRate > 0
                ? `${formatRate(
                    withheldRate
                  )}%`
                : undefined
            }
          />

          <ValueCell
            label="Líquido esperado na conta"
            value={
              expectedNetReceipt
            }
            description="Nota menos retenção na fonte"
          />

          <ValueCell
            label="Recebido na conta"
            value={
              received
            }
            strong
          />

          <ValueCell
            label="Imposto total"
            value={
              totalTax
            }
            description={
              totalTaxRate > 0
                ? `${formatRate(
                    totalTaxRate
                  )}% no total`
                : undefined
            }
            strong
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">
              Já retido antes do recebimento
            </div>

            <div className="mt-1 font-medium">
              {formatBRL(
                withheldTax
              )}
              {withheldRate > 0
                ? ` • ${formatRate(
                    withheldRate
                  )}%`
                : ""}
            </div>
          </div>

          <div className="rounded-md border bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500">
              Ainda precisa separar / recolher
            </div>

            <div className="mt-1 font-medium">
              {formatBRL(
                payableTax
              )}
              {payableRate > 0
                ? ` • ${formatRate(
                    payableRate
                  )}%`
                : ""}
            </div>
          </div>
        </div>

        {Math.abs(
          receiptDifference
        ) > 0.01 && (
          <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            O valor recebido está{" "}
            <strong>
              {formatBRL(
                Math.abs(
                  receiptDifference
                )
              )}
            </strong>{" "}
            {receiptDifference > 0
              ? "acima"
              : "abaixo"}{" "}
            do líquido esperado pela nota.
          </div>
        )}
      </div>

      {/* RESULTADO ECONÔMICO */}

      <div className="rounded-lg border bg-gray-50 p-4">
        <div>
          <div className="font-semibold text-gray-900">
            Resultado econômico
          </div>

          <div className="mt-1 text-xs text-gray-500">
            O retido na fonte já saiu antes
            do dinheiro entrar. Por isso aqui
            descontamos novamente apenas o
            imposto que ainda será recolhido.
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ValueCell
            label="Nota bruta"
            value={
              invoiceGross
            }
          />

          <ValueCell
            label="Recebido líquido"
            value={
              received
            }
          />

          <ValueCell
            label="Imposto futuro"
            value={
              payableTax
            }
            description={
              payableRate > 0
                ? `${formatRate(
                    payableRate
                  )}%`
                : undefined
            }
          />

          <ValueCell
            label="Direitos dos participantes"
            value={
              participantRights
            }
          />

          <ValueCell
            label="Líquido Flyimob"
            value={
              economicCompanyNet
            }
            strong
          />
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Carga tributária total desta etapa:{" "}
          <strong className="text-gray-700">
            {formatBRL(
              totalTax
            )}
            {totalTaxRate > 0
              ? ` (${formatRate(
                  totalTaxRate
                )}%)`
              : ""}
          </strong>
          .
        </div>
      </div>

      {/* PROVA REAL DE CAIXA */}

      <div
        className={[
          "rounded-lg border p-4",
          cashResolved
            ? "border-green-200 bg-green-50"
            : "border-yellow-200 bg-yellow-50",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-gray-900">
              Conciliação real de caixa
            </div>

            <div className="mt-1 text-xs text-gray-600">
              O recebido precisa terminar
              integralmente destinado entre
              imposto separado, participantes
              pagos e líquido apropriado.
            </div>
          </div>

          <span className="rounded-full border bg-white px-3 py-1 text-xs font-medium">
            {cashResolved
              ? "R$ 0,00 — resolvido"
              : "Pendente"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ValueCell
            label="Recebido na conta"
            value={
              received
            }
          />

          <ValueCell
            label="Imposto já separado"
            value={
              taxSeparated
            }
          />

          <ValueCell
            label="Participantes já pagos"
            value={
              participantPaid
            }
          />

          <ValueCell
            label="Líquido já apropriado"
            value={
              companyAllocated
            }
          />

          <div>
            <div className="text-xs text-gray-500">
              Saldo sem destino
            </div>

            <div
              className={[
                "mt-1 text-lg font-semibold",
                Math.abs(
                  cashDifference
                ) <= 0.01
                  ? "text-green-700"
                  : "text-yellow-800",
              ].join(" ")}
            >
              {formatBRL(
                cashDifference
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          Nota:{" "}
          {formatBRL(
            invoiceGross
          )}
          {" • "}
          Recebido líquido:{" "}
          {formatBRL(
            received
          )}
          {" • "}
          Impostos totais:{" "}
          {formatBRL(
            totalTax
          )}
          {totalTaxRate > 0
            ? ` (${formatRate(
                totalTaxRate
              )}%)`
            : ""}
        </div>
      </div>
    </div>
  );
}