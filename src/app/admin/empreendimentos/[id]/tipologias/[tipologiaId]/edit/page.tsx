import Link from "next/link";
import { prisma } from "../../../../../../../lib/prisma";
import EmpreendimentoWizardNav from "../../../../../../../components/Empreendimentos/EmpreendimentoWizardNav";

function toDateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EditTipologiaPage({
  params,
}: {
  params: { id: string; tipologiaId: string } | Promise<{ id: string; tipologiaId: string }>;
}) {
  const { id, tipologiaId } = await Promise.resolve(params);

  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;

  const empreendimento = await prisma.empreendimento.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, name: true, slug: true, tipo: true },
  });

  if (!empreendimento) return <div className="p-6">Empreendimento não encontrado.</div>;

  const tipologia = await prisma.empreendimentoTipologia.findFirst({
    where: { id: tipologiaId, empreendimentoId: empreendimento.id },
  });

  if (!tipologia) return <div className="p-6">Tipologia não encontrada.</div>;

  const tipoEmp = String(empreendimento.tipo);

  const showAreaTerreno =
    tipoEmp === "CASA" ||
    tipoEmp === "LOTE" ||
    tipoEmp === "LOTEAMENTO" ||
    tipoEmp === "CONDOMINIO_LOTES" ||
    tipoEmp === "CONDOMINIO_CASAS";

  const showFazenda = tipoEmp === "FAZENDA";

  const showCondominio = tipoEmp === "APARTAMENTO" || tipoEmp === "CONDOMINIO_VERTICAL";

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Editar Tipologia</h1>
          <div className="text-sm text-gray-600">
            <b>{empreendimento.name}</b> • <span className="font-mono">{empreendimento.slug}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/admin/empreendimentos/${empreendimento.id}/tipologias`}
            className="border rounded px-4 py-2 hover:bg-gray-50"
          >
            ← Voltar
          </Link>
        </div>
      </div>

      <EmpreendimentoWizardNav empreendimentoId={empreendimento.id} current="tipologias" />

      <div className="border rounded p-4">
        <form action="/api/tipologias/update" method="post" className="space-y-3">
          <input type="hidden" name="tenantSlug" value="flyimob" />
          <input type="hidden" name="empreendimentoId" value={empreendimento.id} />
          <input type="hidden" name="tipologiaId" value={tipologia.id} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome</label>
              <input
                name="nome"
                defaultValue={tipologia.nome ?? ""}
                placeholder='Ex: "2Q 65m²"'
                className="border rounded px-3 py-2 w-full"
              />
              <div className="text-xs text-gray-500">(Como aparece para o cliente.)</div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Modelo de financiamento*</label>
              <select
                name="financingModel"
                className="border rounded px-3 py-2 w-full"
                defaultValue={String(tipologia.financingModel || "")}
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

          <div className="space-y-1">
            <label className="text-sm font-medium">Descrição (opcional)</label>
            <input
              name="descricao"
              defaultValue={tipologia.descricao ?? ""}
              placeholder='Ex: "Unidade premium / sol nascente / final 2025"'
              className="border rounded px-3 py-2 w-full"
            />
            <div className="text-xs text-gray-500">(Uma frase curta para diferenciar.)</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Quartos</label>
              <input name="quartos" type="number" defaultValue={tipologia.quartos ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Suítes</label>
              <input name="suites" type="number" defaultValue={tipologia.suites ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Vagas</label>
              <input name="vagas" type="number" defaultValue={tipologia.vagas ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Área privativa (m²)</label>
              <input name="areaPrivativa" type="number" step="0.01" defaultValue={tipologia.areaPrivativa ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Disponíveis</label>
              <input name="disponiveis" type="number" defaultValue={tipologia.disponiveis ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>
          </div>

          {(showAreaTerreno || showFazenda || showCondominio) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {showAreaTerreno && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Área do terreno (m²)</label>
                  <input name="areaTerreno" type="number" step="0.01" defaultValue={tipologia.areaTerreno ?? ""} className="border rounded px-3 py-2 w-full" />
                </div>
              )}

              {showFazenda && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Hectares (ha)</label>
                    <input name="hectares" type="number" step="0.01" defaultValue={tipologia.hectares ?? ""} className="border rounded px-3 py-2 w-full" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Alqueires</label>
                    <input name="alqueires" type="number" step="0.01" defaultValue={tipologia.alqueires ?? ""} className="border rounded px-3 py-2 w-full" />
                  </div>
                </>
              )}

              {showCondominio && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Condomínio (R$)</label>
                  <input name="valorCondominio" type="number" defaultValue={tipologia.valorCondominio ?? ""} className="border rounded px-3 py-2 w-full" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Preço inicial (R$)</label>
              <input name="precoInicial" type="number" defaultValue={tipologia.precoInicial ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">% até chaves (se fluxo)</label>
              <input name="percentualAteChaves" type="number" defaultValue={tipologia.percentualAteChaves ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Avaliação do banco (se CA)</label>
              <input name="valorAvaliacaoBanco" type="number" defaultValue={tipologia.valorAvaliacaoBanco ?? ""} className="border rounded px-3 py-2 w-full" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button className="border rounded px-4 py-2 hover:bg-gray-50">Salvar alterações</button>

            <form action="/api/tipologias/delete" method="post">
              <input type="hidden" name="tenantSlug" value="flyimob" />
              <input type="hidden" name="empreendimentoId" value={empreendimento.id} />
              <input type="hidden" name="tipologiaId" value={tipologia.id} />
              <button className="border rounded px-4 py-2 hover:bg-gray-50">
                Remover tipologia
              </button>
            </form>
          </div>

          <div className="text-xs text-gray-500 pt-1">
            Atualizado em: {tipologia.atualizadoEm ? toDateInput(tipologia.atualizadoEm) : "—"}
          </div>
        </form>
      </div>
    </div>
  );
}
