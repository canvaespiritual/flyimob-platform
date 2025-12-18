import { prisma } from "../../../../lib/prisma";

function txt(form: FormData, key: string) {
  const v = form.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function POST(req: Request) {
  const form = await req.formData();

  const tenantSlug = String(form.get("tenantSlug") || "flyimob");
  const id = String(form.get("id") || "").trim();
  const name = String(form.get("name") || "").trim();

  if (!id || !name) return new Response("id e name são obrigatórios", { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const current = await prisma.construtora.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, tenantId: true },
  });
  if (!current) return new Response("Construtora não encontrada", { status: 404 });

  // evita duplicidade no mesmo tenant
  const conflito = await prisma.construtora.findFirst({
    where: { tenantId: tenant.id, name, NOT: { id } },
    select: { id: true },
  });
  if (conflito) return new Response("Já existe construtora com esse nome", { status: 409 });

  await prisma.construtora.update({
    where: { id },
    data: {
      name,
      website: txt(form, "website"),
      email: txt(form, "email"),
      telefone: txt(form, "telefone"),
      endereco: txt(form, "endereco"),
      responsavelComercial: txt(form, "responsavelComercial"),
      whatsappComercial: txt(form, "whatsappComercial"),
    },
  });

   const proto = req.headers.get("x-forwarded-proto") ?? "http";
const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
const origin = host ? `${proto}://${host}` : new URL(req.url).origin;


return Response.redirect(
  new URL(`/admin/construtoras/${id}/edit`, origin),
  303
);


}
