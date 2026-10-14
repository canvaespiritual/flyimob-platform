import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { ComparativoError, validarCredito } from "@/lib/comparativos/plano";
import { failure, sameOrigin } from "@/lib/comparativos/access.server";
export async function POST(req: Request) {
  const auth = await getPermissionApiSession("comparativos:use"); if (!auth.ok) return auth.response;
  try {
    sameOrigin(req);
    const body = await req.json();
    if (!Number.isInteger(body.revisao) || body.revisao < 0) throw new ComparativoError(400, "Revisão inválida. Atualize o comparativo.");
    const resumoCredito = validarCredito(body.resumoCredito);
    const result = await prisma.comparativo.updateMany({ where: { id: String(body.id), tenantId: auth.session.tenant.id, modoDirecionamento: true, revisao: body.revisao }, data: { resumoCredito: resumoCredito as unknown as Prisma.InputJsonValue, publicadoEm: null, revisao: { increment: 1 } } });
    if (!result.count) throw new ComparativoError(409, "O comparativo mudou. Atualize antes de salvar o crédito.");
    return Response.json({ ok: true });
  } catch (e) { return failure(e); }
}
