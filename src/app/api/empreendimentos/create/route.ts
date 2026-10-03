import { EmpreendimentoTipo } from "@prisma/client";
import { getPermissionApiSession } from "@/lib/api-access.server";
import { prisma } from "../../../../lib/prisma";
function txt(form: FormData, key: string) {
  const v = form.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}


export async function POST(req: Request) {
  const auth = await getPermissionApiSession("data:manage");
  if (!auth.ok) return auth.response;
  const tenant = auth.session.tenant;
  const form = await req.formData();

  const name = String(form.get("name") || "").trim();
  const slug = String(form.get("slug") || "").trim();
  const tipo = String(form.get("tipo") || "OUTRO").trim();

  const endereco = String(form.get("endereco") || "").trim();
    const lat = form.get("lat") ? Number(form.get("lat")) : null;
  const lng = form.get("lng") ? Number(form.get("lng")) : null;

  const bairro = form.get("bairro") ? String(form.get("bairro")) : null;
  const cidade = form.get("cidade") ? String(form.get("cidade")) : null;
  const uf = form.get("uf") ? String(form.get("uf")) : null;
  const cep = form.get("cep") ? String(form.get("cep")) : null;

  const descricao = String(form.get("descricao") || "").trim();

  const construtoraIdRaw = String(form.get("construtoraId") || "").trim();
  const construtoraId = construtoraIdRaw ? construtoraIdRaw : null;
  if (construtoraId && !await prisma.construtora.findFirst({ where: { id: construtoraId, tenantId: tenant.id }, select: { id: true } })) {
    return new Response("Construtora inválida", { status: 400 });
  }

  const dataLancamentoRaw = String(form.get("dataLancamento") || "").trim();
  const dataEntregaRaw = String(form.get("dataEntrega") || "").trim();

  const contatoNome = String(form.get("contatoNome") || "").trim();
  const contatoTelefone = String(form.get("contatoTelefone") || "").trim();
  const contatoWhatsapp = String(form.get("contatoWhatsapp") || "").trim();

  const publicado = form.get("publicado") === "on";

  if (!name || !slug || !endereco) {
    return new Response("Campos obrigatórios: nome, slug, endereço.", { status: 400 });
  }

  // Datas: se vazio, salva null
  const dataLancamento = dataLancamentoRaw ? new Date(dataLancamentoRaw) : null;
  const dataEntrega = dataEntregaRaw ? new Date(dataEntregaRaw) : null;
 



  const created = await prisma.empreendimento.create({
  data: {
    tenantId: tenant.id,
    construtoraId,

    name,
    slug,
    tipo: tipo as EmpreendimentoTipo,

    endereco,
    descricao: descricao || null,
    observacao: txt(form, "observacao"),

    dataLancamento,
    dataEntrega,

    contatoNome: contatoNome || null,
    contatoTelefone: contatoTelefone || null,
    contatoWhatsapp: contatoWhatsapp || null,

    publicado,
    lat,
    lng,
    bairro,
    cidade,
    uf,
    cep,
  },
  select: { id: true },
});

   const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;

  return Response.redirect(
    new URL(`/admin/empreendimentos/${created.id}/cadastro`, origin),
    303
  );
}