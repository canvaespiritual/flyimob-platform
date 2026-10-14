"use client";
import { brl, resumoGrupo, type PlanoPagamento, type ResumoCredito } from "@/lib/comparativos/plano";
type Attachment = { id: string; titulo: string; nomeOriginal: string };
export function AttachmentLink({ anexo, slug }: { anexo: Attachment; slug: string }) {
  return <a className="inline-block border rounded-lg px-3 py-2 text-sm hover:bg-gray-50" target="_blank" rel="noreferrer" href={`/api/comparativos/anexos?id=${encodeURIComponent(anexo.id)}&slug=${encodeURIComponent(slug)}`}>{anexo.titulo || "Consultar plano original"}</a>;
}
export function CreditoApresentacao({ credito, anexos, slug }: { credito: ResumoCredito | null; anexos: Attachment[]; slug: string }) {
  if (!credito && !anexos.length) return null;
  return <section className="bg-white border rounded-2xl p-5 mb-6 space-y-4"><h2 className="text-xl font-semibold">1. Crédito e capacidade de pagamento</h2>
    {credito && <><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{([['valorAprovado', 'Valor aprovado'], ['parcela', 'Parcela informada'], ['recursosProprios', 'Recursos próprios'], ['fgts', 'FGTS']] as const).filter(([key]) => credito[key] !== null).map(([key, label]) => <div key={key} className="border rounded-lg p-3"><p className="text-sm text-gray-500">{label}</p><b>{brl(credito[key])}</b></div>)}</div>{credito.observacoes && <p className="whitespace-pre-wrap text-sm">{credito.observacoes}</p>}</>}
    <div className="flex flex-wrap gap-2">{anexos.map(a => <AttachmentLink key={a.id} anexo={a} slug={slug} />)}</div>
  </section>;
}
export function PlanoApresentacao({ plano, fields, blocks, anexos, slug }: { plano: PlanoPagamento; fields: Record<string, boolean>; blocks: Record<string, boolean>; anexos: Attachment[]; slug: string }) {
  const show = (key: string) => fields[key] !== false;
  return <div className="space-y-3">
    {show("unidadeProposta") && <div className="text-sm space-y-1"><b>{plano.unidade || "Unidade não informada"}</b><p>{show("vagas") && (plano.vagas === null ? "Vagas não informadas no plano" : `${plano.vagas} vaga(s)`)}{plano.varanda === null ? "" : plano.varanda ? " · Com varanda" : " · Sem varanda"}</p></div>}
    <div className="grid grid-cols-2 gap-2">{([
      ['valorTotal', 'valorTotal', 'Preço da proposta', plano.valorTotal, true],
      ['entradaTotal', 'entradaTotalInformada', 'Total de entrada informado', plano.entradaTotalInformada ?? null, blocks.entrada],
      ['valorAvaliacaoBanco', 'valorAvaliacao', 'Valor de avaliação', plano.valorAvaliacao, blocks.geral],
      ['saldoFinanciamento', 'financiamento', 'Valor financiado', plano.financiamento, blocks.financiamento],
      ['parcelaFinanciamento', 'parcelaBanco', 'Parcela do banco', plano.parcelaBanco, blocks.financiamento],
    ] as const).filter(([key, , , , enabled]) => show(key) && enabled).map(([key, source, label, value]) => <div key={key} className="border rounded-lg p-3"><p className="text-xs text-gray-500">{plano.rotulos?.[source] || label}</p><b>{brl(value)}</b></div>)}</div>
    {blocks.entrada && plano.grupos.filter(g => show(`plano_${g.tipo}`)).map((g, n) => <div key={n} className="border rounded-lg p-3 text-sm space-y-1"><p className="font-semibold">{g.titulo || "Pagamento informado no documento"}</p><p className="whitespace-pre-wrap">{resumoGrupo(g)}</p>{g.inicio && <p className="text-xs text-gray-500">Início: {g.inicio.split("-").reverse().join("/")}{g.fim ? ` · Fim: ${g.fim.split("-").reverse().join("/")}` : ""}</p>}{g.totalInformado !== null && <p className="text-xs text-gray-500">Total informado no documento: {brl(g.totalInformado)}</p>}</div>)}
    {blocks.financiamento && <div className="text-sm">{([['fgts', 'FGTS', plano.fgts], ['subsidioFederal', 'Subsídio federal', plano.subsidioFederal], ['subsidioEstadual', 'Subsídio estadual', plano.subsidioEstadual]] as const).filter(([key, , value]) => show(key) && value !== null).map(([key, label, value]) => <div key={key} className="flex justify-between border-b py-2 gap-2"><span>{plano.rotulos?.[key] || label}</span><b>{brl(value)}</b></div>)}</div>}
    {blocks.observacoes && <>{show("descontosProposta") && plano.descontos && <div className="text-sm bg-amber-50 p-3 rounded-lg whitespace-pre-wrap"><b className="block">Descontos e benefícios condicionais</b>{plano.descontos}</div>}{show("observacao") && plano.condicoes && <div className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap"><b className="block">Condições e correção</b>{plano.condicoes}</div>}{show("validadeProposta") && plano.validade && <p className="text-xs whitespace-pre-wrap">Validade: {plano.validade}</p>}</>}
    {show("extrasProposta") && plano.extras.filter(e => e.exibir !== false).map((e, n) => <div key={n} className="text-sm border-b py-2"><b>{e.titulo}</b><p className="whitespace-pre-wrap">{e.valor}</p>{e.datas && <p className="text-xs text-gray-500 whitespace-pre-wrap mt-1">Datas: {e.datas}</p>}</div>)}
    {show("anexoProposta") && <div className="flex flex-wrap gap-2">{anexos.map(a => <AttachmentLink key={a.id} anexo={a} slug={slug} />)}</div>}
  </div>;
}
