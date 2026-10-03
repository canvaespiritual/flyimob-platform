import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { hashPassword } from "@/lib/auth.server";
import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { pagination } from "@/lib/documentacoes/queries.server";
import { text, DocumentationError } from "@/lib/documentacoes/validation";

export async function GET(req: Request) {
  try {
    const session = await documentationApiSession(); const params = new URL(req.url).searchParams; const paging = pagination(params);
    const active = params.get("active");
    if (active && !["true", "false"].includes(active)) throw new DocumentationError(400, "Filtro inválido.");
    const where = { tenantId: session.tenant.id, role: "CORRESPONDENTE" as const, ...(active ? { isActive: active === "true" } : {}), name: { contains: text(params.get("q"), "Busca") ?? "", mode: "insensitive" as const } };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({ where, select: { id: true, name: true, email: true, isActive: true, createdAt: true, updatedAt: true, _count: { select: { documentationCorrespondentFolders: { where: { tenantId: session.tenant.id } } } } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: paging.skip, take: paging.take }),
      prisma.user.count({ where }),
    ]);
    return json({ items, total, page: paging.page, pageSize: paging.take });
  } catch (error) { return failure(error); }
}

// Credential management stays OWNER-only.
export async function POST(req: Request) {
  const auth = await getPermissionApiSession("users:invite");
  if (!auth.ok) return auth.response;
  if (auth.session.user.role !== "OWNER" || auth.session.tenant.isPlatform) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (body?.confirmPassword !== undefined && body.confirmPassword !== password) return Response.json({ error: "As senhas não correspondem." }, { status: 400 });
  if (name.length < 2 || name.length > 160 || email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256) {
    return Response.json({ error: "Nome, e-mail e senha inicial (8 a 256 caracteres) válidos são obrigatórios." }, { status: 400 });
  }
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { tenantId: auth.session.tenant.id, name, email, passwordHash, role: "CORRESPONDENTE" },
      select: { id: true, name: true, email: true, role: true, tenantId: true, isActive: true },
    });
    return Response.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "Já existe usuário com esse e-mail." }, { status: 409 });
    }
    // Do not log request bodies, credentials or database error parameters.
    return Response.json({ error: "Não foi possível criar o correspondente." }, { status: 500 });
  }
}
