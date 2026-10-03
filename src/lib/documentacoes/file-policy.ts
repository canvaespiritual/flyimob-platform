import { createHash } from "node:crypto";
import { PDFDocument, PDFDict, PDFArray, PDFStream, PDFName, PDFObject, PDFInvalidObject } from "@cantoo/pdf-lib";
import sharp from "sharp";
import { DocumentationError, integer, text } from "./validation";

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const UPLOAD_WINDOW_MS = 30 * 60 * 1000;
const formats: Record<string, string[]> = { "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"] };
export function safeFileName(value: unknown) {
  const raw = text(value, "Nome do arquivo", true, 200)!;
  if (/[\x00-\x1f\x7f]/.test(raw)) throw new DocumentationError(400, "Nome de arquivo inválido.");
  const name = raw.replaceAll("\\", "/").split("/").pop()!.normalize("NFC").replace(/[<>:"|?*]/g, "_").trim();
  if (!name || name === "." || name === "..") throw new DocumentationError(400, "Nome de arquivo inválido.");
  return name;
}
export function fileMetadata(value: { originalFileName?: unknown; mimeType?: unknown; fileSize?: unknown }) {
  const originalFileName = safeFileName(value.originalFileName);
  const mimeType = text(value.mimeType, "Formato", true, 100)!;
  if (!formats[mimeType]?.includes(originalFileName.split(".").pop()!.toLowerCase())) throw new DocumentationError(400, "Formato não permitido. Use PDF, JPEG ou PNG com extensão correspondente.");
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
  const buffer = Buffer.from(bytes);
  try {
    if (mimeType === "application/pdf") {
      if (!buffer.subarray(0, 8).toString("ascii").startsWith("%PDF-") || !/%%EOF\s*$/.test(buffer.subarray(-1024).toString("latin1"))) throw new Error("pdf signature");
      // Permissions encryption is not an opening password. The first parse
      // discovers encryption; encrypted object streams require the second pass.
      const original = await PDFDocument.load(buffer, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      const pdf = original.isEncrypted
        ? await PDFDocument.load(buffer, { password: "", ignoreEncryption: false, throwOnInvalidObject: false, updateMetadata: false })
        : original;
      if (original.isEncrypted && !pdf.context.isDecrypted) throw new Error("pdf not decrypted");
      for (const [ref, object] of original.context.enumerateIndirectObjects()) {
        if (object instanceof PDFInvalidObject && (!original.isEncrypted || pdf.context.lookup(ref) instanceof PDFInvalidObject || !pdf.context.lookup(ref))) throw new Error("pdf invalid object");
      }
      for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFInvalidObject)) continue;
        const source = original.context.lookup(ref);
        // Cross-reference streams are deliberately unencrypted in the PDF spec.
        // The decrypting parser can misread their trailer /ID as ciphertext.
        // Permit only a strictly parsed original XRef stream, inspected below;
        // never skip invalid page, action, form or embedded-content objects.
        if (!(source instanceof PDFStream) || source.dict.get(PDFName.of("Type")) !== PDFName.of("XRef")) throw new Error("pdf invalid object");
      }
      if (!pdf.getPageCount() || pdf.getPageCount() > 2000) throw new Error("pdf pages");
      const visited = new Set<PDFObject>();
      const forbidden = new Set(["JS", "JavaScript", "AA", "OpenAction", "Launch", "EmbeddedFiles", "EmbeddedFile", "RichMedia", "XFA"]);
      function inspect(object: PDFObject) {
        if (visited.has(object)) return; visited.add(object);
        if (object instanceof PDFName && forbidden.has(object.decodeText())) throw new Error("pdf active content");
        if (object instanceof PDFStream) inspect(object.dict);
        if (object instanceof PDFDict) for (const [key, value] of object.entries()) { if (forbidden.has(key.decodeText())) throw new Error("pdf active content"); inspect(value); }
        if (object instanceof PDFArray) for (let index = 0; index < object.size(); index++) inspect(object.get(index));
      }
      for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object);
      if (original.isEncrypted) for (const [, object] of original.context.enumerateIndirectObjects()) inspect(object);
    } else {
      if (mimeType === "image/png") {
        if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || !buffer.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))) throw new Error("png signature");
      } else if (mimeType === "image/jpeg") {
        if (!buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || !buffer.subarray(-2).equals(Buffer.from([255, 217]))) throw new Error("jpeg signature");
      } else throw new Error("unsupported mime");
      const image = sharp(buffer, { limitInputPixels: 20000000, failOn: "warning" });
      const metadata = await image.metadata();
      if (metadata.format !== (mimeType === "image/png" ? "png" : "jpeg") || (metadata.pages ?? 1) > 1) throw new Error("image format");
      await image.stats();
    }
  } catch { throw new DocumentationError(400, "Arquivo inválido, danificado ou com conteúdo não permitido. PDFs que exigem senha de abertura ou contêm ações/anexos não são aceitos."); }
  return createHash("sha256").update(buffer).digest("hex");
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
