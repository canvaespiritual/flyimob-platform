import { ImageResponse } from "next/og";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://flyimob.com";

function abs(url?: string | null) {
  if (!url) return `${SITE_URL}/logo.png`;
  if (url.startsWith("http")) return url;
  return `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function pickCover(fotos: any[]) {
  if (!Array.isArray(fotos) || fotos.length === 0) return null;
  const cover = fotos.find((f) => f.isCover);
  return cover?.urlFull ?? fotos[0]?.urlFull ?? null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") || "").trim();

  if (!slug) return new Response("slug obrigatório", { status: 400 });

  const comparativo = await prisma.comparativo.findUnique({
    where: { slugPublico: slug },
    include: {
      items: {
        orderBy: { ordem: "asc" },
        take: 3,
        include: {
          tipologia: {
            include: {
              empreendimento: {
                include: {
                  fotos: { orderBy: { ordem: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!comparativo) {
    return new Response("Comparativo não encontrado", { status: 404 });
  }

  const items = comparativo.items.map((item: any) => {
    const emp = item.tipologia?.empreendimento;
    return {
      name: emp?.name || "Empreendimento",
      bairro: emp?.bairro || "",
      cidade: emp?.cidade || "",
      image: abs(pickCover(emp?.fotos || [])),
    };
  });

  while (items.length < 3) {
    items.push({
      name: "Opção em análise",
      bairro: "",
      cidade: "",
      image: `${SITE_URL}/logo.png`,
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          position: "relative",
          background: "#071516",
          color: "white",
          fontFamily: "Arial",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "row",
          }}
        >
          {items.map((item, index) => (
            <div
              key={index}
              style={{
                width: 400,
                height: 630,
                display: "flex",
                position: "relative",
                overflow: "hidden",
                borderRight:
                  index < 2 ? "4px solid rgba(255,255,255,0.25)" : "none",
              }}
            >
              <img
                src={item.image}
                width="400"
                height="630"
                style={{
                  width: 400,
                  height: 630,
                  objectFit: "cover",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.20), rgba(0,0,0,0.10))",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  bottom: 34,
                  left: 28,
                  right: 28,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ display: "flex", fontSize: 22, opacity: 0.9 }}>
                  Opção {index + 1}
                </div>

                <div
                  style={{
                    display: "flex",
                    fontSize: 34,
                    fontWeight: 800,
                    lineHeight: 1.1,
                  }}
                >
                  {item.name}
                </div>

                <div
                  style={{
                    display: "flex",
                    fontSize: 22,
                    marginTop: 8,
                    opacity: 0.9,
                  }}
                >
                  {item.bairro}
                  {item.cidade ? ` • ${item.cidade}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 60,
            top: 54,
            display: "flex",
            flexDirection: "column",
            background: "rgba(0,0,0,0.64)",
            padding: "28px 34px",
            borderRadius: 28,
            border: "2px solid rgba(255,255,255,0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 54,
              fontWeight: 900,
              lineHeight: 1.05,
            }}
          >
            Pré-Seleção Inicial
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 28,
              marginTop: 12,
              opacity: 0.95,
            }}
          >
            3 opções separadas para seu perfil
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 24,
              marginTop: 18,
              color: "#7CFFF2",
            }}
          >
            Finalize no WhatsApp para liberar parcelas e condições
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            right: 46,
            bottom: 34,
            display: "flex",
            fontSize: 24,
            background: "rgba(0,0,0,0.58)",
            padding: "14px 22px",
            borderRadius: 999,
          }}
        >
          FlyImob
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}