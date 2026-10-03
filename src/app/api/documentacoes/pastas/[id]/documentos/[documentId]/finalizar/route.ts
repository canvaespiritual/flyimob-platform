import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { finalizeUpload } from "@/lib/documentacoes/documents.server";
import { failure, json } from "@/lib/documentacoes/http.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try { const session = await documentSession(); sameOrigin(req); const { id, documentId } = await context.params; return json(await finalizeUpload(session, id, documentId, await req.json())); } catch (error) { return failure(error); }
}
