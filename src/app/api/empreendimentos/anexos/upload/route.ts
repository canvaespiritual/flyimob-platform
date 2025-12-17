import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
  const tipo = String(form.get("tipo") || "GERAL");
  const titulo = String(form.get("titulo") || "");
  const file = form.get("file") as File | null;

  if (!tenantSlug || !empreendimentoId || !file) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // limite simples (ex: 30MB)
  const maxBytes = 30 * 1024 * 1024;
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > maxBytes) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!emp) return NextResponse.json({ error: "empreendimento_not_found" }, { status: 404 });

  const key = `public/empreendimentos/${empreendimentoId}/attachments/${Date.now()}-${safeName(file.name || "anexo")}`;

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buf,
    ContentType: file.type || "application/octet-stream",
    CacheControl: "public, max-age=31536000, immutable",
  }));

  const row = await prisma.empreendimentoAnexo.create({
    data: {
      empreendimentoId,
      tipo,
      titulo: titulo || null,
      url: publicUrl(key),
      ordem: 0,
    },
    select: { id: true, tipo: true, titulo: true, url: true },
  });

  return NextResponse.json({ ok: true, anexo: row });
}
