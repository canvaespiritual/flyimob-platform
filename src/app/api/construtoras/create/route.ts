import { safeReturnTo } from "@/lib/auth-policy";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { prisma } from "../../../../lib/prisma";

function txt(form: FormData, key: string) {
  const v = form.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function POST(req: Request) {
  const auth = await getPermissionApiSession("data:manage");
  if (!auth.ok) return auth.response;
  const tenant = auth.session.tenant;
  const form = await req.formData();
  const name = String(form.get("name") || "").trim();

  if (!name) {
    return new Response("Dados inválidos", { status: 400 });
  }

  // ✅ trava duplicidade no mesmo tenant (mensagem limpa)
  const exists = await prisma.construtora.findFirst({
    where: { tenantId: tenant.id, name },
    select: { id: true },
  });
  if (exists) {
    return new Response("Já existe construtora com esse nome", { status: 409 });
  }

  await prisma.construtora.create({
    data: {
      tenantId: tenant.id,
      name,

      // ✅ campos opcionais (se vierem do form)
      website: txt(form, "website"),
      email: txt(form, "email"),
      telefone: txt(form, "telefone"),
      endereco: txt(form, "endereco"),
      responsavelComercial: txt(form, "responsavelComercial"),
      whatsappComercial: txt(form, "whatsappComercial"),

      // ✅ novo campo
      observacao: txt(form, "observacao"),
    },
  });

  const returnTo = form.get("returnTo");

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;

  return Response.redirect(
    new URL(safeReturnTo(returnTo, "/admin/construtoras"), origin),
    303
  );
}
