"use client";

import { useState } from "react";

export default function SimuladorMcmvClient() {
  const [nome, setNome] = useState("");
  const [renda, setRenda] = useState("");
  const [temFgts3Anos, setTemFgts3Anos] = useState(true);
  const [temDependente, setTemDependente] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  async function handleSimular() {
    setLoading(true);

    const response = await fetch("/api/mcmv/simular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome,
        renda: Number(renda),
        temFgts3Anos,
        temDependenteOuMaisDeUmComprador: temDependente,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!data.success) {
      alert(data.error || "Erro na simulação");
      return;
    }

    setResultado(data.data);
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl bg-white p-4 shadow-sm border">
        <div className="mb-5">
          <p className="text-xs font-semibold text-blue-700 uppercase">
            Flyimob
          </p>

          <h1 className="text-2xl font-bold text-slate-900">
            Simulador MCMV
          </h1>

          <p className="text-sm text-slate-500">
            Descubra uma estimativa rápida do seu poder de compra.
          </p>
        </div>

        <div className="space-y-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Nome (opcional)"
          />

          <input
            type="number"
            value={renda}
            onChange={(e) => setRenda(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Renda familiar"
          />

          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={temFgts3Anos}
              onChange={(e) => setTemFgts3Anos(e.target.checked)}
            />
            Tenho FGTS há mais de 3 anos
          </label>

          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={temDependente}
              onChange={(e) => setTemDependente(e.target.checked)}
            />
            Tenho dependente ou mais de um comprador
          </label>

          <button
            onClick={handleSimular}
            disabled={loading}
            className="w-full rounded-xl bg-blue-700 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Simulando..." : "Simular agora"}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm border">
          <div className="mb-4">
            <p className="text-xs font-semibold text-blue-700 uppercase">
              Resultado aproximado
            </p>

            <h2 className="text-xl font-bold text-slate-900">
              {resultado.nome
                ? `${resultado.nome}, veja sua simulação`
                : "Sua simulação"}
            </h2>

            <p className="text-xs text-slate-500">
              Renda considerada: {resultado.formatted.rendaConsiderada}
            </p>
          </div>

          <div className="rounded-2xl bg-blue-700 p-3 text-white mb-2">
            <p className="text-xs opacity-80">
              Valor estimado total liberado
            </p>

            <p className="text-2xl font-bold">
              {resultado.formatted.valorEstimadoTotal}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-2.5">
              <p className="text-xs text-slate-500">
                Imóvel possível até
              </p>

              <p className="text-lg font-bold">
                {resultado.formatted.valorImovelPossivel}
              </p>
            </div>

            <div className="rounded-xl border p-2.5">
              <p className="text-xs text-slate-500">
                Parcela banco
              </p>

              <p className="text-lg font-bold">
                {resultado.formatted.parcelaFinanciamento}
              </p>
            </div>

            {resultado.subsidio > 0 && (
              <div className="rounded-xl border p-2.5">
                <p className="text-xs text-slate-500">
                  Subsídio estimado
                </p>

                <p className="text-lg font-bold">
                  {resultado.formatted.subsidio}
                </p>
              </div>
            )}

            <div className="rounded-xl border p-2.5">
              <p className="text-xs text-slate-500">
                Entrada 20%
              </p>

              <p className="text-lg font-bold">
                {resultado.formatted.entrada20}
              </p>
            </div>
          </div>

         <div className="mt-2 rounded-xl bg-slate-50 p-2.5">
  <p className="mb-2 text-xs text-slate-500">
    Entrada parcelada
  </p>

  <div className="grid grid-cols-3 gap-2 text-center">
    <div className="rounded-lg bg-white p-1.5">
      <p className="text-xs text-slate-400">30x</p>

      <p className="text-sm font-bold">
        {resultado.formatted.parcelaEntrada30x}
      </p>

      <p className="mt-1 text-[10px] text-slate-400">
        Total
      </p>

      <p className="text-xs font-semibold">
        {resultado.formatted.parcelaTotal30x}
      </p>
    </div>

    <div className="rounded-lg bg-blue-50 p-1.5">
      <p className="text-xs font-semibold text-blue-700">60x</p>

      <p className="text-sm font-bold">
        {resultado.formatted.parcelaEntrada60x}
      </p>

      <p className="mt-1 text-[10px] text-slate-400">
        Total
      </p>

      <p className="text-xs font-semibold">
        {resultado.formatted.parcelaTotal60x}
      </p>
    </div>

    <div className="rounded-lg bg-white p-1.5">
      <p className="text-xs text-slate-400">90x</p>

      <p className="text-sm font-bold">
        {resultado.formatted.parcelaEntrada90x}
      </p>

      <p className="mt-1 text-[10px] text-slate-400">
        Total
      </p>

      <p className="text-xs font-semibold">
        {resultado.formatted.parcelaTotal90x}
      </p>
    </div>
  </div>
</div>

          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            Simulação aproximada para comprador até 40 anos. Acima disso, prazo e condições podem mudar.
          </p>
        </div>
      )}
    </div>
  );
}