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
}: DashboardProps) {
  return (
    <div className="space-y-6">
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
          value={formatBRL(vgv)}
          description={`${totalSales} venda(s) cadastrada(s)`}
        />

        <Card
          label="Comissão faturada"
          value={formatBRL(invoiced)}
          description="Notas fiscais emitidas"
        />

        <Card
          label="Recebido"
          value={formatBRL(received)}
          description="Entradas confirmadas"
        />

        <Card
          label="A receber"
          value={formatBRL(receivable)}
          description="Faturado ainda não recebido"
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
          value={formatBRL(companyNet)}
          description="Resultado apropriado"
        />

        <Card
          label="Pendências"
          value={String(pendingStages)}
          description="Etapas ainda não resolvidas"
        />
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