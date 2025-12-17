import { prisma } from "../../../../lib/prisma";


export async function POST(req: Request) {
  const form = await req.formData();
  const tenantSlug = String(form.get("tenantSlug") || "");
  const name = String(form.get("name") || "").trim();

  if (!tenantSlug || !name) {
    return new Response("Dados inválidos", { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  await prisma.construtora.create({
    data: { tenantId: tenant.id, name },
  });

 const returnTo = form.get("returnTo");

return Response.redirect(
  new URL(
    returnTo ? String(returnTo) : "/admin/construtoras",
    req.url
  ),
  303
);

}
