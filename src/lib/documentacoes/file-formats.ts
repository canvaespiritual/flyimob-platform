// Shared by the browser and server. Storage never decodes these formats.
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_FORMATS = [
  { mime: "application/pdf", extensions: ["pdf"], aliases: [], preview: true },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], aliases: ["image/jpg", "image/pjpeg"], preview: true },
  { mime: "image/png", extensions: ["png"], aliases: ["image/x-png"], preview: true },
  { mime: "image/webp", extensions: ["webp"], aliases: [], preview: true },
  { mime: "image/heic", extensions: ["heic"], aliases: ["image/heic-sequence"], preview: false },
  { mime: "image/heif", extensions: ["heif"], aliases: ["image/heif-sequence"], preview: false },
  { mime: "image/gif", extensions: ["gif"], aliases: [], preview: true },
  { mime: "image/bmp", extensions: ["bmp"], aliases: ["image/x-ms-bmp"], preview: true },
  { mime: "image/tiff", extensions: ["tif", "tiff"], aliases: ["image/x-tiff"], preview: false },
];
export const DOCUMENT_FILE_ACCEPT = DOCUMENT_FORMATS.flatMap(format => format.extensions.map(extension => `.${extension}`)).join(",");
export const DOCUMENT_FORMAT_ERROR = "Formato não permitido. Use PDF ou imagens JPG, JPEG, PNG, WEBP, HEIC, HEIF, GIF, BMP ou TIFF. Vídeos e executáveis não são aceitos.";

export function documentationMimeType(fileName: string, declaredType: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const format = DOCUMENT_FORMATS.find(format => format.extensions.includes(extension ?? ""));
  if (!format) return undefined;
  const mime = declaredType.trim().toLowerCase();
  // Phones/browsers may provide no MIME or a generic binary MIME for HEIC/HEIF.
  if (!mime || mime === "application/octet-stream" || mime === format.mime || format.aliases.includes(mime)) return format.mime;
  return undefined;
}
export function supportsDocumentationPreview(mimeType: string) {
  return DOCUMENT_FORMATS.some(format => format.mime === mimeType && format.preview);
}
