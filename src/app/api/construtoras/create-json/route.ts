import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const tenantSlug = String(body.tenantSlug || "flyimob");
  const name = String(body.name || "").trim();

  if (!name) {
    return new Response("Nome obrigatório", { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  // 🔒 padroniza nome para evitar duplicidade por espaço/case
  const normalizedName = name.replace(/\s+/g, " ").trim();

  // ✅ se já existir, devolve a existente (não dá erro)
  const existing = await prisma.construtora.findFirst({
    where: { tenantId: tenant.id, name: normalizedName },
    select: { id: true, name: true },
  });

  if (existing) {
    return Response.json(existing);
  }

  const created = await prisma.construtora.create({
    data: {
      tenantId: tenant.id,
      name: normalizedName,
      responsavelComercial: body.responsavelComercial || null,
      whatsappComercial: body.whatsappComercial || null,
    },
    select: { id: true, name: true },
  });

  return Response.json(created);
}
