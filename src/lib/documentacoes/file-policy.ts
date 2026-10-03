import { createHash } from "node:crypto";
import { DocumentationError, integer, text } from "./validation";

import { MAX_DOCUMENT_BYTES, DOCUMENT_FORMATS, DOCUMENT_FORMAT_ERROR, documentationMimeType } from "./file-formats";
export { MAX_DOCUMENT_BYTES } from "./file-formats";
export const UPLOAD_WINDOW_MS = 30 * 60 * 1000;
export function safeFileName(value: unknown) {
  const raw = text(value, "Nome do arquivo", true, 200)!;
  if (/[\x00-\x1f\x7f]/.test(raw)) throw new DocumentationError(400, "Nome de arquivo inválido.");
  const name = raw.replaceAll("\\", "/").split("/").pop()!.normalize("NFC").replace(/[<>:"|?*]/g, "_").trim();
  if (!name || name === "." || name === "..") throw new DocumentationError(400, "Nome de arquivo inválido.");
  return name;
}
export function fileMetadata(value: { originalFileName?: unknown; mimeType?: unknown; fileSize?: unknown }) {
  const originalFileName = safeFileName(value.originalFileName);
  const declaredType = text(value.mimeType, "Formato", false, 100) ?? "";
  const mimeType = documentationMimeType(originalFileName, declaredType);
  if (!mimeType) throw new DocumentationError(400, DOCUMENT_FORMAT_ERROR);
  const fileSize = integer(value.fileSize, "Tamanho", Number.MAX_SAFE_INTEGER);
  if (fileSize < 1 || fileSize > MAX_DOCUMENT_BYTES) throw new DocumentationError(400, "O arquivo deve ter até 15 MB e não pode estar vazio.");
  return { originalFileName, mimeType, fileSize };
}
export function disposition(name: string, download: boolean) {
  const safe = safeFileName(name);
  const ascii = safe.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
export async function validateFile(bytes: Uint8Array, mimeType: string, expectedSize: number) {
  if (bytes.byteLength !== expectedSize || !bytes.byteLength || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentationError(400, "Tamanho do arquivo não corresponde ao upload autorizado.");
  if (!DOCUMENT_FORMATS.some(format => format.mime === mimeType)) throw new DocumentationError(400, DOCUMENT_FORMAT_ERROR);
  // Only transport integrity is checked; uploaded content is never interpreted.
  return createHash("sha256").update(bytes).digest("hex");
}
export async function readUpload(req: Request, size: number) {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) !== size) throw new DocumentationError(400, "Tamanho do envio incompatível.");
  if (!req.body) throw new DocumentationError(400, "Arquivo ausente.");
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; count += value.byteLength; if (count > size || count > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new DocumentationError(413, "Arquivo acima do limite autorizado."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  if (count !== size) throw new DocumentationError(400, "Envio incompleto.");
  return Buffer.concat(chunks, count);
}
