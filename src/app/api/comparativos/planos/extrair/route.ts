import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { documentationStorage } from "@/lib/documentacoes/storage.server";
import { extrairPlano } from "@/lib/comparativos/extracao.server";
import { ComparativoError, alertasPlano } from "@/lib/comparativos/plano";
import { failure, sameOrigin } from "@/lib/comparativos/access.server";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use");
  if (!auth.ok) return auth.response;
  let token: string | undefined;
  let itemId: string | undefined;
  try {
    sameOrigin(req);
    const body = await req.json(); itemId = String(body.itemId ?? "");
    if (!process.env.OPENAI_API_KEY) throw new ComparativoError(503, "A IA ainda não está configurada. Você pode preencher manualmente.");
    const item = await prisma.comparativoItem.findFirst({ where: { id: itemId, comparativo: { tenantId: auth.session.tenant.id, modoDirecionamento: true } }, include: { comparativo: true, tipologia: { include: { empreendimento: true } }, anexos: true } });
    if (!item) throw new ComparativoError(404, "Opção não encontrada.");
    const a = item.anexos[0];
    if (!a) throw new ComparativoError(400, "Anexe o plano primeiro.");
    token = randomUUID();
    const lease = new Date(Date.now() - 180_000);
    await prisma.$transaction(async tx => {
      await tx.comparativo.update({ where: { id: item.comparativoId }, data: { publicadoEm: null, revisao: { increment: 1 } } });
      const locked = await tx.comparativoItem.updateMany({ where: { id: item.id, revisao: item.revisao, OR: [{ estadoExtracao: { not: "PROCESSANDO" } }, { extracaoIniciadaEm: { lt: lease } }] }, data: { estadoExtracao: "PROCESSANDO", extracaoToken: token, extracaoIniciadaEm: new Date() } });
      if (!locked.count) throw new ComparativoError(409, "Já existe uma extração em andamento ou a opção foi alterada. Atualize a página.");
    });
    const file = await documentationStorage.get({ ...a, tenantId: item.comparativo.tenantId, folderId: item.comparativoId });
    const result = await extrairPlano(file.bytes, a.mimeType, a.nomeOriginal, { empreendimento: item.tipologia.empreendimento.name, cliente: item.comparativo.clienteNome });
    result.plano.alertas = alertasPlano(result.plano, item.tipologia.empreendimento.name, item.comparativo.clienteNome);
    const updated = await prisma.comparativoItem.updateMany({ where: { id: item.id, extracaoToken: token, revisao: item.revisao }, data: { estadoExtracao: "REVISAR", extracaoToken: null, planoRascunho: result.plano as unknown as Prisma.InputJsonValue,
      extracaoOriginal: { plano: result.plano, anexoId: a.id, nomeOriginal: a.nomeOriginal, checksum: a.checksum, modelo: result.model, requestId: result.requestId, extraidoEm: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
      revisao: { increment: 1 } } });
    if (!updated.count) throw new ComparativoError(409, "A opção mudou durante a leitura. Suas alterações foram preservadas; atualize a página.");
    return Response.json({ ok: true });
  } catch (e) {
    if (token && itemId) await prisma.comparativoItem.updateMany({ where: { id: itemId, extracaoToken: token }, data: { estadoExtracao: "ERRO", extracaoToken: null } }).catch(() => {});
    return failure(e);
  }
}
