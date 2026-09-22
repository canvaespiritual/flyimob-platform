import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import { createGroupedInvoice } from "@/lib/financeiro/grouped-invoicing.server";
import { parsePositiveMoney } from "@/lib/financeiro/receipt-remittances.server";

export async function POST(req: Request) {
  const auth = await getFinanceApiSession();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const issuedAt = new Date(String(body.issuedAt ?? ""));
    if (Number.isNaN(issuedAt.getTime())) throw new Error("Data de emissão inválida.");
    const competenceYear = Number(body.competenceYear);
    const competenceMonth = Number(body.competenceMonth);
    if (!Number.isInteger(competenceYear) || competenceYear < 2000 || competenceYear > 2100 || !Number.isInteger(competenceMonth) || competenceMonth < 1 || competenceMonth > 12) {
      throw new Error("Competência inválida.");
    }
    if (!Array.isArray(body.allocations)) throw new Error("Selecione as etapas.");
    const number = String(body.number ?? "").trim().slice(0, 100);
    if (!number) throw new Error("Número da NF obrigatório.");
    const id = await createGroupedInvoice({
      tenantId: auth.session.tenant.id, userId: auth.session.user.id,
      construtoraId: String(body.construtoraId ?? "").trim(),
      number,
      issuedAt, competenceYear, competenceMonth,
      grossAmount: parsePositiveMoney(body.grossAmount, "Bruto da NF"),
      notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
      allocations: body.allocations.map((item: { stageId?: unknown; amount?: unknown }) => ({
        stageId: String(item.stageId ?? "").trim(), amount: parsePositiveMoney(item.amount, "Parcela"),
      })),
    });
    return Response.json({ ok: true, id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar NF agrupada." }, { status: 400 });
  }
}
