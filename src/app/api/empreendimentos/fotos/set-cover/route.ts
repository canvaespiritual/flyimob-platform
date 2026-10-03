import { getPermissionApiSession } from "@/lib/api-access.server";
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function POST(req: Request) {
  const auth = await getPermissionApiSession("data:manage");
  if (!auth.ok) return auth.response;
  const tenant = auth.session.tenant;
  const body = await req.json().catch(() => ({}));
  const empreendimentoId = String(body.empreendimentoId || "");
  const fotoId = String(body.fotoId || "");

  if (!empreendimentoId || !fotoId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

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
