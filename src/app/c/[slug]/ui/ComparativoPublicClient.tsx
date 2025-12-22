"use client";

import { useEffect, useMemo, useState } from "react";

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthsUntil(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(
    0,
    (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth())
  );
}

function pickCoverPhoto(fotos: any[]) {
  if (!Array.isArray(fotos) || fotos.length === 0) return null;
  const cover = fotos.find((f) => f.isCover);
  return cover?.urlFull ?? fotos[0]?.urlFull ?? null;
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (window.google?.maps) return resolve();

    const existing = document.getElementById("gmaps-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }

    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
}

export default function ComparativoPublicClient({ comparativo }: { comparativo: any }) {
  const config = comparativo.configExibicao ?? null;

  // defaults se ainda não tiver config (mas você já tem a página Finalizar)
  const fields = config?.fields ?? {};
  const blocks = config?.blocks ?? { geral: true, entrada: true, financiamento: true, observacoes: true, mapa: true, capa: true };
  const layout = config?.layout ?? {
    primary: ["valorTotal", "entradaTotal", "sinalEntrada", "parcelaEntrada", "parcelaFinanciamento"],
    secondary: ["dataEntregaMeses", "precoM2", "subsidioFederal", "fgts"],
  };

  // slideshow modal
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  function openLightbox(urls: string[], startIdx: number) {
    setLightboxImages(urls.filter(Boolean));
    setLightboxIndex(startIdx);
    setLightboxOpen(true);
  }

  function closeLightbox() {
    setLightboxOpen(false);
    setLightboxImages([]);
    setLightboxIndex(0);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      if (!lightboxOpen) return;
      if (e.key === "ArrowRight") setLightboxIndex((i) => Math.min(i + 1, lightboxImages.length - 1));
      if (e.key === "ArrowLeft") setLightboxIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, lightboxImages.length]);

  // computed items (já ordenados)
  const items = useMemo(() => {
    return (comparativo.items ?? []).map((it: any, idx: number) => {
      const t = it.tipologia;
      const emp = t?.empreendimento;

      const valorBase = it.valorTotal ?? t?.precoInicial ?? null;
      const area = t?.areaPrivativa ?? t?.areaTerreno ?? null;
      const precoM2 = valorBase && area ? valorBase / area : null;
      const entregaMeses = monthsUntil(emp?.dataEntrega);

      const saldoSug = valorBase && it.entradaTotal ? valorBase - it.entradaTotal : null;

      const fotos = emp?.fotos ?? [];
      const urls = fotos.map((f: any) => f.urlFull).filter(Boolean);
      const cover = pickCoverPhoto(fotos);

      return { it, t, emp, valorBase, area, precoM2, entregaMeses, saldoSug, cover, urls, idx };
    });
  }, [comparativo]);

  // ========= RENDER HELPERS =========

  function shouldShow(key: string) {
  // campos críticos sempre aparecem
  if (["entradaTotal", "valorTotal"].includes(key)) return true;

  if (!config?.fields) return true;
  return !!fields[key];
}

  function labelValuePairs(x: any) {
    const { it, t, emp, valorBase, precoM2, entregaMeses, saldoSug } = x;

    // valores “derivados”
    const dataEntregaMeses = entregaMeses === null ? null : entregaMeses;

    const dict: Record<string, { label: string; value: any }> = {
      // GERAL
      nomeEmpreendimento: { label: "Empreendimento", value: emp?.name ?? "-" },
      construtora: { label: "Construtora", value: emp?.construtora?.name ?? "-" },
      bairro: { label: "Bairro", value: emp?.bairro ?? "-" },
      cidade: { label: "Cidade", value: emp?.cidade ?? "-" },
      enderecoCompleto: { label: "Endereço", value: emp?.endereco ?? "-" },
      dataEntregaMeses: { label: "Entrega", value: dataEntregaMeses === null ? "-" : `em ${dataEntregaMeses} meses` },
      tipologiaNome: { label: "Tipologia", value: t?.nome ?? "-" },
      quartos: { label: "Quartos", value: t?.quartos ?? "-" },
      suites: { label: "Suítes", value: t?.suites ?? "-" },
      vagas: { label: "Vagas", value: t?.vagas ?? "-" },
      areaPrivativa: { label: "Área privativa", value: t?.areaPrivativa ? `${t.areaPrivativa} m²` : "-" },
      areaTerreno: { label: "Área terreno", value: t?.areaTerreno ? `${t.areaTerreno} m²` : "-" },
      hectares: { label: "Hectares", value: t?.hectares ?? "-" },
      alqueires: { label: "Alqueires", value: t?.alqueires ?? "-" },
      disponiveis: { label: "Disponíveis", value: t?.disponiveis ?? "-" },
      valorAvaliacaoBanco: { label: "Avaliação", value: t?.valorAvaliacaoBanco ? money(t.valorAvaliacaoBanco) : "-" },

      // ENTRADA
      valorTotal: { label: "Valor total", value: money(valorBase) },
      entradaTotal: { label: "Entrada total", value: money(it?.entradaTotal) },
      sinalEntrada: { label: "Sinal", value: money(it?.sinalEntrada) },
      parcelasEntradaQtd: { label: "Qtd parcelas entrada", value: it?.parcelasEntradaQtd ?? "-" },
      parcelaEntrada: { label: "Parcela entrada", value: money(it?.parcelaEntrada) },
      parcelasIntermediarias: { label: "Intermediárias", value: it?.parcelasIntermediarias ?? "-" },
      parcelaUnica: { label: "Parcela única", value: it?.parcelaUnica ?? "-" },
      parcelaEspecial: { label: "Parcela especial", value: it?.parcelaEspecial ?? "-" },
      parcelasAnuais: { label: "Parcelas anuais", value: it?.parcelasAnuais ?? "-" },

      // BENEFÍCIOS
      fgts: { label: "FGTS", value: money(it?.fgts) },
      subsidioFederal: { label: "Subsídio federal", value: money(it?.subsidioFederal) },
      subsidioEstadual: { label: "Subsídio estadual", value: money(it?.subsidioEstadual) },
      subsidioMunicipal: { label: "Subsídio municipal", value: money(it?.subsidioMunicipal) },

      // FINANCIAMENTO
      saldoFinanciamento: { label: "Saldo financiamento", value: money(it?.saldoFinanciamento ?? saldoSug) },
      parcelaFinanciamento: { label: "Parcela financiamento", value: money(it?.parcelaFinanciamento) },
      taxaJuros: { label: "Taxa de juros", value: it?.taxaJuros ? `${it.taxaJuros}%` : "-" },
      rendaBrutaFamiliar: { label: "Renda bruta", value: money(it?.rendaBrutaFamiliar) },

      // CUSTOS / OBS
      estimativaDocumentacao: { label: "Documentação", value: money(it?.estimativaDocumentacao) },
      observacao: { label: "Observação", value: it?.observacao ?? "-" },

      // DERIVADOS úteis (não checkbox por enquanto; mas você pode incluir se quiser)
      precoM2: { label: "Preço/m²", value: precoM2 ? money(precoM2) : "-" },
    };

    return dict;
  }

  function renderMetric(key: string, dict: any) {
    if (!shouldShow(key)) return null;
    const v = dict[key];
    if (!v) return null;
    return (
      <div className="border rounded-lg p-3">
        <div className="text-xs text-gray-500">{v.label}</div>
        <div className="text-base font-semibold">{v.value}</div>
      </div>
    );
  }

  function renderLine(key: string, dict: any) {
    if (!shouldShow(key)) return null;
    const v = dict[key];
    if (!v) return null;
    return (
      <div className="flex justify-between gap-4 border-b py-2 text-sm">
        <div className="text-gray-500">{v.label}</div>
        <div className="font-medium text-right">{v.value}</div>
      </div>
    );
  }

  // ========= MAP =========
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [mapReady, setMapReady] = useState(false);
  const [mapErr, setMapErr] = useState<string | null>(null);

  useEffect(() => {
    if (!blocks.mapa) return;
    if (!apiKey) {
      setMapErr("Faltou NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
      return;
    }
    loadGoogleMaps(apiKey)
      .then(() => setMapReady(true))
      .catch((e) => setMapErr(String(e?.message ?? e)));
  }, [apiKey, blocks.mapa]);

  useEffect(() => {
    if (!mapReady) return;
    // @ts-ignore
    const google = window.google;
    const el = document.getElementById("cmp-map");
    if (!el) return;

    // pins (lat/lng do empreendimento)
   const pins = items
  .map((x: any) => {
    const lat = x.emp?.lat;
    const lng = x.emp?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    return { lat, lng, x };
  })
  .filter(Boolean) as { lat: number; lng: number; x: any }[];

if (pins.length === 0) return;


    const center = { lat: pins[0].lat, lng: pins[0].lng };
    const map = new google.maps.Map(el, { center, zoom: 12 });

    const bounds = new google.maps.LatLngBounds();

    pins.forEach((p, idx) => {
      const pos = { lat: p.lat, lng: p.lng };
      bounds.extend(pos);

      const marker = new google.maps.Marker({
        position: pos,
        map,
        label: String(idx + 1),
      });

      const info = new google.maps.InfoWindow({
        content: `
          <div style="max-width:220px">
            <div style="font-weight:600;margin-bottom:4px">${p.x.emp?.name ?? "Empreendimento"}</div>
            <div style="font-size:12px;color:#555">${p.x.emp?.bairro ?? "-"} • ${p.x.emp?.cidade ?? "-"}</div>
            <div style="margin-top:6px;font-size:12px"><b>Valor:</b> ${money(p.x.valorBase)}</div>
          </div>
        `,
      });

      marker.addListener("click", () => info.open({ map, anchor: marker }));
    });

    map.fitBounds(bounds);
  }, [mapReady, items]);

  // ========= FOOTER DISCLAIMER =========
  const disclaimer = `Este comparativo possui caráter de pré-atendimento e foi elaborado com base nas informações fornecidas no momento do atendimento. Valores, disponibilidade, condições e planos oficiais devem ser confirmados e efetivados diretamente junto aos proprietários legais, construtoras e vendedores na fase de fechamento.`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              {comparativo.titulo}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Cliente: <span className="font-medium">{comparativo.clienteNome}</span>
            </p>
          </div>

          {/* Logo (ajuste o caminho) */}
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 w-auto opacity-90"
            onError={(e) => {
              // se não existir logo.png, simplesmente some
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <p className="mt-4 text-gray-600 text-sm max-w-3xl">
          Comparação personalizada para facilitar sua decisão, com informações organizadas lado a lado.
        </p>
      </div>

      {/* CARDS */}
      <div className="max-w-7xl mx-auto px-4 pb-10">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">

          {items.map((x: any) => {
            const dict = labelValuePairs(x);

            // imagens
            const showCover = blocks.capa && x.cover;

            return (
              <div key={x.it.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                {/* Capa */}
                {showCover && (
                  <button
                    className="w-full text-left"
                    onClick={() => openLightbox(x.urls.length ? x.urls : [x.cover], 0)}
                    title="Ver fotos"
                  >
                    <div className="aspect-[16/9] bg-gray-100 overflow-hidden">
                      <img
                        src={x.cover}
                        alt="Capa"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </button>
                )}

                <div className="p-4 space-y-4">
                  {/* Título do card */}
                  <div>
                    <div className="text-sm text-gray-500">Opção {x.idx + 1}</div>
                    <div className="text-lg font-semibold leading-tight">
                      {x.emp?.name ?? "Empreendimento"}
                    </div>
                    <div className="text-sm text-gray-600">
                      {x.emp?.bairro ?? "-"} • {x.emp?.cidade ?? "-"}
                    </div>
                  </div>

                  {/* PRIMÁRIOS */}
                  <div className="grid grid-cols-2 gap-2">
                    {layout.primary.map((k: string) => renderMetric(k, dict))}
                  </div>

                  {/* SECUNDÁRIOS */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* preço/m² é derivado: mostramos se marcado no checklist via key "precoM2"? 
                        Você pode adicionar "precoM2" na config depois; por enquanto ele entra como secundário mesmo. */}
                    {layout.secondary.map((k: string) => renderMetric(k, dict))}
                   
                  </div>

                  {/* TERCIÁRIOS (lista limpa) */}
                  <div className="pt-2">
                    {blocks.geral && (
                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Detalhes</div>
                    )}
                    <div className="space-y-0">
                      {/* Geral */}
                      {blocks.geral && (
                        <>
                          {renderLine("tipologiaNome", dict)}
                          {renderLine("quartos", dict)}
                          {renderLine("suites", dict)}
                          {renderLine("vagas", dict)}
                          {renderLine("areaPrivativa", dict)}
                          {renderLine("areaTerreno", dict)}
                          {renderLine("construtora", dict)}
                        </>
                      )}

                      {/* Entrada */}
                      {blocks.entrada && (
                        <>
                          {renderLine("parcelasEntradaQtd", dict)}
                          {renderLine("parcelasIntermediarias", dict)}
                          {renderLine("parcelaUnica", dict)}
                          {renderLine("parcelaEspecial", dict)}
                          {renderLine("parcelasAnuais", dict)}
                        </>
                      )}

                      {/* Financiamento */}
                      {blocks.financiamento && (
                        <>
                          {renderLine("saldoFinanciamento", dict)}
                          {renderLine("taxaJuros", dict)}
                          {renderLine("rendaBrutaFamiliar", dict)}
                          {renderLine("estimativaDocumentacao", dict)}
                        </>
                      )}

                      {/* Observações */}
                      {blocks.observacoes && shouldShow("observacao") && (
                        <div className="mt-3 border rounded-lg p-3 bg-gray-50 text-sm">
                          <div className="text-xs text-gray-500 mb-1">Observação</div>
                          <div className="text-gray-700 whitespace-pre-wrap">
                            {dict.observacao?.value ?? "-"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* MAPA */}
        {blocks.mapa && (
          <div className="mt-10 bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-lg font-semibold">Localização no mapa</div>
            <p className="text-sm text-gray-600 mt-1">
              Veja os empreendimentos do comparativo posicionados para comparação visual.
            </p>

            {!apiKey && (
              <div className="mt-4 text-sm text-red-600">
                {mapErr ?? "Defina NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ativar o mapa."}
              </div>
            )}

            {apiKey && !mapReady && (
              <div className="mt-4 text-sm text-gray-500">Carregando mapa...</div>
            )}

            {apiKey && mapReady && (
              <div id="cmp-map" className="mt-4 w-full h-[420px] rounded-xl overflow-hidden border" />
            )}
          </div>
        )}

        {/* DISCLAIMER + FOOTER */}
        <div className="mt-10 text-xs text-gray-600">
          <div className="border-t pt-6">
            <p className="max-w-4xl leading-relaxed">{disclaimer}</p>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-8 w-auto opacity-90"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                />
                <div className="text-gray-500">
                  FlyImob • Todos os direitos reservados.
                </div>
              </div>

              <div className="text-gray-400">
                © {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 text-white">
              <div className="text-sm opacity-80">
                {lightboxIndex + 1} / {lightboxImages.length}
              </div>
              <button
                onClick={closeLightbox}
                className="text-white border border-white/30 rounded px-3 py-1 text-sm"
              >
                Fechar (ESC)
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden border border-white/10">
              <img
                src={lightboxImages[lightboxIndex]}
                alt="Foto"
                className="w-full max-h-[75vh] object-contain bg-black"
              />
            </div>

            <div className="flex justify-between mt-3">
              <button
                onClick={() => setLightboxIndex((i) => Math.max(0, i - 1))}
                disabled={lightboxIndex === 0}
                className="text-white border border-white/20 rounded px-3 py-2 text-sm disabled:opacity-40"
              >
                ← Anterior
              </button>

              <button
                onClick={() => setLightboxIndex((i) => Math.min(lightboxImages.length - 1, i + 1))}
                disabled={lightboxIndex === lightboxImages.length - 1}
                className="text-white border border-white/20 rounded px-3 py-2 text-sm disabled:opacity-40"
              >
                Próxima →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
