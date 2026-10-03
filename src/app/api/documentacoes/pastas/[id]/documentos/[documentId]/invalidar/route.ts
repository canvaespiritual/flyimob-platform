import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { invalidateDocument } from "@/lib/documentacoes/documents.server";
import { failure, json } from "@/lib/documentacoes/http.server";
export async function POST(req: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try { const session = await documentSession(); sameOrigin(req); const { id, documentId } = await context.params; return json(await invalidateDocument(session, id, documentId, await req.json())); } catch (error) { return failure(error); }
}
