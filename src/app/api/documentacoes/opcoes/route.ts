import { prisma } from "@/lib/prisma";
import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { DocumentationError, text } from "@/lib/documentacoes/validation";
export async function GET(req: Request) {
  try {
    const session = await documentationApiSession(); const params = new URL(req.url).searchParams;
    const tenantId = session.tenant.id; const q = text(params.get("q"), "Busca") ?? "";
    const kind = params.get("kind"); const common = { tenantId }; const search = { contains: q, mode: "insensitive" as const };
    if (kind === "broker" || kind === "correspondent") return json({ items: await prisma.user.findMany({ where: { ...common, isActive: true, role: kind === "broker" ? "BROKER" : "CORRESPONDENTE", name: search }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 30 }) });
    if (kind === "crm") return json({ items: (await prisma.cRMLead.findMany({ where: { ...common, nome: search }, select: { id: true, nome: true, telefone: true, email: true }, take: 30, orderBy: { nome: "asc" } })).map(row => ({ id: row.id, name: row.nome, phone: row.telefone, email: row.email })) });
    if (kind === "builder") return json({ items: (await prisma.construtora.findMany({ where: { ...common, name: search }, select: { id: true, name: true }, take: 30, orderBy: { name: "asc" } })).map(row => ({ id: row.id, name: row.name })) });
    if (kind === "property") return json({ items: (await prisma.empreendimento.findMany({ where: { ...common, name: search, ...(params.get("builderId") ? { construtoraId: params.get("builderId") } : {}) }, select: { id: true, name: true }, take: 30, orderBy: { name: "asc" } })).map(row => ({ id: row.id, name: row.name })) });
    throw new DocumentationError(400, "Opção inválida.");
  } catch (error) { return failure(error); }
}
