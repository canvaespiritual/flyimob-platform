import { GetPublicAccessBlockCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, S3_BUCKET } from "@/lib/s3";
import { DocumentationError } from "./validation";
import { MAX_DOCUMENT_BYTES } from "./file-policy";

export type StoredDocument = { id: string; tenantId: string; folderId: string; storageKey: string; mimeType: string; fileSize: bigint; uploadedById: string };
export interface DocumentationStorage {
  ready(): Promise<void>;
  put(document: StoredDocument, bytes: Uint8Array, checksum: string): Promise<void>;
  get(document: StoredDocument): Promise<{ bytes: Uint8Array; checksum?: string }>;
}
function bucket() {
  const value = process.env.AWS_S3_DOCUMENTATION_BUCKET?.trim();
  if (!value || value === S3_BUCKET || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) throw new DocumentationError(503, "Storage documental privado ainda não configurado.");
  return value;
}
export const documentationStorage: DocumentationStorage = {
  async ready() {
    const Bucket = bucket();
    try {
      const result = await s3.send(new GetPublicAccessBlockCommand({ Bucket })); const block = result.PublicAccessBlockConfiguration;
      if (!block?.BlockPublicAcls || !block.IgnorePublicAcls || !block.BlockPublicPolicy || !block.RestrictPublicBuckets) throw new Error("public access not blocked");
    } catch { throw new DocumentationError(503, "Não foi possível comprovar a proteção do storage documental. Contate o administrador."); }
  },
  async put(document, bytes, checksum) {
    await this.ready();
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: document.storageKey, Body: bytes, ContentLength: bytes.byteLength,
        ContentType: document.mimeType, CacheControl: "private, no-store", ServerSideEncryption: "AES256", IfNoneMatch: "*",
        Metadata: { authorization: document.id, tenant: document.tenantId, folder: document.folderId, uploader: document.uploadedById, sha256: checksum } }));
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && ["PreconditionFailed", "ConditionalRequestConflict"].includes(String(error.name))) throw new DocumentationError(409, "Este upload já foi recebido. Tente finalizar ou atualize a pasta.");
      throw new DocumentationError(502, "Não foi possível enviar o arquivo ao storage privado. Tente novamente.");
    }
  },
  async get(document) {
    await this.ready();
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: document.storageKey }));
      if (head.ContentLength !== Number(document.fileSize) || head.ContentLength > MAX_DOCUMENT_BYTES || head.ContentType !== document.mimeType || head.Metadata?.authorization !== document.id || head.Metadata?.tenant !== document.tenantId || head.Metadata?.folder !== document.folderId || head.Metadata?.uploader !== document.uploadedById || !head.ETag || !/^[a-f0-9]{64}$/.test(head.Metadata?.sha256 ?? "")) throw new DocumentationError(409, "O arquivo armazenado não corresponde ao upload autorizado.");
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: document.storageKey, IfMatch: head.ETag }));
      if (!object.Body || object.ContentLength !== head.ContentLength || object.ContentType !== head.ContentType) throw new DocumentationError(409, "Arquivo incompleto ou alterado no storage.");
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) { size += chunk.byteLength; if (size > Number(document.fileSize) || size > MAX_DOCUMENT_BYTES) throw new DocumentationError(409, "Arquivo incompatível com a autorização."); chunks.push(chunk); }
      if (size !== Number(document.fileSize)) throw new DocumentationError(409, "Arquivo incompleto.");
      return { bytes: Buffer.concat(chunks, size), checksum: head.Metadata.sha256 };
    } catch (error) {
      if (error instanceof DocumentationError) throw error;
      throw new DocumentationError(502, "Arquivo indisponível no storage privado. Tente novamente.");
    }
  },
};
