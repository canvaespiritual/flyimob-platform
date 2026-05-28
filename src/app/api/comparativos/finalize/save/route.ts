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

async function generateAndUploadOgImage(slugPublico: string, comparativoId: string) {
  const ogUrl = `${SITE_URL}/api/comparativos/og/${slugPublico}/image.png`;

  const res = await fetch(ogUrl, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Falha ao gerar OG dinâmica: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

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
      select: {
        id: true,
        slugPublico: true,
      },
    });

    if (!comparativo) {
      return NextResponse.json({ ok: false, error: "Comparativo não encontrado" }, { status: 404 });
    }

    let ogImageUrl: string | null = null;

    try {
      ogImageUrl = await generateAndUploadOgImage(
        comparativo.slugPublico,
        comparativo.id
      );
    } catch (err) {
      console.error("Erro ao gerar/upload OG image do comparativo:", err);
    }

    const nextConfigExibicao = {
      ...(typeof configExibicao === "object" && configExibicao ? configExibicao : {}),
      ...(ogImageUrl
        ? {
            ogImageUrl,
            ogImageGeneratedAt: new Date().toISOString(),
          }
        : {}),
    };

    await prisma.comparativo.update({
      where: { id },
      data: {
        configExibicao: nextConfigExibicao,
      },
    });

    return NextResponse.json({ ok: true, ogImageUrl });
  } catch (e) {
    console.error("finalize/save error:", e);
    return NextResponse.json(
      { ok: false, error: "Erro ao salvar finalização" },
      { status: 500 }
    );
  }
}