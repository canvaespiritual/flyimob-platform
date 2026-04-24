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

/**
 * Aceita origem vindo da UI e converte para enum LeadOrigin do Prisma.
 * - Se vier um valor inválido (ex: "CAMPANHA_TRAFEGO"), mapeia para um válido (ex: "ACAO_EXTERNA") se existir.
 * - Se não conseguir mapear, retorna null (não quebra o POST/PATCH).
 */
function originOrNull(v: any): LeadOrigin | null {
  if (v === null || v === undefined || v === "") return null;

  const raw = String(v).trim();

  // enums do prisma normalmente são UPPER_CASE. Vamos normalizar.
  const up = raw.toUpperCase();

  // valores válidos do enum real no seu Prisma
  const allowed = new Set(Object.values(LeadOrigin));

  // 1) se já for um valor válido, ok
  if (allowed.has(up as any)) return up as LeadOrigin;

  // 2) mapeamentos "compatibilidade" (UI antiga -> enum atual)
  // Ajuste se quiser, mas assim já resolve CAMPANHA/CAMPANHA_TRAFEGO.
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

  // 3) não reconheceu -> null (não derruba sua criação/edição)
  return null;
}
function heatOrNull(v: any): LeadHeat | null {
  if (v === null || v === undefined || v === "") return null;

  const up = String(v).trim().toUpperCase();
  const allowed = new Set(Object.values(LeadHeat));

  if (allowed.has(up as LeadHeat)) return up as LeadHeat;

  return null;
}
export async function GET() {
  const s = await requirePermission("crm:use");

  const leads = await prisma.cRMLead.findMany({
    where: { tenantId: s.tenant.id, ownerId: s.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ ok: true, leads });
}

export async function POST(req: NextRequest) {
  const s = await requirePermission("crm:use");
  const body = await req.json().catch(() => ({}));

  const nome = String(body?.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const contextoGeral = body?.contextoGeral ? String(body.contextoGeral) : null;
  if (contextoGeral && contextoGeral.length > 1500) {
    return NextResponse.json({ error: "Contexto geral excede 1500 caracteres." }, { status: 400 });
  }

  try {
    const lead = await prisma.cRMLead.create({
      data: {
        tenantId: s.tenant.id,
        ownerId: s.user.id,
        nome,
        telefone: body?.telefone ? String(body.telefone) : null,
        email: body?.email ? String(body.email).toLowerCase() : null,

        rendaBruta: body?.rendaBruta !== undefined ? numOrNull(body.rendaBruta) : null,
        entrada: body?.entrada !== undefined ? numOrNull(body.entrada) : null,
        fgts: body?.fgts !== undefined ? numOrNull(body.fgts) : null,

        dataNascimento: body?.dataNascimento !== undefined ? dateOrNull(body.dataNascimento) : null,

        origem: body?.origem !== undefined ? originOrNull(body.origem) : null,

        interesse: body?.interesse ? String(body.interesse) : null,
        status: body?.status ?? "CONTATO_INICIAL",
        calorVenda: body?.calorVenda !== undefined ? heatOrNull(body.calorVenda) : null,
        contextoGeral,
        nextFollowUpAt: body?.nextFollowUpAt !== undefined ? dateOrNull(body.nextFollowUpAt) : null,
      },
    });

    return NextResponse.json({ ok: true, lead });
  } catch (err: any) {
    console.error("CRM POST /api/crm/leads error:", err);
    return NextResponse.json({ error: "Erro ao cadastrar lead." }, { status: 500 });
  }
}
