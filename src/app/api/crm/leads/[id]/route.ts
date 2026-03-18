import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/authz.server";
import { LeadHeat, LeadOrigin } from "@prisma/client";

function numOrNull(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function originOrNull(v: any): LeadOrigin | null {
  if (v === null || v === undefined || v === "") return null;

  const raw = String(v).trim();
  const up = raw.toUpperCase();

  const allowed = new Set(Object.values(LeadOrigin));
  if (allowed.has(up as any)) return up as LeadOrigin;

  const map: Record<string, string> = {
    CAMPANHA: "ACAO_EXTERNA",
    CAMPANHA_TRAFEGO: "ACAO_EXTERNA",
    TRAFEGO: "ACAO_EXTERNA",
    ANUNCIO: "ACAO_EXTERNA",
    META: "ACAO_EXTERNA",
    GOOGLE: "ACAO_EXTERNA",
  };

  const mapped = map[up];
  if (mapped && allowed.has(mapped as any)) return mapped as LeadOrigin;

  return null;
}
function heatOrNull(v: any): LeadHeat | null {
  if (v === null || v === undefined || v === "") return null;

  const up = String(v).trim().toUpperCase();
  const allowed = new Set(Object.values(LeadHeat));

  if (allowed.has(up as LeadHeat)) return up as LeadHeat;

  return null;
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("crm:use");
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));

  const exists = await prisma.cRMLead.findFirst({
    where: { id, tenantId: s.tenant.id, ownerId: s.user.id },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  if (body?.contextoGeral && String(body.contextoGeral).length > 1500) {
    return NextResponse.json({ error: "Contexto geral excede 1500 caracteres." }, { status: 400 });
  }

  try {
    const lead = await prisma.cRMLead.update({
      where: { id },
      data: {
        nome: body?.nome !== undefined ? String(body.nome).trim() : undefined,
        telefone: body?.telefone !== undefined ? (body.telefone ? String(body.telefone) : null) : undefined,
        email: body?.email !== undefined ? (body.email ? String(body.email).toLowerCase() : null) : undefined,

        rendaBruta: body?.rendaBruta !== undefined ? numOrNull(body.rendaBruta) : undefined,
        entrada: body?.entrada !== undefined ? numOrNull(body.entrada) : undefined,
        fgts: body?.fgts !== undefined ? numOrNull(body.fgts) : undefined,

        dataNascimento: body?.dataNascimento !== undefined ? dateOrNull(body.dataNascimento) : undefined,

        origem: body?.origem !== undefined ? originOrNull(body.origem) : undefined,

        interesse: body?.interesse !== undefined ? (body.interesse ? String(body.interesse) : null) : undefined,
status: body?.status !== undefined ? body.status : undefined,
calorVenda: body?.calorVenda !== undefined ? heatOrNull(body.calorVenda) : undefined,
contextoGeral: body?.contextoGeral !== undefined ? (body.contextoGeral ? String(body.contextoGeral) : null) : undefined,
nextFollowUpAt: body?.nextFollowUpAt !== undefined ? dateOrNull(body.nextFollowUpAt) : undefined,
      },
    });

    return NextResponse.json({ ok: true, lead });
  } catch (err: any) {
    console.error("CRM PATCH /api/crm/leads/[id] error:", err);
    return NextResponse.json({ error: "Erro ao atualizar lead." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await requirePermission("crm:use");
  const { id } = await ctx.params;

  const exists = await prisma.cRMLead.findFirst({
    where: { id, tenantId: s.tenant.id, ownerId: s.user.id },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  await prisma.cRMLead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
