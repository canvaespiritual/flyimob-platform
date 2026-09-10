"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type StageType =
  | "ATO"
  | "BANCO"
  | "PREMIO"
  | "COMPLEMENTO"
  | "OUTRO";

function isPrincipalStage(type: StageType) {
  return type === "ATO" || type === "BANCO";
}

function defaultLabel(type: StageType) {
  if (type === "ATO") return "Ato";
  if (type === "BANCO") return "Assinatura banco";
  if (type === "PREMIO") return "Prêmio";
  if (type === "COMPLEMENTO") return "Complemento";
  return "Outro";
}

export default function AddSaleStage({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<StageType>("PREMIO");
  const [label, setLabel] = useState("Prêmio");

  function handleTypeChange(nextType: StageType) {
    setType(nextType);
    setLabel(defaultLabel(nextType));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/financeiro/etapas/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          saleId,
          type,
          label: label.trim() || null,
          commissionSharePercent: isPrincipalStage(type)
            ? String(form.get("commissionSharePercent") || "").trim() || null
            : null,
          expectedGrossAmount:
            String(form.get("expectedGrossAmount") || "").trim() || null,
          notes: String(form.get("notes") || "").trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível adicionar a etapa.");
      }

      setOpen(false);
      setType("PREMIO");
      setLabel("Prêmio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="rounded-md border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          + Adicionar etapa
        </button>
      </div>
    );
  }

  const principal = isPrincipalStage(type);

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold text-gray-900">Adicionar etapa</h2>
          <p className="mt-1 text-sm text-gray-500">
            Acrescente uma etapa à venda já cadastrada. Prêmios, complementos e
            outros valores ficam fora da distribuição principal da comissão.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Tipo</span>
            <select
              value={type}
              onChange={(event) =>
                handleTypeChange(event.target.value as StageType)
              }
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="ATO">Ato</option>
              <option value="BANCO">Assinatura banco</option>
              <option value="PREMIO">Prêmio</option>
              <option value="COMPLEMENTO">Complemento</option>
              <option value="OUTRO">Outro</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">
              Nome / observação
            </span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>

          {principal ? (
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                % da comissão
              </span>
              <input
                name="commissionSharePercent"
                inputMode="decimal"
                placeholder="0"
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Natureza</span>
              <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-600">
                Adicional fora da comissão principal
              </div>
            </div>
          )}

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">
              {principal ? "Valor previsto" : "Valor adicional"}
            </span>
            <input
              required
              name="expectedGrossAmount"
              inputMode="decimal"
              placeholder="0,00"
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">
            Observação da etapa
          </span>
          <input
            name="notes"
            className="w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex justify-end">
          <button
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Adicionando..." : "Adicionar etapa"}
          </button>
        </div>
      </form>
    </div>
  );
}