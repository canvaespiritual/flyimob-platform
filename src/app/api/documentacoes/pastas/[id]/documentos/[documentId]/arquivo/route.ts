import { documentSession } from "@/lib/documentacoes/document-access.server";
import { documentContent } from "@/lib/documentacoes/documents.server";
import { disposition } from "@/lib/documentacoes/file-policy";
import { supportsDocumentationPreview } from "@/lib/documentacoes/file-formats";
import { failure } from "@/lib/documentacoes/http.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const session = await documentSession(); const { id, documentId } = await context.params;
    const content = await documentContent(session, id, documentId);
    return new Response(new Uint8Array(content.bytes), { headers: {
      "Content-Type": content.mimeType, "Content-Length": String(content.bytes.byteLength),
      "Content-Disposition": disposition(content.originalFileName, new URL(req.url).searchParams.get("download") === "true" || !supportsDocumentationPreview(content.mimeType)),
      "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
      // Chromium's native PDF viewer needs no CSP sandbox. Uploaded files are
      // never executed by the server; nosniff and default-src block web scripts.
      "Content-Security-Policy": `${content.mimeType === "application/pdf" ? "" : "sandbox; "}default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`, "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) { return failure(error); }
}
