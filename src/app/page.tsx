"use client";

import Image from "next/image";
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
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(d);
}
function toNum(v: string) {
  const digits = String(v).replace(/[^\d]/g, "");
  if (!digits) return null; // ✅ vazio => sem filtro
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}


export default function Home() {
  const [bounds, setBounds] = useState<BoundsLite | null>(null);
const [empreendimentos, setEmpreendimentos] = useState<EmpreendimentoMap[]>([]);
const [userMovedMap, setUserMovedMap] = useState(false);



  // UI state
  const [q, setQ] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  const [minArea, setMinArea] = useState<string>("");
  const [maxArea, setMaxArea] = useState<string>("");

  const [minQuartos, setMinQuartos] = useState<string>("");
  const [minSuites, setMinSuites] = useState<string>("");
  const [minVagas, setMinVagas] = useState<string>("");

  const [tipo, setTipo] = useState<string>(""); // EmpreendimentoTipo ou ""

  // paginação lista lateral
  const [page, setPage] = useState(1);
  const perPage = 8;

  useEffect(() => {
  fetch("/api/empreendimentos/map?tenantSlug=flyimob")
    .then((r) => r.json())
    .then((data: EmpreendimentoMap[]) => {
      setEmpreendimentos(data);

      // bounds inicial englobando todos os pins (para listar tudo no load)
      if (Array.isArray(data) && data.length > 0) {
        let minLat = data[0].lat;
        let maxLat = data[0].lat;
        let minLng = data[0].lng;
        let maxLng = data[0].lng;

        for (const e of data) {
          minLat = Math.min(minLat, e.lat);
          maxLat = Math.max(maxLat, e.lat);
          minLng = Math.min(minLng, e.lng);
          maxLng = Math.max(maxLng, e.lng);
        }

        const padLat = (maxLat - minLat) * 0.15 || 0.01;
        const padLng = (maxLng - minLng) * 0.15 || 0.01;

        setBounds({
          swLat: minLat - padLat,
          swLng: minLng - padLng,
          neLat: maxLat + padLat,
          neLng: maxLng + padLng,
        });
      }
    })
    .catch(() => setEmpreendimentos([]));
}, []);

  // filtra por bounds (zoom do mapa)
const visiveisPorMapa = useMemo(() => {
  if (!bounds) return empreendimentos;

  return empreendimentos.filter(
    (e) =>
      e.lat >= bounds.swLat &&
      e.lat <= bounds.neLat &&
      e.lng >= bounds.swLng &&
      e.lng <= bounds.neLng
  );
}, [bounds, empreendimentos]);

  // filtros do usuário (busca + "Mais")
  const visiveisFiltrados = useMemo(() => {
    const qq = q.replace(/\s+/g, " ").trim().toLowerCase();
    const minP = toNum(minPrice);
    const maxP = toNum(maxPrice);
    const minA = toNum(minArea);
    const maxA = toNum(maxArea);
    const qMin = toNum(minQuartos);
    const sMin = toNum(minSuites);
    const vMin = toNum(minVagas);
  // 🔒 identifica se existe ALGUM filtro realmente ativo
  const hasText = qq.length > 0;

  const hasAnyFilter =
    hasText ||
    !!tipo ||
    typeof minP === "number" ||
    typeof maxP === "number" ||
    typeof minA === "number" ||
    typeof maxA === "number" ||
    typeof qMin === "number" ||
    typeof sMin === "number" ||
    typeof vMin === "number";

  // ✅ se não houver filtro ativo, retorna a lista base (mapa)
  if (!hasAnyFilter) return visiveisPorMapa;

    const out = visiveisPorMapa.filter((e) => {
      // busca simples por nome/slug/cidade/bairro
      if (qq) {
        const hay =
          `${e.name} ${e.slug} ${e.cidade ?? ""} ${e.bairro ?? ""} ${e.uf ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      // tipo
      if (tipo) {
        if (String(e.tipo ?? "") !== tipo) return false;
      }

      // preço (usa priceFrom)
      if (typeof minP === "number") {
        if (typeof e.priceFrom !== "number" || e.priceFrom < minP) return false;
      }
      if (typeof maxP === "number") {
        if (typeof e.priceFrom !== "number" || e.priceFrom > maxP) return false;
      }

      // área (usa areaMin/areaMax -> pega melhor disponível)
      const aMin = typeof e.areaMin === "number" ? e.areaMin : null;
      const aMax = typeof e.areaMax === "number" ? e.areaMax : null;
      const bestAreaMin = aMin ?? aMax;
      const bestAreaMax = aMax ?? aMin;

      if (typeof minA === "number") {
        if (typeof bestAreaMax !== "number" || bestAreaMax < minA) return false;
      }
      if (typeof maxA === "number") {
        if (typeof bestAreaMin !== "number" || bestAreaMin > maxA) return false;
      }

      // quartos/suítes/vagas (min)
      if (typeof qMin === "number") {
        if (typeof e.quartosMax !== "number" || e.quartosMax < qMin) return false;
      }
      if (typeof sMin === "number") {
        if (typeof e.suitesMax !== "number" || e.suitesMax < sMin) return false;
      }
      if (typeof vMin === "number") {
        if (typeof e.vagasMax !== "number" || e.vagasMax < vMin) return false;
      }

      return true;
    });

    return out;
  }, [
    visiveisPorMapa,
    q,
    tipo,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    minQuartos,
    minSuites,
    minVagas,
  ]);

  // reset page quando muda filtro
  // 🔁 sempre que a lista visível mudar, volta para a primeira página
useEffect(() => {
  setPage(1);
}, [visiveisFiltrados.length]);

const totalPages = Math.max(1, Math.ceil(visiveisFiltrados.length / perPage));
const pageSafe = Math.min(page, totalPages);

const start = (pageSafe - 1) * perPage;
const end = start + perPage;
const pageItems = visiveisFiltrados.slice(start, end);


  function clearMore() {
    setMinPrice("");
    setMaxPrice("");
    setMinArea("");
    setMaxArea("");
    setMinQuartos("");
    setMinSuites("");
    setMinVagas("");
    setTipo("");
  }

  function goEmp(slug: string) {
    window.location.href = `/empreendimentos/${slug}`;
  }
// 🔎 DIAGNÓSTICO DEFINITIVO (remover depois)
console.log("==== DIAGNÓSTICO FLYIMOB ====");
console.log("Total empreendimentos:", empreendimentos.length);

console.log(
  "Empreendimentos (lat/lng):",
  empreendimentos.map((e) => ({
    name: e.name,
    lat: e.lat,
    lng: e.lng,
    latType: typeof e.lat,
    lngType: typeof e.lng,
  }))
);

  return (
    <main className="h-screen w-full flex flex-col">
      {/* ===== Topbar (logo + busca + mais + entrar) ===== */}
      <div className="h-14 border-b flex items-center gap-2 px-3">
        {/* Logo */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <Image
            src="/brand/flyimob-logo.png"
            alt="FlyImob"
            width={110}
            height={28}
            priority
          />
        </div>

        {/* Busca */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar (nome, bairro, cidade, slug)"
          className="border rounded px-3 py-2 w-[340px] max-w-[45vw]"
        />

        {/* Botão Mais (popover) */}
        <div className="relative">
          <button
            className="border rounded px-3 py-2 hover:bg-gray-50"
            onClick={() => setMoreOpen((v) => !v)}
          >
            Mais
          </button>

          {moreOpen && (
            <div className="absolute left-0 mt-2 w-[340px] max-w-[90vw] bg-white border rounded shadow-lg p-3 z-50">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Filtros</div>
                <button
                  className="text-sm text-gray-600 hover:underline"
                  onClick={() => {
                    clearMore();
                  }}
                >
                  Limpar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                  >
                    <option value="">Todos</option>
                    <option value="CONDOMINIO_VERTICAL">Condomínio vertical</option>
                    <option value="CONDOMINIO_CASAS">Condomínio casas</option>
                    <option value="CONDOMINIO_LOTES">Condomínio lotes</option>
                    <option value="LOTEAMENTO">Loteamento</option>
                    <option value="APARTAMENTO">Apartamento</option>
                    <option value="CASA">Casa</option>
                    <option value="LOTE">Lote</option>
                    <option value="COMERCIAL">Comercial</option>
                    <option value="GALPAO">Galpão</option>
                    <option value="AREA">Área</option>
                    <option value="FAZENDA">Fazenda</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>

                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Preço (mín)</label>
                  <input
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 200000"
                    inputMode="numeric"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Preço (máx)</label>
                  <input
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 500000"
                    inputMode="numeric"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Área (mín m²)</label>
                  <input
                    value={minArea}
                    onChange={(e) => setMinArea(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 50"
                    inputMode="numeric"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Área (máx m²)</label>
                  <input
                    value={maxArea}
                    onChange={(e) => setMaxArea(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 120"
                    inputMode="numeric"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Quartos (mín)</label>
                  <input
                    value={minQuartos}
                    onChange={(e) => setMinQuartos(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 2"
                    inputMode="numeric"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-gray-600">Suítes (mín)</label>
                  <input
                    value={minSuites}
                    onChange={(e) => setMinSuites(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 1"
                    inputMode="numeric"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Vagas (mín)</label>
                  <input
                    value={minVagas}
                    onChange={(e) => setMinVagas(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="ex: 1"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <button
                  className="border rounded px-3 py-2 hover:bg-gray-50"
                  onClick={() => setMoreOpen(false)}
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Entrar discreto */}
        <a
          href="/admin"
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          Entrar
        </a>
      </div>

      {/* ===== Corpo (mapa + lista) ===== */}
      <div className="flex-1 flex w-full">
        {/* Mapa */}
        <div
  className="hidden md:block md:w-[70%]"
  onWheel={() => setUserMovedMap(true)}
  onMouseDown={() => setUserMovedMap(true)}
  onTouchStart={() => setUserMovedMap(true)}
>
  <MapView
    empreendimentos={empreendimentos.map((e) => ({
      id: e.id,
      nome: e.name,
      slug: e.slug,
      lat: e.lat,
      lng: e.lng,
    }))}
    onBoundsChange={(b) => {
      // ✅ só aceita atualização de bounds depois que o usuário realmente interagir
      if (!userMovedMap) return;
      setBounds(b);
    }}
    onPinClick={(slug) => goEmp(slug)}
  />
</div>


        {/* Lista */}
        <div className="w-full md:w-[30%] overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500">
              Exibindo {visiveisFiltrados.length} de {empreendimentos.length}
            </div>

            <select className="border rounded px-2 py-1 text-sm">
              <option>Por relevância</option>
              <option>Mais barato</option>
              <option>Mais caro</option>
            </select>
          </div>

          <div className="space-y-3">
            {pageItems.map((e) => {
              const entrega = formatEntrega(e.dataEntrega);

              return (
                <div
                  key={e.id}
                  className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => goEmp(e.slug)}
                >
                  <div className="flex gap-3">
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

                        {(typeof e.priceFrom === "number" ||
                          typeof e.pricePerM2From === "number" ||
                          entrega) && (
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
                                {typeof e.pricePerM2From === "number"
                                  ? `R$ ${e.pricePerM2From.toLocaleString("pt-BR")}/m²`
                                  : ""}
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

            {visiveisFiltrados.length === 0 && (
              <div className="text-sm text-gray-500">
                Nenhum empreendimento publicado com lat/lng nesta área (ou nos filtros atuais).
              </div>
            )}
          </div>

          {/* Paginação (estilo Órulo, simples) */}
          {visiveisFiltrados.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <button
                className={`border rounded px-3 py-2 text-sm ${
                  pageSafe <= 1 ? "opacity-50 pointer-events-none" : "hover:bg-gray-50"
                }`}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>

              <div className="text-xs text-gray-500">
                Página {pageSafe} de {totalPages}
              </div>

              <button
                className={`border rounded px-3 py-2 text-sm ${
                  pageSafe >= totalPages ? "opacity-50 pointer-events-none" : "hover:bg-gray-50"
                }`}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </button>
            </div>
          )}

          {/* Aviso (no fim do scroll) */}
          <div className="mt-6 text-[11px] text-gray-500 leading-relaxed border-t pt-4">
            <b>IMPORTANTE:</b> Os valores exibidos são referências e podem não estar mais em vigor.
            O anunciante pode alterar preços, condições e informações a qualquer momento, sem aviso prévio.
          </div>
        </div>
      </div>
    </main>
  );
}
