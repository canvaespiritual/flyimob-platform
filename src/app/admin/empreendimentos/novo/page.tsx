import ConstrutoraSelectWithModal from "../ConstrutoraSelectWithModal";
import EmpreendimentoGeocode from "../empreendimentoGeocode";


import { prisma } from "../../../../lib/prisma";
import { requireUser } from "@/lib/authz.server";


export default async function NovoEmpreendimentoPage() {
 const s = await requireUser();
const tenant = s.tenant;

  const construtoras = await prisma.construtora.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });

  const TIPOS = [
    "CONDOMINIO_VERTICAL",
    "CONDOMINIO_CASAS",
    "CONDOMINIO_LOTES",
    "LOTEAMENTO",
    "APARTAMENTO",
    "CASA",
    "LOTE",
    "COMERCIAL",
    "GALPAO",
    "AREA",
    "FAZENDA",
    "OUTRO",
  ] as const;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Novo Empreendimento</h1>

      <form action="/api/empreendimentos/create" method="post" className="space-y-4">
        <input type="hidden" name="tenantSlug" value={tenant.slug} />

        {/* Obrigatórios */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Nome*</label>
          <input
            name="name"
            placeholder="Nome do empreendimento"
            className="border rounded px-3 py-2 w-full"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Slug*</label>
          <input
            name="slug"
            placeholder="ex: floramazonia-cmo"
            className="border rounded px-3 py-2 w-full"
            required
          />
          <div className="text-xs text-gray-500">
            Use letras minúsculas e hífen (isso vira a URL pública).
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Tipo*</label>
          <select name="tipo" className="border rounded px-3 py-2 w-full" defaultValue="OUTRO">
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

                <EmpreendimentoGeocode />


        {/* Relacionamentos */}
      <ConstrutoraSelectWithModal
  tenantSlug={tenant.slug}
  initialConstrutoras={construtoras}
/>


        {/* Campos opcionais (não engessar) */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Descrição (opcional)</label>
          <textarea
            name="descricao"
            placeholder="Descrição geral (até ~1000 caracteres)"
            className="border rounded px-3 py-2 w-full min-h-[120px]"
            maxLength={1000}
          />
        </div>
              <div className="space-y-2">
  <label className="text-sm font-medium">
    Observações internas (opcional)
  </label>
  <textarea
    name="observacao"
    placeholder="Ponto de referência, política de negociação, flexibilidade de desconto, cultura da construtora, etc."
    className="border rounded px-3 py-2 w-full min-h-[100px]"
    maxLength={1000}
  />
  <div className="text-xs text-gray-500">
    Informação interna para corretores (não aparece no público automaticamente).
  </div>
</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Data de lançamento (opcional)</label>
            <input name="dataLancamento" type="date" className="border rounded px-3 py-2 w-full" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Data de entrega (opcional)</label>
            <input name="dataEntrega" type="date" className="border rounded px-3 py-2 w-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Contato (nome)</label>
            <input name="contatoNome" placeholder="Nome" className="border rounded px-3 py-2 w-full" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Telefone</label>
            <input name="contatoTelefone" placeholder="(62) 9xxxx-xxxx" className="border rounded px-3 py-2 w-full" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">WhatsApp</label>
            <input name="contatoWhatsapp" placeholder="55629xxxxxxx" className="border rounded px-3 py-2 w-full" />
            <div className="text-xs text-gray-500">Só números (pra link clicável depois).</div>
          </div>
        </div>

        {/* Publicação */}
        <label className="flex items-center gap-2 pt-2">
          <input type="checkbox" name="publicado" />
          Publicar no mapa
        </label>

        <button className="border rounded px-4 py-2">Salvar</button>
      </form>
    </div>
  );
}
