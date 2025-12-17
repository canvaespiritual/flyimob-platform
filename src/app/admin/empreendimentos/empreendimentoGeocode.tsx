"use client";

import { useCallback, useMemo, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

type Props = {
  initialEndereco?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  initialBairro?: string | null;
  initialCidade?: string | null;
  initialUf?: string | null;
  initialCep?: string | null;
};

const fallbackCenter = { lat: -16.6869, lng: -49.2648 };

export default function EmpreendimentoGeocode({
  initialEndereco = "",
  initialLat = null,
  initialLng = null,
  initialBairro = "",
  initialCidade = "",
  initialUf = "",
  initialCep = "",
}: Props) {
  const [endereco, setEndereco] = useState(initialEndereco);
  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [bairro, setBairro] = useState(initialBairro || "");
  const [cidade, setCidade] = useState(initialCidade || "");
  const [uf, setUf] = useState(initialUf || "");
  const [cep, setCep] = useState(initialCep || "");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",

    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  const center = useMemo(() => {
    if (lat != null && lng != null) return { lat, lng };
    return fallbackCenter;
  }, [lat, lng]);

  const buscarNoMapa = useCallback(async () => {
    setErro(null);
    const addr = endereco.trim();
    if (!addr) {
      setErro("Digite um endereço antes de buscar.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await r.json();

      if (!r.ok) {
        setErro("Não foi possível geocodificar esse endereço.");
        return;
      }

      setEndereco(data.formattedAddress || addr);
      setLat(Number(data.lat));
      setLng(Number(data.lng));
      setBairro(data.bairro || "");
      setCidade(data.cidade || "");
      setUf(data.uf || "");
      setCep(data.cep || "");
    } catch {
      setErro("Falha de rede ao geocodificar.");
    } finally {
      setLoading(false);
    }
  }, [endereco]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">Endereço (texto livre)*</label>

        <div className="flex gap-2">
          <input
            name="endereco"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            placeholder="Rua, número, bairro, cidade - UF"
            className="border rounded px-3 py-2 w-full"
            required
          />

          <button
            type="button"
            onClick={buscarNoMapa}
            className="border rounded px-3 py-2 whitespace-nowrap hover:bg-gray-50"
            disabled={loading}
          >
            {loading ? "Buscando..." : "Buscar no mapa"}
          </button>
        </div>

        {erro && <div className="text-sm text-red-600">{erro}</div>}
      </div>

      {/* Hidden fields (persistência no POST) */}
      <input type="hidden" name="lat" value={lat ?? ""} />
      <input type="hidden" name="lng" value={lng ?? ""} />
      <input type="hidden" name="bairro" value={bairro} />
      <input type="hidden" name="cidade" value={cidade} />
      <input type="hidden" name="uf" value={uf} />
      <input type="hidden" name="cep" value={cep} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border rounded overflow-hidden h-[260px]">
          {!isLoaded ? (
            <div className="p-3 text-sm">Carregando mapa…</div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={center}
              zoom={lat != null && lng != null ? 16 : 12}
              options={{
                clickableIcons: false,
                fullscreenControl: false,
                mapTypeControl: false,
                streetViewControl: false,
              }}
            >
              {lat != null && lng != null && (
                <Marker
                  position={{ lat, lng }}
                  draggable
                  onDragEnd={(e) => {
                    const p = e.latLng;
                    if (!p) return;
                    setLat(p.lat());
                    setLng(p.lng());
                  }}
                />
              )}
            </GoogleMap>
          )}
        </div>

        <div className="border rounded p-3">
          <div className="text-sm font-medium mb-2">Dados detectados</div>
          <div className="text-sm text-gray-700">Bairro: {bairro || "-"}</div>
          <div className="text-sm text-gray-700">Cidade: {cidade || "-"}</div>
          <div className="text-sm text-gray-700">UF: {uf || "-"}</div>
          <div className="text-sm text-gray-700">CEP: {cep || "-"}</div>
          <div className="text-xs text-gray-500 mt-2">
            Lat/Lng serão salvos no empreendimento.
          </div>
        </div>
      </div>
    </div>
  );
}
