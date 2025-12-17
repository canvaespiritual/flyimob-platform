import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

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
    select: { id: true },
  });
  if (!foto) return NextResponse.json({ error: "foto_not_found" }, { status: 404 });

  await prisma.empreendimentoFoto.updateMany({
    where: { empreendimentoId },
    data: { isCover: false },
  });

  await prisma.empreendimentoFoto.update({
    where: { id: fotoId },
    data: { isCover: true },
  });

  return NextResponse.json({ ok: true });
}
