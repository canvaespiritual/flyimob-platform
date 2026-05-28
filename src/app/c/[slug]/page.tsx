import type { Metadata } from "next";
import { prisma } from "../../../lib/prisma";
import ComparativoPublicClient from "./ui/ComparativoPublicClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://flyimob.com";

function absoluteUrl(url?: string | null) {
  if (!url) return `${SITE_URL}/logo.png`;
  if (url.startsWith("http")) return url;
  return `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

async function getComparativo(slug: string) {
  return prisma.comparativo.findUnique({
    where: { slugPublico: slug },
    include: {
      items: {
        orderBy: { ordem: "asc" },
        include: {
          tipologia: {
            include: {
              empreendimento: {
                include: {
                  construtora: { select: { name: true } },
                  fotos: { orderBy: { ordem: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });
}

function pickOgImage(comparativo: any) {
  const firstItem = comparativo?.items?.[0];
  const fotos = firstItem?.tipologia?.empreendimento?.fotos ?? [];

  const cover = fotos.find((f: any) => f.isCover) ?? fotos[0];

  return absoluteUrl(cover?.urlFull ?? cover?.urlThumb ?? null);
}

export async function generateMetadata(
  { params }: { params: { slug: string } | Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);

  if (!slug) {
    return {
      title: "Comparativo de imóveis | FlyImob",
      description: "Comparativo personalizado de imóveis.",
    };
  }

  const comparativo = await getComparativo(slug);

  if (!comparativo) {
    return {
      title: "Comparativo não encontrado | FlyImob",
      description: "Este comparativo não foi encontrado.",
    };
  }

  const title = "🏠 Sua Pré-Seleção Inicial de Imóveis";
  const description =
    "Veja as opções iniciais separadas para seu perfil e finalize sua pré-análise para liberar parcelas, entrada e cenários personalizados.";

  const url = `${SITE_URL}/c/${comparativo.slugPublico}`;
 const config =
  typeof comparativo.configExibicao === "string"
    ? JSON.parse(comparativo.configExibicao)
    : comparativo.configExibicao ?? {};


  const image = config?.ogImageUrl
  ? absoluteUrl(config.ogImageUrl)
  : pickOgImage(comparativo);

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    openGraph: {
      title,
      description,
      url,
      siteName: "FlyImob",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Pré-seleção inicial de imóveis",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicComparativoPage(
  { params }: { params: { slug: string } | Promise<{ slug: string }> }
) {
  const { slug } = await Promise.resolve(params);

  if (!slug) {
    return <div className="p-6">Comparativo inválido.</div>;
  }

  const comparativo = await getComparativo(slug);
  
  if (!comparativo) {
    return <div className="p-6">Comparativo não encontrado.</div>;
  }
console.log("CONFIG EXIBICAO:", comparativo.configExibicao);
  return <ComparativoPublicClient comparativo={comparativo} />;
}