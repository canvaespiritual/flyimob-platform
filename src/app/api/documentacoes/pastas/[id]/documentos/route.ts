import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { beginUpload, listDocuments } from "@/lib/documentacoes/documents.server";
import { failure, json } from "@/lib/documentacoes/http.server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, context: Context) {
  try { const session = await documentSession(); const { id } = await context.params; return json(await listDocuments(session, id, new URL(req.url).searchParams)); } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: Context) {
  try { const session = await documentSession(); sameOrigin(req); const { id } = await context.params; return json(await beginUpload(session, id, await req.json()), 201); } catch (error) { return failure(error); }
}
