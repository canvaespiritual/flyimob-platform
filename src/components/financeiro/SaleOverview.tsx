import { formatBRL } from "@/lib/financeiro/money";

type Props = {
  clientName: string;
  saleDate: Date | null;

  construtora: string | null;
  empreendimento: string | null;

  block: string | null;
  unit: string | null;

  vgv: number | string | null;
  commission: number | string | null;

  commissionPercent: number | string | null;
};

export default function SaleOverview({
  clientName,
  saleDate,
  construtora,
  empreendimento,
  block,
  unit,
  vgv,
  commission,
  commissionPercent,
}: Props) {
  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-gray-900">
          Resumo da venda
        </h2>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs uppercase text-gray-500">
            Cliente
          </div>

          <div className="mt-1 font-medium text-gray-900">
            {clientName}
          </div>

          {saleDate && (
            <div className="mt-1 text-xs text-gray-500">
              Venda em{" "}
              {new Intl.DateTimeFormat("pt-BR").format(
                new Date(saleDate)
              )}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase text-gray-500">
            Imóvel
          </div>

          <div className="mt-1 font-medium text-gray-900">
            {empreendimento || "Não informado"}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            {construtora || "Construtora não informada"}
          </div>

          {(block || unit) && (
            <div className="mt-1 text-xs text-gray-500">
              {[block ? `Bloco ${block}` : null, unit ? `Unidade ${unit}` : null]
                .filter(Boolean)
                .join(" • ")}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase text-gray-500">
            VGV
          </div>

          <div className="mt-1 text-xl font-semibold text-gray-900">
            {vgv ? formatBRL(vgv as never) : "—"}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase text-gray-500">
            Comissão da imobiliária
          </div>

          <div className="mt-1 text-xl font-semibold text-gray-900">
            {commission ? formatBRL(commission as never) : "—"}
          </div>

          {commissionPercent && (
            <div className="mt-1 text-xs text-gray-500">
              {Number(commissionPercent).toLocaleString("pt-BR", {
                maximumFractionDigits: 4,
              })}
              % do VGV
            </div>
          )}
        </div>
      </div>
    </div>
  );
}