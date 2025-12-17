import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { s3, S3_BUCKET } from "../../../../../lib/s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

function keyFromPublicUrl(url: string) {
  // Ex: https://flyimob-assets.s3.us-east-2.amazonaws.com/public/...
  const u = new URL(url);
  return u.pathname.replace(/^\//, ""); // remove leading /
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tenantSlug = String(body.tenantSlug || "");
  const empreendimentoId = String(body.empreendimentoId || "");
  const fotoId = String(body.fotoId || "");

  if (!tenantSlug || !empreendimentoId || !fotoId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!emp) return NextResponse.json({ error: "empreendimento_not_found" }, { status: 404 });

  const foto = await prisma.empreendimentoFoto.findFirst({
    where: { id: fotoId, empreendimentoId },
    select: { id: true, urlFull: true, urlThumb: true, isCover: true },
  });
  if (!foto) return NextResponse.json({ error: "foto_not_found" }, { status: 404 });

  // apaga do S3 (full + thumb)
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: keyFromPublicUrl(foto.urlFull) }));
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: keyFromPublicUrl(foto.urlThumb) }));
  } catch {
    // mesmo se falhar no S3, a gente pode continuar removendo do banco (MVP).
  }

  await prisma.empreendimentoFoto.delete({ where: { id: fotoId } });

  // se removeu a capa, tenta promover a primeira foto restante
  if (foto.isCover) {
    const first = await prisma.empreendimentoFoto.findFirst({
      where: { empreendimentoId },
      orderBy: { ordem: "asc" },
      select: { id: true },
    });
    if (first) {
      await prisma.empreendimentoFoto.update({
        where: { id: first.id },
        data: { isCover: true },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
