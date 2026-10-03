import { documentSession, sameOrigin } from "@/lib/documentacoes/document-access.server";
import { uploadAuthorization, uploadDocument } from "@/lib/documentacoes/documents.server";
import { readUpload } from "@/lib/documentacoes/file-policy";
import { DocumentationError } from "@/lib/documentacoes/validation";
import { failure, json } from "@/lib/documentacoes/http.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function PUT(req: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const session = await documentSession(); sameOrigin(req); const { id, documentId } = await context.params;
    const authorization = await uploadAuthorization(session, id, documentId);
    if (req.headers.get("content-type") !== authorization.mimeType) throw new DocumentationError(400, "Formato do envio incompatível.");
    const bytes = await readUpload(req, authorization.fileSize);
    return json(await uploadDocument(session, id, documentId, bytes));
  } catch (error) { return failure(error); }
}
