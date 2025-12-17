import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { s3, S3_BUCKET } from "../../../../../lib/s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

function keyFromPublicUrl(url: string) {
  const u = new URL(url);
  return u.pathname.replace(/^\//, "");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tenantSlug = String(body.tenantSlug || "");
  const empreendimentoId = String(body.empreendimentoId || "");
  const anexoId = String(body.anexoId || "");

  if (!tenantSlug || !empreendimentoId || !anexoId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!emp) return NextResponse.json({ error: "empreendimento_not_found" }, { status: 404 });

  const anexo = await prisma.empreendimentoAnexo.findFirst({
    where: { id: anexoId, empreendimentoId },
    select: { id: true, url: true },
  });
  if (!anexo) return NextResponse.json({ error: "anexo_not_found" }, { status: 404 });

  // apaga do S3 (se existir)
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: keyFromPublicUrl(anexo.url),
      })
    );
  } catch {
    // MVP: se falhar no S3, ainda removemos do banco
  }

  await prisma.empreendimentoAnexo.delete({ where: { id: anexoId } });

  return NextResponse.json({ ok: true });
}
