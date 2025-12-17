"use client";

import { useCallback, useState } from "react";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import type { Empreendimento } from "@/lib/mockEmpreendimentos";

type BoundsLite = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

const center = { lat: -16.6869, lng: -49.2648 };

export default function MapView({
  empreendimentos,
  onBoundsChange,
  onPinClick,
}: {
  empreendimentos: Empreendimento[];
  onBoundsChange: (b: BoundsLite) => void;
  onPinClick: (slug: string) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  const [hovered, setHovered] = useState<Empreendimento | null>(null);

  const handleIdle = useCallback(
    (map: google.maps.Map) => {
      const b = map.getBounds();
      if (!b) return;

      const sw = b.getSouthWest();
      const ne = b.getNorthEast();

      onBoundsChange({
        swLat: sw.lat(),
        swLng: sw.lng(),
        neLat: ne.lat(),
        neLng: ne.lng(),
      });
    },
    [onBoundsChange]
  );

  if (!isLoaded) return <div className="p-4">Carregando mapa...</div>;

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={13}
      onIdle={handleIdle}
      options={{
        clickableIcons: false,
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      }}
    >
      {empreendimentos.map((e) => (
        <Marker
          key={e.id}
          position={{ lat: e.lat, lng: e.lng }}
          onClick={() => onPinClick(e.slug)}
          onMouseOver={() => setHovered(e)}
          onMouseOut={() => setHovered(null)}
        />
      ))}

      {hovered && (
        <InfoWindow
          position={{ lat: hovered.lat, lng: hovered.lng }}
          onCloseClick={() => setHovered(null)}
        >
          <div className="text-sm font-medium">{hovered.nome}</div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
