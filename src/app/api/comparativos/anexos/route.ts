import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { prisma } from "@/lib/prisma";
import { documentationStorage } from "@/lib/documentacoes/storage.server";
import { fileMetadata, readUpload, validateFile, disposition } from "@/lib/documentacoes/file-policy";
import { conferirArquivo } from "@/lib/comparativos/extracao.server";
import { ComparativoError } from "@/lib/comparativos/plano";
import { failure, sameOrigin, isPublished } from "@/lib/comparativos/access.server";

export const runtime = "nodejs";
export const maxDuration = 180;
const metadataSelect = { id: true, titulo: true, nomeOriginal: true, itemId: true, escopo: true };
export async function POST(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  try {
    sameOrigin(req);
    const q = new URL(req.url).searchParams;
    const comparativoId = q.get("comparativoId") ?? "";
    const itemId = q.get("itemId");
    const slot = q.get("slot");
    if (!itemId && !["0", "1"].includes(slot ?? "")) throw new ComparativoError(400, "São permitidos até dois anexos gerais.");
    const c = await prisma.comparativo.findFirst({ where: { id: comparativoId, tenantId: auth.session.tenant.id, modoDirecionamento: true } });
    if (!c) throw new ComparativoError(404, "Comparativo não encontrado.");
    const item = itemId ? await prisma.comparativoItem.findFirst({ where: { id: itemId, comparativoId } }) : null;
    if (itemId && !item) throw new ComparativoError(404, "Opção não encontrada.");
    const meta = fileMetadata({ originalFileName: req.headers.get("x-file-name") ? decodeURIComponent(req.headers.get("x-file-name")!) : "", mimeType: req.headers.get("content-type"), fileSize: Number(req.headers.get("x-file-size")) });
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(meta.mimeType)) throw new ComparativoError(400, "Envie PDF, JPEG, PNG ou WebP.");
    const bytes = await readUpload(req, meta.fileSize);
    await conferirArquivo(bytes, meta.mimeType, itemId ? 10 : 50);
    const checksum = await validateFile(bytes, meta.mimeType, meta.fileSize);
    const id = randomUUID();
    const stored = { id, tenantId: c.tenantId, folderId: c.id, storageKey: `private/comparativos/${c.tenantId}/${c.id}/${id}`, mimeType: meta.mimeType, fileSize: BigInt(meta.fileSize), uploadedById: auth.session.user.id };
    await documentationStorage.put(stored, bytes, checksum);
    const escopo = itemId ? `item:${itemId}` : `credito:${slot}`;
    const titulo = (q.get("titulo") || (itemId ? "Plano de pagamento" : slot === "0" ? "Aprovação de crédito" : "Simulação Caixa")).slice(0, 200);
    const anexo = await prisma.$transaction(async tx => {
      const changed = await tx.comparativo.updateMany({ where: { id: c.id, tenantId: c.tenantId, revisao: c.revisao }, data: { publicadoEm: null, revisao: { increment: 1 } } });
      if (!changed.count) throw new ComparativoError(409, "O comparativo mudou durante o envio. Atualize e tente novamente.");
      await tx.comparativoAnexo.deleteMany({ where: { comparativoId: c.id, escopo } });
      const result = await tx.comparativoAnexo.create({ data: { id, comparativoId: c.id, itemId, escopo, titulo, nomeOriginal: meta.originalFileName, mimeType: meta.mimeType, fileSize: stored.fileSize, storageKey: stored.storageKey, checksum, uploadedById: stored.uploadedById }, select: metadataSelect });
      if (item) await tx.comparativoItem.update({ where: { id: item.id }, data: { planoRascunho: Prisma.DbNull, estadoExtracao: "ANEXADO", extracaoToken: null, extracaoIniciadaEm: null, revisao: { increment: 1 } } });
      return result;
    });
    return Response.json({ ok: true, anexo });
  } catch (e) { return failure(e); }
}
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const id = q.get("id") ?? "";
    const a = await prisma.comparativoAnexo.findUnique({ where: { id }, include: { comparativo: true, item: { select: { estadoExtracao: true } } } });
    if (!a) throw new ComparativoError(404, "Anexo não encontrado.");
    const slug = q.get("slug");
    const publicAccess = !!slug && slug === a.comparativo.slugPublico && a.comparativo.modoDirecionamento && isPublished(a.comparativo) && (!a.item || a.item.estadoExtracao === "APROVADO");
    if (!publicAccess) {
      const auth = await getPermissionApiSession("comparativos:use");
      if (!auth.ok) return auth.response;
      if (auth.session.tenant.id !== a.comparativo.tenantId) throw new ComparativoError(404, "Anexo não encontrado.");
    }
    const stored = await documentationStorage.get({ ...a, tenantId: a.comparativo.tenantId, folderId: a.comparativoId });
    return new Response(new Uint8Array(stored.bytes), { headers: { "Content-Type": a.mimeType, "Content-Disposition": disposition(a.nomeOriginal, false), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  } catch (e) { return failure(e); }
}
export async function DELETE(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  try {
    sameOrigin(req);
    const { id } = await req.json();
    await prisma.$transaction(async tx => {
      const a = await tx.comparativoAnexo.findFirst({ where: { id, comparativo: { tenantId: auth.session.tenant.id } } });
      if (!a) throw new ComparativoError(404, "Anexo não encontrado.");
      await tx.comparativo.update({ where: { id: a.comparativoId }, data: { publicadoEm: null, revisao: { increment: 1 } } });
      await tx.comparativoAnexo.delete({ where: { id: a.id } });
      if (a.itemId) await tx.comparativoItem.update({ where: { id: a.itemId }, data: { estadoExtracao: "MANUAL", extracaoToken: null, revisao: { increment: 1 } } });
    });
    return Response.json({ ok: true });
  } catch (e) { return failure(e); }
}
export async function PATCH(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use"); if (!auth.ok) return auth.response;
  try {
    sameOrigin(req);
    const body = await req.json();
    if (typeof body.titulo !== "string" || !body.titulo.trim() || body.titulo.length > 200) throw new ComparativoError(400, "Informe um título com até 200 caracteres.");
    await prisma.$transaction(async tx => {
      const a = await tx.comparativoAnexo.findFirst({ where: { id: String(body.id), comparativo: { tenantId: auth.session.tenant.id } } });
      if (!a) throw new ComparativoError(404, "Anexo não encontrado.");
      await tx.comparativo.update({ where: { id: a.comparativoId }, data: { publicadoEm: null, revisao: { increment: 1 } } });
      await tx.comparativoAnexo.update({ where: { id: a.id }, data: { titulo: body.titulo.trim() } });
    });
    return Response.json({ ok: true });
  } catch (e) { return failure(e); }
}
