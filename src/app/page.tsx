"use client";

import { useEffect, useMemo, useState } from "react";
import MapView from "../components/Map/MapView";

type BoundsLite = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

type EmpreendimentoMap = {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;

  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  tipo?: string | null;

  coverThumb?: string | null;

  priceFrom?: number | null;
  pricePerM2From?: number | null;

  areaMin?: number | null;
  areaMax?: number | null;
  quartosMin?: number | null;
  quartosMax?: number | null;
  suitesMin?: number | null;
  suitesMax?: number | null;
  vagasMin?: number | null;
  vagasMax?: number | null;

  dataEntrega?: string | null; // ISO
};

function formatEntrega(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // ex: "Dez/2027"
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(d);
}

export default function Home() {
  const [bounds, setBounds] = useState<BoundsLite | null>(null);
  const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoMap[]>([]);

  useEffect(() => {
    fetch("/api/empreendimentos/map?tenantSlug=flyimob")
      .then((r) => r.json())
      .then((data) => setEmpreendimentos(data))
      .catch(() => setEmpreendimentos([]));
  }, []);

  const visiveis = useMemo(() => {
    if (!bounds) return empreendimentos;
    return empreendimentos.filter(
      (e) =>
        e.lat >= bounds.swLat &&
        e.lat <= bounds.neLat &&
        e.lng >= bounds.swLng &&
        e.lng <= bounds.neLng
    );
  }, [bounds, empreendimentos]);

  return (
    <main className="h-screen w-full flex flex-col">
      {/* Barra superior (filtros) */}
      <div className="h-14 border-b flex items-center gap-2 px-3">
        <input placeholder="Buscar local" className="border rounded px-3 py-2 w-[260px]" />

        <select className="border rounded px-3 py-2">
          <option>Tudo</option>
        </select>

        <select className="border rounded px-3 py-2">
          <option>Estágio</option>
        </select>

        <select className="border rounded px-3 py-2">
          <option>Finalidade</option>
        </select>

        <select className="border rounded px-3 py-2">
          <option>Oportunidades</option>
        </select>

        <select className="border rounded px-3 py-2">
          <option>Mais</option>
        </select>
      </div>

      {/* Corpo (mapa + lista) */}
      <div className="flex-1 flex w-full">
        {/* Mapa (maior) */}
        <div className="hidden md:block md:w-[70%]">
          <MapView
            empreendimentos={empreendimentos.map((e) => ({
              id: e.id,
              nome: e.name,
              slug: e.slug,
              lat: e.lat,
              lng: e.lng,
            }))}
            onBoundsChange={setBounds}
            onPinClick={(slug) => (window.location.href = `/empreendimentos/${slug}`)}
          />
        </div>

        {/* Lista (menor) */}
        <div className="w-full md:w-[30%] overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500">
              Exibindo {visiveis.length} de {empreendimentos.length}
            </div>

            <select className="border rounded px-2 py-1 text-sm">
              <option>Por relevância</option>
              <option>Mais barato</option>
              <option>Mais caro</option>
            </select>
          </div>

          <div className="space-y-3">
            {visiveis.map((e) => {
              const entrega = formatEntrega(e.dataEntrega);

              return (
                <div
                  key={e.id}
                  className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => (window.location.href = `/empreendimentos/${e.slug}`)}
                >
                  <div className="flex gap-3">
                    {/* Foto mais “vistosa” */}
                    <div className="w-36 h-24 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                      {e.coverThumb ? (
                        <img src={e.coverThumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                          sem foto
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight truncate">{e.name}</div>
                          <div className="text-xs text-gray-600 truncate">
                            {(e.bairro ? `${e.bairro} • ` : "")}
                            {e.cidade ? e.cidade : "Cidade não informada"}
                            {e.uf ? `, ${e.uf}` : ""}
                          </div>
                        </div>

                        {(typeof e.priceFrom === "number" || typeof e.pricePerM2From === "number" || entrega) && (
                          <div className="text-right">
                            {typeof e.priceFrom === "number" && (
                              <>
                                <div className="text-[11px] text-gray-500">A partir de</div>
                                <div className="font-semibold text-sm">
                                  R$ {e.priceFrom.toLocaleString("pt-BR")}
                                </div>
                              </>
                            )}

                            {(typeof e.pricePerM2From === "number" || entrega) && (
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                {typeof e.pricePerM2From === "number" ? `R$ ${e.pricePerM2From.toLocaleString("pt-BR")}/m²` : ""}
                                {entrega ? ` • Entrega ${entrega}` : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-700">
                        {(typeof e.areaMin === "number" || typeof e.areaMax === "number") && (
                          <span className="px-2 py-1 bg-gray-50 border rounded">
                            {e.areaMin ?? "-"}
                            {e.areaMax && e.areaMin !== e.areaMax ? `–${e.areaMax}` : ""} m²
                          </span>
                        )}

                        {(typeof e.quartosMin === "number" || typeof e.quartosMax === "number") && (
                          <span className="px-2 py-1 bg-gray-50 border rounded">
                            {e.quartosMin ?? "-"}
                            {e.quartosMax && e.quartosMin !== e.quartosMax ? `–${e.quartosMax}` : ""} quarto(s)
                          </span>
                        )}

                        {(typeof e.suitesMin === "number" || typeof e.suitesMax === "number") && (
                          <span className="px-2 py-1 bg-gray-50 border rounded">
                            {e.suitesMin ?? "-"}
                            {e.suitesMax && e.suitesMin !== e.suitesMax ? `–${e.suitesMax}` : ""} suíte(s)
                          </span>
                        )}

                        {(typeof e.vagasMin === "number" || typeof e.vagasMax === "number") && (
                          <span className="px-2 py-1 bg-gray-50 border rounded">
                            {e.vagasMin ?? "-"}
                            {e.vagasMax && e.vagasMin !== e.vagasMax ? `–${e.vagasMax}` : ""} vaga(s)
                          </span>
                        )}

                        {e.tipo && (
                          <span className="px-2 py-1 bg-gray-50 border rounded">
                            {String(e.tipo).replaceAll("_", " ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {visiveis.length === 0 && (
              <div className="text-sm text-gray-500">
                Nenhum empreendimento publicado com lat/lng nesta área.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
