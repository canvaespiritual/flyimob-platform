import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { prisma } from "../../../../../lib/prisma";
import { s3, S3_BUCKET, S3_REGION } from "../../../../../lib/s3";

export const runtime = "nodejs";

function publicUrl(key: string) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}
function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
}

export async function POST(req: Request) {
  const form = await req.formData();

  const tenantSlug = String(form.get("tenantSlug") || "");
  const empreendimentoId = String(form.get("empreendimentoId") || "");
  const coverIndex = Number(String(form.get("coverIndex") || "0"));
  const files = form.getAll("files") as File[];

  if (!tenantSlug || !empreendimentoId || files.length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!emp) return NextResponse.json({ error: "empreendimento_not_found" }, { status: 404 });

  // zera capa anterior
  await prisma.empreendimentoFoto.updateMany({
    where: { empreendimentoId },
    data: { isCover: false },
  });

  const created: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith("image/")) continue;

    const bytes = Buffer.from(await file.arrayBuffer());

    const fullBuf = await sharp(bytes)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const thumbBuf = await sharp(bytes)
      .rotate()
      .resize({ width: 420, height: 420, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer();

    const base = `${Date.now()}-${i}-${safeName(file.name || "foto.jpg")}`.replace(/\.[^.]+$/, "");
    const keyFull = `public/empreendimentos/${empreendimentoId}/photos/full/${base}.jpg`;
    const keyThumb = `public/empreendimentos/${empreendimentoId}/photos/thumb/${base}.jpg`;

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: keyFull,
      Body: fullBuf,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }));

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: keyThumb,
      Body: thumbBuf,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }));

    const row = await prisma.empreendimentoFoto.create({
      data: {
        empreendimentoId,
        urlFull: publicUrl(keyFull),
        urlThumb: publicUrl(keyThumb),
        ordem: i,
        isCover: i === coverIndex,
      },
      select: { id: true, urlFull: true, urlThumb: true, ordem: true, isCover: true },
    });

    created.push(row);
  }

  return NextResponse.json({ ok: true, fotos: created });
}
