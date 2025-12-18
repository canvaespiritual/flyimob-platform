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

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
const origin = host ? `${proto}://${host}` : new URL(req.url).origin;


  return Response.redirect(
  new URL(
    returnTo ? String(returnTo) : "/admin/construtoras",
    origin
  ),
  303
);



}
