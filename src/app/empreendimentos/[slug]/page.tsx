import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import PhotoGallery from "./PhotoGallery";


function formatMoney(v?: number | null) {
  if (typeof v !== "number") return null;
  return `R$ ${v.toLocaleString("pt-BR")}`;
}

function formatEntrega(d?: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(d);
}

function formatDate(d?: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function calcPrecoM2(preco?: number | null, area?: number | null) {
  if (typeof preco !== "number") return null;
  if (typeof area !== "number" || area <= 0) return null;
  return Math.round(preco / area);
}

export default async function EmpreendimentoPublicPage({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const { slug } = await Promise.resolve(params);

  // MVP: tenant fixo (como você vem fazendo). Depois dá pra trocar por domínio/subdomínio.
  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant não encontrado.</div>;

  const emp = await prisma.empreendimento.findFirst({
    where: { tenantId: tenant.id, slug, publicado: true },
    select: {
      id: true,
      name: true,
      slug: true,
      tipo: true,
      descricao: true,
      endereco: true,
      bairro: true,
      cidade: true,
      uf: true,
      cep: true,
      lat: true,
      lng: true,
      dataLancamento: true,
      dataEntrega: true,
      contatoNome: true,
      contatoTelefone: true,
      contatoWhatsapp: true,

      fotos: {
        orderBy: [{ isCover: "desc" }, { ordem: "asc" }],
        select: { id: true, urlFull: true, urlThumb: true, isCover: true, ordem: true },
      },

      tipologias: {
        orderBy: [{ precoInicial: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          nome: true,
          areaPrivativa: true,
          areaTerreno: true,
          quartos: true,
          suites: true,
          vagas: true,
          disponiveis: true,
          precoInicial: true,
          precoPorM2: true, // se você estiver preenchendo
          atualizadoEm: true,
          financingModel: true,
          percentualAteChaves: true,
          valorAvaliacaoBanco: true,
        },
      },

      anexos: {
        orderBy: [{ ordem: "asc" }, { createdAt: "desc" }],
        select: { id: true, tipo: true, titulo: true, url: true },
      },

      construtora: { select: { name: true, website: true } },
    },
  });

  if (!emp) return <div className="p-6">Empreendimento não encontrado ou não publicado.</div>;

  const cover = emp.fotos[0]?.urlFull || null;
  const entregaFmt = formatEntrega(emp.dataEntrega);
  const lancamentoFmt = formatDate(emp.dataLancamento);
  const entregaDateFmt = formatDate(emp.dataEntrega);

  return (
    <main className="min-h-screen">
      {/* Topbar simples */}
      <div className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-sm underline text-gray-700">
            ← Voltar ao mapa
          </Link>

          <div className="text-sm text-gray-600 font-mono">{emp.slug}</div>
        </div>
      </div>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Capa grande */}
          <PhotoGallery
  title={emp.name}
  fotos={emp.fotos.map((f) => ({ urlFull: f.urlFull, urlThumb: f.urlThumb }))}
 />


          {/* Infos */}
          <div>
            <h1 className="text-3xl font-semibold leading-tight">{emp.name}</h1>

            <div className="mt-2 text-gray-700">
              <div className="text-sm">
                {(emp.endereco ? emp.endereco : "")}
                {(emp.bairro || emp.cidade || emp.uf) ? " • " : ""}
                {(emp.bairro ? emp.bairro : "")}
                {(emp.cidade ? `, ${emp.cidade}` : "")}
                {(emp.uf ? `/${emp.uf}` : "")}
              </div>

              <div className="mt-1 text-xs text-gray-500">
                Tipo: {String(emp.tipo).replaceAll("_", " ")}
                {emp.construtora?.name ? ` • Construtora: ${emp.construtora.name}` : ""}
              </div>
            </div>

            {/* Chips */}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {lancamentoFmt && (
                <span className="px-2 py-1 border rounded bg-gray-50">Lançamento: {lancamentoFmt}</span>
              )}
              {entregaFmt && (
                <span className="px-2 py-1 border rounded bg-gray-50">Entrega: {entregaFmt}</span>
              )}
              {entregaDateFmt && (
                <span className="px-2 py-1 border rounded bg-gray-50">Entrega (data): {entregaDateFmt}</span>
              )}
            </div>

            {/* CTA Whats */}
            {emp.contatoWhatsapp && (
              <div className="mt-5">
                <a
                  href={`https://wa.me/${emp.contatoWhatsapp}?text=${encodeURIComponent(
                    `Olá! Tenho interesse no empreendimento ${emp.name}.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 border rounded px-4 py-2 hover:bg-gray-50"
                >
                  Falar no WhatsApp
                </a>
                <div className="text-xs text-gray-500 mt-1">
                  {emp.contatoNome ? `Contato: ${emp.contatoNome}` : ""}
                  {emp.contatoTelefone ? ` • Tel: ${emp.contatoTelefone}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        
      </section>

      {/* CONTEÚDO: Tipologias + Anexos + Mapa */}
      <section className="max-w-6xl mx-auto px-4 pb-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Descrição */}
          {emp.descricao && (
            <div className="border rounded p-4">
              <div className="font-semibold mb-2">Descrição</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{emp.descricao}</div>
            </div>
          )}

          {/* Tipologias */}
          <div className="border rounded p-4">
            <div className="font-semibold mb-3">Tipologias disponíveis</div>

            {emp.tipologias.length === 0 ? (
              <div className="text-sm text-gray-500">Nenhuma tipologia cadastrada.</div>
            ) : (
              <div className="space-y-3">
                {emp.tipologias.map((t) => {
                  const area = t.areaPrivativa ?? t.areaTerreno ?? null;
                  const precoM2 =
                    typeof t.precoPorM2 === "number" ? t.precoPorM2 : calcPrecoM2(t.precoInicial, area);

                  return (
                    <div key={t.id} className="border rounded p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {t.nome || "(Sem nome)"}
                            <span className="text-xs text-gray-500"> • {String(t.financingModel || "-")}</span>
                          </div>

                          <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-2">
                            {typeof area === "number" && <span>{area} m²</span>}
                            {typeof t.quartos === "number" && <span>{t.quartos} q</span>}
                            {typeof t.suites === "number" && <span>{t.suites} s</span>}
                            {typeof t.vagas === "number" && <span>{t.vagas} v</span>}
                            {typeof t.disponiveis === "number" && <span>Disponíveis: {t.disponiveis}</span>}
                          </div>

                          {/* Atualização */}
                          <div className="text-xs text-gray-500 mt-1">
                            Atualizado em: {formatDate(t.atualizadoEm) || "—"}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-gray-500">A partir de</div>
                          <div className="font-semibold">{formatMoney(t.precoInicial) || "—"}</div>
                          {typeof precoM2 === "number" && (
                            <div className="text-[11px] text-gray-500">
                              R$ {precoM2.toLocaleString("pt-BR")}/m²
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Regras do financiamento (se preenchidas) */}
                      {(t.percentualAteChaves || t.valorAvaliacaoBanco) && (
                        <div className="text-xs text-gray-600 mt-2">
                          {typeof t.percentualAteChaves === "number" ? (
                            <span>% até chaves: {t.percentualAteChaves}</span>
                          ) : null}
                          {typeof t.valorAvaliacaoBanco === "number" ? (
                            <span>{t.percentualAteChaves ? " • " : ""}Avaliação banco: {formatMoney(t.valorAvaliacaoBanco)}</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Anexos */}
          <div className="border rounded p-4">
            <div className="font-semibold mb-2">Arquivos / Anexos</div>
            {emp.anexos.length === 0 ? (
              <div className="text-sm text-gray-500">Nenhum anexo.</div>
            ) : (
              <ul className="space-y-2">
                {emp.anexos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                      {a.titulo || a.tipo}
                    </a>
                    <span className="text-xs text-gray-500">{a.tipo}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Mapa */}
          <div className="border rounded overflow-hidden">
            <div className="p-3 border-b font-semibold text-sm">Mapa</div>
            {typeof emp.lat === "number" && typeof emp.lng === "number" ? (
              <iframe
                title="Mapa"
                className="w-full h-[320px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${emp.lat},${emp.lng}&z=15&output=embed`}
              />
            ) : (
              <div className="p-3 text-sm text-gray-500">Sem coordenadas.</div>
            )}
          </div>

          {/* Contato */}
          <div className="border rounded p-4">
            <div className="font-semibold mb-2">Contato</div>
            <div className="text-sm text-gray-700">
              {emp.contatoNome ? <div>{emp.contatoNome}</div> : <div className="text-gray-500">Não informado</div>}
              {emp.contatoTelefone ? <div className="text-gray-600">{emp.contatoTelefone}</div> : null}
              {emp.contatoWhatsapp ? (
                <a
                  href={`https://wa.me/${emp.contatoWhatsapp}?text=${encodeURIComponent(
                    `Olá! Tenho interesse no empreendimento ${emp.name}.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex mt-3 border rounded px-3 py-2 hover:bg-gray-50"
                >
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
