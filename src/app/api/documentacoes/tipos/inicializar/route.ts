import { prisma } from "@/lib/prisma";
import { documentationApiSession, failure, json } from "@/lib/documentacoes/http.server";
import { ensureCatalog } from "@/lib/documentacoes/folders.server";
export async function POST() {
  try { const session = await documentationApiSession(true); return json(await prisma.$transaction(tx => ensureCatalog(tx, session.tenant.id))); } catch (error) { return failure(error); }
}
