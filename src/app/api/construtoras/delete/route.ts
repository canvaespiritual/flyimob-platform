import { headers } from "next/headers";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  const form = await req.formData();

  const tenantSlug = String(form.get("tenantSlug") || "flyimob");
  const id = String(form.get("id") || "").trim();

  if (!id) return new Response("id obrigatório", { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const construtora = await prisma.construtora.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!construtora) return new Response("Construtora não encontrada", { status: 404 });

  const total = await prisma.empreendimento.count({
    where: { construtoraId: id },
  });

  if (total > 0) {
    return new Response("Construtora vinculada a empreendimentos. Não pode excluir.", { status: 409 });
  }

  await prisma.construtora.delete({ where: { id } });

   const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;

  return Response.redirect(
    new URL("/admin/construtoras", origin),
    303
  );

}
