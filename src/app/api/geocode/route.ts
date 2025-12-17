import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();

  if (!address) {
    return NextResponse.json({ error: "address_required" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "missing_server_key" }, { status: 500 });
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(key)}` +
    `&region=br`;

  const r = await fetch(url);
  const data = await r.json();

  if (data.status !== "OK" || !data.results?.length) {
    return NextResponse.json(
      { error: "geocode_failed", status: data.status, message: data.error_message || null },
      { status: 400 }
    );
  }

  const result = data.results[0];
  const loc = result.geometry.location;

  const components = result.address_components || [];
  const get = (type: string) =>
    components.find((c: any) => (c.types || []).includes(type))?.long_name || "";

  const bairro =
    get("sublocality") ||
    get("sublocality_level_1") ||
    get("neighborhood") ||
    "";

  const cidade = get("administrative_area_level_2") || get("locality") || "";
  const uf =
    components.find((c: any) => (c.types || []).includes("administrative_area_level_1"))
      ?.short_name || "";

  const cep = get("postal_code") || "";

  return NextResponse.json({
    formattedAddress: result.formatted_address || address,
    lat: loc.lat,
    lng: loc.lng,
    bairro,
    cidade,
    uf,
    cep,
  });
}
