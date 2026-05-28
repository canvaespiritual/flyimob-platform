import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { prisma } from "../../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";
import { s3, S3_BUCKET, S3_REGION } from "../../../../../lib/s3";

export const runtime = "nodejs";

function publicUrl(key: string) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

function esc(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchImageBuffer(url?: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function pickCover(fotos: any[]) {
  if (!Array.isArray(fotos) || fotos.length === 0) return null;
  const cover = fotos.find((f) => f.isCover);
  return cover?.urlFull ?? fotos[0]?.urlFull ?? fotos[0]?.urlThumb ?? null;
}

async function generateOgImage(comparativo: any) {
  const width = 1200;
  const height = 630;

  const rawItems = (comparativo.items || []).slice(0, 3);

  const items = rawItems.map((item: any) => {
    const emp = item.tipologia?.empreendimento;
    return {
      name: emp?.name || "Empreendimento",
      bairro: emp?.bairro || "",
      cidade: emp?.cidade || "",
      imageUrl: pickCover(emp?.fotos || []),
    };
  });

  const count = Math.max(1, items.length);
  const colWidth = Math.floor(width / count);

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < count; i++) {
    const imgBuffer = await fetchImageBuffer(items[i]?.imageUrl);

    let finalImg: Buffer;

    if (imgBuffer) {
      finalImg = await sharp(imgBuffer)
        .resize(colWidth, height, { fit: "cover" })
        .jpeg({ quality: 86 })
        .toBuffer();
    } else {
      finalImg = await sharp({
        create: {
          width: colWidth,
          height,
          channels: 3,
          background: "#0b141a",
        },
      })
        .jpeg({ quality: 86 })
        .toBuffer();
    }

    composites.push({
      input: finalImg,
      left: i * colWidth,
      top: 0,
    });
  }

  const namesSvg = items
    .map((item: any, i: number) => {
      const x = i * colWidth + 34;
      const y = 462;
      const local = [item.bairro, item.cidade].filter(Boolean).join(" • ");

      return `
        <text x="${x}" y="${y}" font-size="25" fill="rgba(255,255,255,0.85)">Opção ${i + 1}</text>
        <text x="${x}" y="${y + 42}" font-size="38" font-weight="800" fill="white">${esc(item.name)}</text>
        <text x="${x}" y="${y + 78}" font-size="24" fill="rgba(255,255,255,0.9)">${esc(local)}</text>
      `;
    })
    .join("");

  const overlaySvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.18)"/>

    <rect x="0" y="0" width="${width}" height="210" fill="rgba(5,18,20,0.82)"/>

    <text x="60" y="82" font-size="48" font-weight="800" fill="white">
      Pre-selecao Inicial de Imoveis
    </text>

    <text x="60" y="132" font-size="30" fill="rgba(255,255,255,0.92)">
      Opcoes separadas para seu perfil
    </text>

    <text x="60" y="178" font-size="28" fill="#7CFFF2">
      Finalize no WhatsApp para liberar parcelas e condicoes
    </text>

    <rect x="1010" y="36" width="132" height="46" rx="23" fill="rgba(255,255,255,0.12)"/>
    <text x="1033" y="67" font-size="25" fill="white">FlyImob</text>
  </svg>
`;

  const finalBuffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#071516",
    },
  })
    .composite([
      ...composites,
      {
        input: Buffer.from(overlaySvg),
        left: 0,
        top: 0,
      },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const key = `public/comparativos/${comparativo.id}/og/${comparativo.slugPublico}-${Date.now()}.jpg`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: finalBuffer,
      ContentType: "image/jpeg",
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

    let ogImageUrl: string | null = null;

    try {
      ogImageUrl = await generateOgImage(comparativo);
    } catch (err) {
      console.error("Erro ao gerar OG image do comparativo:", err);
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
    return NextResponse.json({ ok: false, error: "Erro ao salvar finalização" }, { status: 500 });
  }
}