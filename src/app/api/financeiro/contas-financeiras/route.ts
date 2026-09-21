import { FinancialAccountType } from "@prisma/client";
import { getFinanceApiSession } from "@/lib/financeiro/access.server";
import { writeFinancialAudit } from "@/lib/financeiro/audit.server";
import { prisma } from "@/lib/prisma";

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} é obrigatório.`);
  if (value.trim().length > 160) throw new Error(`${label} deve ter no máximo 160 caracteres.`);
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength = 300) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} inválido.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${label} deve ter no máximo ${maxLength} caracteres.`);
  return trimmed || null;
}

function accountFields(body: Record<string, unknown>) {
  const type = body.type;
  if (typeof type !== "string" || !Object.values(FinancialAccountType).includes(type as FinancialAccountType)) {
    throw new Error("Tipo de conta inválido.");
  }
  if (typeof body.active !== "boolean") throw new Error("Status da conta inválido.");
  return {
    name: requiredText(body.name, "Nome"),
    type: type as FinancialAccountType,
    bankName: optionalText(body.bankName, "Banco"),
    agency: optionalText(body.agency, "Agência"),
    account: optionalText(body.account, "Conta"),
    pixType: optionalText(body.pixType, "Tipo de PIX"),
    pixKey: optionalText(body.pixKey, "Chave PIX"),
    notes: optionalText(body.notes, "Observações", 2000),
    active: body.active,
  };
}

function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Erro ao salvar conta financeira." }, { status: 400 });
}

export async function POST(req: Request) {
  const auth = await getFinanceApiSession();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const fields = accountFields(body);
    const account = await prisma.financialAccount.create({ data: { ...fields, tenantId: auth.session.tenant.id } });
    await writeFinancialAudit({ tenantId: auth.session.tenant.id, entityType: "FinancialAccount", entityId: account.id,
      action: "CREATE", userId: auth.session.user.id, afterData: account });
    return Response.json({ ok: true, account });
  } catch (error) { return failure(error); }
}

export async function PUT(req: Request) {
  const auth = await getFinanceApiSession();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const id = requiredText(body.id, "Conta");
    const tenantId = auth.session.tenant.id;
    const existing = await prisma.financialAccount.findFirst({ where: { id, tenantId } });
    if (!existing) return Response.json({ error: "Conta financeira não encontrada." }, { status: 404 });
    const fields = accountFields(body);
    await prisma.financialAccount.updateMany({ where: { id, tenantId }, data: fields });
    const account = await prisma.financialAccount.findFirstOrThrow({ where: { id, tenantId } });
    await writeFinancialAudit({ tenantId, entityType: "FinancialAccount", entityId: id,
      action: "UPDATE", userId: auth.session.user.id, beforeData: existing, afterData: account });
    return Response.json({ ok: true, account });
  } catch (error) { return failure(error); }
}

export async function PATCH(req: Request) {
  const auth = await getFinanceApiSession();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const id = requiredText(body.id, "Conta");
    if (typeof body.active !== "boolean") throw new Error("Status da conta inválido.");
    const tenantId = auth.session.tenant.id;
    const existing = await prisma.financialAccount.findFirst({ where: { id, tenantId } });
    if (!existing) return Response.json({ error: "Conta financeira não encontrada." }, { status: 404 });
    await prisma.financialAccount.updateMany({ where: { id, tenantId }, data: { active: body.active } });
    await writeFinancialAudit({ tenantId, entityType: "FinancialAccount", entityId: id,
      action: "STATUS_CHANGE", userId: auth.session.user.id,
      beforeData: { active: existing.active }, afterData: { active: body.active } });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
