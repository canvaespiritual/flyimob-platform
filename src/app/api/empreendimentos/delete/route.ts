import { prisma } from "../../../../lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const form = await req.formData();
  const id = String(form.get("id") || "");
  const tenantSlug = String(form.get("tenantSlug") || "flyimob");

  if (!id) return new Response("ID obrigatório", { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.empreendimentoTipologia.deleteMany({ where: { empreendimentoId: id } });
    await tx.empreendimentoFoto.deleteMany({ where: { empreendimentoId: id } });
    await tx.empreendimentoAnexo.deleteMany({ where: { empreendimentoId: id } });
    await tx.empreendimento.delete({ where: { id } });
  });

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = `${proto}://${host}`;

  return NextResponse.redirect(
    new URL("/admin/empreendimentos", origin),
    303
  );
}
