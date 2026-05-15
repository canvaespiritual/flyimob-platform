import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import EmpreendimentoWizardNav from "../../../../../components/empreendimentos/EmpreendimentoWizardNav";
import { requireUser } from "@/lib/authz.server";

export default async function TipologiasPage(
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(params);

  const s = await requireUser();
  const tenant = s.tenant;

  const empreendimento = await prisma.empreendimento.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, name: true, slug: true, tipo: true },
  });

  if (!empreendimento) {
    return <div className="p-6">Empreendimento não encontrado.</div>;
  }

  const tipologias = await prisma.empreendimentoTipologia.findMany({
    where: { empreendimentoId: empreendimento.id },
    orderBy: { createdAt: "desc" },
  });

  const tipoEmp = String(empreendimento.tipo);

  const showAreaTerreno =
    tipoEmp === "CASA" ||
    tipoEmp === "LOTE" ||
    tipoEmp === "LOTEAMENTO" ||
    tipoEmp === "CONDOMINIO_LOTES" ||
    tipoEmp === "CONDOMINIO_CASAS";

  const showFazenda =
    tipoEmp === "FAZENDA";

  const showCondominio =
    tipoEmp === "APARTAMENTO" ||
    tipoEmp === "CONDOMINIO_VERTICAL";

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Tipologias</h1>
          <div className="text-sm text-gray-600">
            <b>{empreendimento.name}</b> •{" "}
            <span className="font-mono">{empreendimento.slug}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Tipo do empreendimento: <b>{tipoEmp.replaceAll("_", " ")}</b>
          </div>
        </div>
       

        <Link
          href="/admin/empreendimentos"
          className="border rounded px-4 py-2 hover:bg-gray-50"
        >
          ← Voltar
        </Link>
      </div>

      {/* WIZARD NAV */}
      <EmpreendimentoWizardNav
        empreendimentoId={empreendimento.id}
        current="tipologias"
      />

      {/* FORM */}
      <div className="border rounded p-4 mb-6">
        <h2 className="font-semibold mb-3">Adicionar tipologia</h2>

        <form action="/api/tipologias/create" method="post" className="space-y-3">
          <input type="hidden" name="tenantSlug" value={tenant.slug} />
          <input type="hidden" name="empreendimentoId" value={empreendimento.id} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome</label>
              <input
                name="nome"
                placeholder='Ex: "2Q 65m²"'
                className="border rounded px-3 py-2 w-full"
              />
              <div className="text-xs text-gray-500">
                (Como você quer que apareça para o cliente.)
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Modelo de financiamento*</label>
              <select
                name="financingModel"
                className="border rounded px-3 py-2 w-full"
                required
              >
                <option value="CREDITO_ASSOCIATIVO">Crédito associativo</option>
                <option value="FLUXO_ATE_CHAVES">Fluxo até as chaves</option>
              </select>
              <div className="text-xs text-gray-500">
                CA exige <b>avaliação do banco</b>. Fluxo exige <b>% até chaves</b>.
              </div>
            </div>
          </div>

          {/* Descrição curta */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Descrição (opcional)</label>
            <input
              name="descricao"
              placeholder='Ex: "Planta final 2025 / unidade premium / sol nascente"'
              className="border rounded px-3 py-2 w-full"
            />
            <div className="text-xs text-gray-500">
              (Uma frase curta para diferenciar a tipologia.)
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Quartos</label>
              <input name="quartos" type="number" className="border rounded px-3 py-2 w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Suítes</label>
              <input name="suites" type="number" className="border rounded px-3 py-2 w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Vagas</label>
              <input name="vagas" type="number" className="border rounded px-3 py-2 w-full" />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Área privativa (m²)</label>
              <input
                name="areaPrivativa"
                type="number"
                step="0.01"
                className="border rounded px-3 py-2 w-full"
              />
              <div className="text-xs text-gray-500">
                (Para apto/casa, geralmente é a área principal.)
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Disponíveis</label>
              <input name="disponiveis" type="number" className="border rounded px-3 py-2 w-full" />
            </div>
          </div>

          {/* Campos condicionais */}
          {(showAreaTerreno || showFazenda || showCondominio) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {showAreaTerreno && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Área do terreno (m²)</label>
                  <input
                    name="areaTerreno"
                    type="number"
                    step="0.01"
                    className="border rounded px-3 py-2 w-full"
                    placeholder="Ex: 360"
                  />
                  <div className="text-xs text-gray-500">
                    (Para lote/casa: terreno total.)
                  </div>
                </div>
              )}

              {showFazenda && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Hectares (ha)</label>
                    <input
                      name="hectares"
                      type="number"
                      step="0.01"
                      className="border rounded px-3 py-2 w-full"
                      placeholder="Ex: 12.5"
                    />
                    <div className="text-xs text-gray-500">
                      (Área total em hectares.)
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Alqueires</label>
                    <input
                      name="alqueires"
                      type="number"
                      step="0.01"
                      className="border rounded px-3 py-2 w-full"
                      placeholder="Ex: 2.58"
                    />
                    <div className="text-xs text-gray-500">
                      (Se preferir trabalhar em alqueires.)
                    </div>
                  </div>
                </>
              )}

              {showCondominio && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Condomínio (R$)</label>
                  <input
                    name="valorCondominio"
                    type="number"
                    className="border rounded px-3 py-2 w-full"
                    placeholder="Ex: 450"
                  />
                  <div className="text-xs text-gray-500">
                    (Valor mensal aproximado do condomínio.)
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Preço inicial (R$)</label>
              <input name="precoInicial" type="number" className="border rounded px-3 py-2 w-full" />
              <div className="text-xs text-gray-500">
                (A partir de — usado no card e na landing page.)
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">% até chaves (se fluxo)</label>
              <input
                name="percentualAteChaves"
                type="number"
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Avaliação do banco (se CA)</label>
              <input
                name="valorAvaliacaoBanco"
                type="number"
                className="border rounded px-3 py-2 w-full"
              />
            </div>
          </div>

          <button className="border rounded px-4 py-2 hover:bg-gray-50">
            Salvar tipologia
          </button>
        </form>
      </div>

      {/* LISTA */}
<div className="space-y-2">
  {tipologias.map((t) => (
    <div key={t.id} className="border rounded p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium">
          {t.nome || "(Sem nome)"} •{" "}
          <span className="text-sm text-gray-600">{String(t.financingModel)}</span>
        </div>

        <div className="flex gap-2">
          <Link
            className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
            href={`/admin/empreendimentos/${empreendimento.id}/tipologias/${t.id}/edit`}
          >
            Editar
          </Link>

          <form action="/api/tipologias/delete" method="post">
            <input type="hidden" name="tenantSlug" value={tenant.slug} />
            <input type="hidden" name="empreendimentoId" value={empreendimento.id} />
            <input type="hidden" name="tipologiaId" value={t.id} />
            <button className="border rounded px-3 py-1 text-sm hover:bg-gray-50">
              Remover
            </button>
          </form>
        </div>
      </div>

      {/* Descrição */}
      {t.descricao ? (
        <div className="text-xs text-gray-700 mt-1">{t.descricao}</div>
      ) : null}

      <div className="text-xs text-gray-500 mt-1">
        Área privativa: {t.areaPrivativa ?? "-"} m²
        {t.areaTerreno ? ` • Terreno: ${t.areaTerreno} m²` : ""}
        {t.hectares ? ` • Ha: ${t.hectares}` : ""}
        {t.alqueires ? ` • Alq: ${t.alqueires}` : ""}
        {t.valorCondominio ? ` • Condomínio: R$ ${t.valorCondominio}` : ""}
      </div>

      <div className="text-xs text-gray-500 mt-1">
        Fluxo(%): {t.percentualAteChaves ?? "-"} • Avaliação banco: {t.valorAvaliacaoBanco ?? "-"}
      </div>

      <div className="text-xs text-gray-500 mt-1">
        Atualizado em: {t.atualizadoEm ? new Date(t.atualizadoEm).toLocaleDateString("pt-BR") : "—"}
      </div>
    </div>
  ))}

  {tipologias.length === 0 && (
    <div className="text-sm text-gray-500">Nenhuma tipologia cadastrada ainda.</div>
  )}
</div>



    </div>
  );
}
