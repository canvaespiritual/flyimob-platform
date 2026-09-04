import Link from "next/link";

import { formatBRL } from "@/lib/financeiro/money";

type DashboardProps = {
  totalSales: number;

  vgv: number;

  invoiced: number;

  received: number;

  receivable: number;

  payableParticipants: number;

  taxToSeparate: number;

  companyNet: number;

  pendingStages: number;

  availableToAppropriate:
    number;

  invoicedNetReceivable:
    number;

  futureProjectedNet:
    number;

  openAdvances:
    number;

  economicPosition:
    number;
};

function Card({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold text-gray-900">
        {value}
      </div>

      {description && (
        <div className="mt-1 text-xs text-gray-500">
          {description}
        </div>
      )}
    </div>
  );
}

function PositionCard({
  label,
  value,
  description,
  strong = false,
}: {
  label: string;
  value: number;
  description: string;
  strong?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-4",

        strong
          ? "bg-gray-900 text-white"
          : "bg-white",
      ].join(" ")}
    >
      <div
        className={[
          "text-xs font-medium uppercase tracking-wide",

          strong
            ? "text-gray-300"
            : "text-gray-500",
        ].join(" ")}
      >
        {label}
      </div>

      <div
        className={[
          "mt-2 text-2xl font-semibold",

          strong
            ? "text-white"
            : "text-gray-900",
        ].join(" ")}
      >
        {formatBRL(
          value
        )}
      </div>

      <div
        className={[
          "mt-1 text-xs",

          strong
            ? "text-gray-300"
            : "text-gray-500",
        ].join(" ")}
      >
        {description}
      </div>
    </div>
  );
}

export default function FinanceiroDashboard({
  totalSales,
  vgv,
  invoiced,
  received,
  receivable,
  payableParticipants,
  taxToSeparate,
  companyNet,
  pendingStages,

  availableToAppropriate,
  invoicedNetReceivable,
  futureProjectedNet,
  openAdvances,
  economicPosition,
}: DashboardProps) {
  return (
    <div className="space-y-6">
      {/*
       * =====================================
       * VISÃO QUE JÁ EXISTIA
       * =====================================
       */}
      <div
        className="
          grid
          grid-cols-1
          gap-3
          sm:grid-cols-2
          xl:grid-cols-4
        "
      >
        <Card
          label="VGV"
          value={formatBRL(
            vgv
          )}
          description={`${totalSales} venda(s) cadastrada(s)`}
        />

        <Card
          label="Comissão faturada"
          value={formatBRL(
            invoiced
          )}
          description="Notas fiscais emitidas"
        />

        <Card
          label="Recebido"
          value={formatBRL(
            received
          )}
          description="Valor efetivamente esperado em conta, líquido das retenções"
        />

        <Card
          label="A receber"
          value={formatBRL(
            receivable
          )}
          description="Faturado ainda não recebido, já descontada retenção na fonte"
        />

        <Card
          label="Participantes a pagar"
          value={formatBRL(
            payableParticipants
          )}
          description="Comissões ainda não liquidadas"
        />

        <Card
          label="Imposto a separar"
          value={formatBRL(
            taxToSeparate
          )}
          description="Tributos da empresa ainda pendentes"
        />

        <Card
          label="Líquido Flyimob"
          value={formatBRL(
            companyNet
          )}
          description="Resultado já apropriado"
        />

        <Card
          label="Pendências"
          value={String(
            pendingStages
          )}
          description="Etapas ainda não resolvidas"
        />
      </div>

      {/*
       * =====================================
       * NOVA POSIÇÃO FINANCEIRA
       * =====================================
       */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <div>
          <h2 className="font-semibold text-gray-900">
            Posição financeira Flyimob
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Onde está o resultado econômico da operação hoje e o que ainda está por vir.
          </p>
        </div>

        <div
          className="
            mt-4
            grid
            grid-cols-1
            gap-3
            sm:grid-cols-2
            xl:grid-cols-5
          "
        >
          <PositionCard
            label="Líquido disponível"
            value={
              availableToAppropriate
            }
            description="Já entrou e ainda não foi apropriado"
          />

          <PositionCard
            label="Líquido faturado a receber"
            value={
              invoicedNetReceivable
            }
            description="Sua parte líquida das NFs ainda não recebidas"
          />

          <PositionCard
            label="Líquido futuro projetado"
            value={
              futureProjectedNet
            }
            description="Etapas previstas que ainda não possuem NF"
          />

          <PositionCard
            label="Créditos em vales"
            value={
              openAdvances
            }
            description="Saldo ainda devido pelos participantes"
          />

          <PositionCard
            label="Posição econômica"
            value={
              economicPosition
            }
            description="Disponível + faturado + futuro + vales"
            strong
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">
            Ações rápidas
          </h2>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/financeiro/vendas/nova"
            className="rounded-lg border p-4 hover:bg-gray-50"
          >
            <div className="font-medium text-gray-900">
              Nova venda
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Registrar uma nova operação.
            </div>
          </Link>

          <Link
            href="/admin/financeiro/participantes/novo"
            className="rounded-lg border p-4 hover:bg-gray-50"
          >
            <div className="font-medium text-gray-900">
              Novo participante
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Corretor, gerente ou parceiro.
            </div>
          </Link>

          <Link
            href="/admin/financeiro/recebimentos"
            className="rounded-lg border p-4 hover:bg-gray-50"
          >
            <div className="font-medium text-gray-900">
              Recebimentos
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Conferir valores de construtoras.
            </div>
          </Link>

          <Link
            href="/admin/financeiro/impostos"
            className="rounded-lg border p-4 hover:bg-gray-50"
          >
            <div className="font-medium text-gray-900">
              Fechamento fiscal
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Impostos e valores a separar.
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}