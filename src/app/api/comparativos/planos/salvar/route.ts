import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { ComparativoError, validarPlano, camposLegados } from "@/lib/comparativos/plano";
import { failure, sameOrigin } from "@/lib/comparativos/access.server";
export async function POST(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use"); if (!auth.ok) return auth.response;
  try {
    sameOrigin(req);
    const body = await req.json();
    const plano = validarPlano(body.plano);
    const item = await prisma.comparativoItem.findFirst({ where: { id: String(body.itemId), comparativo: { tenantId: auth.session.tenant.id, modoDirecionamento: true } } });
    if (!item) throw new ComparativoError(404, "Opção não encontrada.");
    if (!Number.isInteger(body.revisao)) throw new ComparativoError(400, "Revisão inválida.");
    const approved = body.aprovar === true;
    await prisma.$transaction(async tx => {
      await tx.comparativo.update({ where: { id: item.comparativoId }, data: { publicadoEm: null, revisao: { increment: 1 } } });
      const updated = await tx.comparativoItem.updateMany({ where: { id: item.id, revisao: body.revisao }, data: {
        planoRascunho: plano as unknown as Prisma.InputJsonValue, estadoExtracao: approved ? "APROVADO" : "REVISAR", extracaoToken: null, revisao: { increment: 1 },
        ...(approved ? { planoPagamento: plano as unknown as Prisma.InputJsonValue, ...camposLegados(plano) } : {}),
      } });
      if (!updated.count) throw new ComparativoError(409, "A proposta mudou em outra sessão. Atualize antes de salvar.");
    });
    return Response.json({ ok: true });
  } catch (e) { return failure(e); }
}
