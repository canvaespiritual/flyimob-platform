import { prisma } from "../../../../lib/prisma";

function txt(form: FormData, key: string) {
  const v = form.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export async function POST(req: Request) {
  const form = await req.formData();
    const lat = form.get("lat") ? Number(form.get("lat")) : null;
const lng = form.get("lng") ? Number(form.get("lng")) : null;

const bairro = form.get("bairro") ? String(form.get("bairro")) : null;
const cidade = form.get("cidade") ? String(form.get("cidade")) : null;
const uf = form.get("uf") ? String(form.get("uf")) : null;
const cep = form.get("cep") ? String(form.get("cep")) : null;

  const tenantSlug = String(form.get("tenantSlug") || "").trim();
  const id = String(form.get("id") || "").trim();

  if (!id) return new Response("ID obrigatório", { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return new Response("Tenant não encontrado", { status: 404 });

  const name = String(form.get("name") || "").trim();
  const tipo = String(form.get("tipo") || "OUTRO").trim();
  const endereco = String(form.get("endereco") || "").trim();

  const construtoraIdRaw = String(form.get("construtoraId") || "").trim();
  const construtoraId = construtoraIdRaw ? construtoraIdRaw : null;

  const descricao = String(form.get("descricao") || "").trim();

  const dataLancamentoRaw = String(form.get("dataLancamento") || "").trim();
  const dataEntregaRaw = String(form.get("dataEntrega") || "").trim();
  const dataLancamento = dataLancamentoRaw ? new Date(dataLancamentoRaw) : null;
  const dataEntrega = dataEntregaRaw ? new Date(dataEntregaRaw) : null;

  const contatoNome = String(form.get("contatoNome") || "").trim();
  const contatoTelefone = String(form.get("contatoTelefone") || "").trim();
  const contatoWhatsapp = String(form.get("contatoWhatsapp") || "").trim();

  

  const publicado = form.get("publicado") === "on";
  const status = publicado ? "ATIVO" : "INATIVO";


  if (!name || !endereco) {
    return new Response("Campos obrigatórios: name e endereco.", { status: 400 });
  }

  await prisma.empreendimento.updateMany({
    where: { id, tenantId: tenant.id },
    data: {
      name,
      tipo: tipo as any,
      endereco,
      construtoraId,
      descricao: descricao || null,
      observacao: txt(form, "observacao"), 
      dataLancamento,
      dataEntrega,
      contatoNome: contatoNome || null,
      contatoTelefone: contatoTelefone || null,
      contatoWhatsapp: contatoWhatsapp || null,
          lat,
        lng,
     bairro,
     cidade,
     uf,
     cep,

      publicado,
      status,
      
    },
  });

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
return Response.redirect(
  new URL(`/admin/empreendimentos/${id}/cadastro`, origin),
  303
);

}
