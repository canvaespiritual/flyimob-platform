import { getPermissionApiSession } from "@/lib/api-access.server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  const auth = await getPermissionApiSession("data:manage");
  if (!auth.ok) return auth.response;
  const tenant = auth.session.tenant;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();

  if (!name) {
    return new Response("Nome obrigatório", { status: 400 });
  }

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
