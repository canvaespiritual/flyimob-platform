import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";
import { s3, S3_BUCKET, S3_REGION } from "../../../../../lib/s3";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://flyimob.com";

function publicUrl(key: string) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

function hasAtLeastOnePhoto(comparativo: any) {
  return (comparativo.items ?? []).some((item: any) => {
    const fotos = item.tipologia?.empreendimento?.fotos ?? [];
    return Array.isArray(fotos) && fotos.length > 0;
  });
}

async function generateAndUploadOgImage(slugPublico: string, comparativoId: string) {
  const ogUrl = `${SITE_URL}/api/comparativos/og/${slugPublico}/image.png`;

  const res = await fetch(ogUrl, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Falha ao gerar OG dinâmica: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("image")) {
    throw new Error(`OG dinâmica não retornou imagem. Content-Type: ${contentType}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length < 10_000) {
    throw new Error(`OG dinâmica retornou arquivo muito pequeno: ${buffer.length} bytes`);
  }

  const key = `public/comparativos/${comparativoId}/og/${slugPublico}-${Date.now()}.png`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return publicUrl(key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    const configExibicao = body?.configExibicao ?? null;

    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });
    }

    const s = await requireUser();
    const tenant = s.tenant;

    const comparativo = await prisma.comparativo.findFirst({
      where: { id, tenantId: tenant.id },
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
      return NextResponse.json({ ok: false, error: "Comparativo não encontrado" }, { status: 404 });
    }

    const incomingConfig =
      typeof configExibicao === "object" && configExibicao ? configExibicao : {};

    let ogImageUrl: string | null = null;

    const canGenerateOg =
      Array.isArray(comparativo.items) &&
      comparativo.items.length > 0 &&
      hasAtLeastOnePhoto(comparativo);

    if (canGenerateOg) {
      try {
        ogImageUrl = await generateAndUploadOgImage(
          comparativo.slugPublico,
          comparativo.id
        );
      } catch (err) {
        console.error("Erro ao gerar/upload OG image do comparativo:", err);
      }
    } else {
      console.warn(
        "OG image não gerada: comparativo sem itens/fotos.",
        comparativo.id
      );
    }

    const previousConfig =
      typeof comparativo.configExibicao === "object" && comparativo.configExibicao
        ? (comparativo.configExibicao as any)
        : {};

    const nextConfigExibicao = {
      ...previousConfig,
      ...incomingConfig,
      ...(ogImageUrl
        ? {
            ogImageUrl,
            ogImageGeneratedAt: new Date().toISOString(),
          }
        : {}),
    };

    await prisma.comparativo.update({
      where: { id: comparativo.id },
      data: {
        configExibicao: nextConfigExibicao,
      },
    });

    return NextResponse.json({
      ok: true,
      ogImageUrl,
      ogGenerated: !!ogImageUrl,
      reason: ogImageUrl
        ? "generated"
        : canGenerateOg
          ? "generation_failed"
          : "missing_items_or_photos",
    });
  } catch (e) {
    console.error("finalize/save error:", e);
    return NextResponse.json(
      { ok: false, error: "Erro ao salvar finalização" },
      { status: 500 }
    );
  }
}