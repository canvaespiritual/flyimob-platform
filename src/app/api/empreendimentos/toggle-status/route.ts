import { prisma } from "../../../../lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const form = await req.formData();
  const id = String(form.get("id") || "");
  const tenantSlug = String(form.get("tenantSlug") || "flyimob");

  if (!id) return new Response("ID obrigatório", { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id, tenantId: tenant.id },
    select: { status: true },
  });

  if (!emp) return new Response("Empreendimento não encontrado", { status: 404 });

  const nextStatus = emp.status === "ATIVO" ? "INATIVO" : "ATIVO";

  await prisma.empreendimento.update({
    where: { id },
    data: {
      status: nextStatus,
      publicado: nextStatus === "ATIVO",
    },
  });

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = `${proto}://${host}`;

  return NextResponse.redirect(
    new URL("/admin/empreendimentos", origin),
    303
  );
}
