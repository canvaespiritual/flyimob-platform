import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  const form = await req.formData();

  const tenantSlug = String(form.get("tenantSlug") || "").trim();

if (!tenantSlug) {
  return new Response("Tenant obrigatório", { status: 400 });
}
  const empreendimentoId = String(form.get("empreendimentoId") || "").trim();
  const tipologiaId = String(form.get("tipologiaId") || "").trim();

  if (!empreendimentoId || !tipologiaId) {
    return new Response("empreendimentoId e tipologiaId são obrigatórios", { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const emp = await prisma.empreendimento.findFirst({
    where: { id: empreendimentoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!emp) return new Response("Empreendimento não encontrado", { status: 404 });

  const tip = await prisma.empreendimentoTipologia.findFirst({
    where: { id: tipologiaId, empreendimentoId: emp.id },
    select: { id: true },
  });
  if (!tip) return new Response("Tipologia não encontrada", { status: 404 });

  await prisma.empreendimentoTipologia.delete({ where: { id: tipologiaId } });

  return Response.redirect(new URL(`/admin/empreendimentos/${emp.id}/tipologias`, req.url), 303);
}
