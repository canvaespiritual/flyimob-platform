import DeleteButton from "./DeleteButton";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";

export default async function EmpreendimentosPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;

  // =========================
  // Paginação e filtros
  // =========================
  const take = 10;
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const skip = (page - 1) * take;

  const q = String(searchParams?.q ?? "").trim();
  const status = String(searchParams?.status ?? "").trim(); // ATIVO | INATIVO | ""
  const maxPrice = String(searchParams?.maxPrice ?? "").trim();
  const maxPriceNum = maxPrice ? Number(maxPrice.replace(/[^\d]/g, "")) : null;

  // =========================
  // WHERE dinâmico
  // =========================
  const where: any = { tenantId: tenant.id };

  if (status) where.status = status;

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { cidade: { contains: q, mode: "insensitive" } },
      { bairro: { contains: q, mode: "insensitive" } },
      { construtora: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  // 👉 filtro por preço SÓ quando preenchido
  if (maxPriceNum && !Number.isNaN(maxPriceNum)) {
    where.tipologias = {
      some: {
        precoInicial: { lte: maxPriceNum },
      },
    };
  }

  // =========================
  // Query
  // =========================
  const total = await prisma.empreendimento.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / take));

  const items = await prisma.empreendimento.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      name: true,
      slug: true,
      tipo: true,
      publicado: true,
      status: true,
      cidade: true,
      uf: true,
      construtora: { select: { name: true } },
      _count: { select: { tipologias: true, anexos: true, fotos: true } },
      tipologias: {
        select: { precoInicial: true },
        where: { precoInicial: { not: null } },
      },
    },
  });

  function buildPageHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (maxPrice) sp.set("maxPrice", maxPrice);
    sp.set("page", String(p));
    return `/admin/empreendimentos?${sp.toString()}`;
  }

  return (
    <div className="p-6">
      {/* =========================
          Header
      ========================= */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Empreendimentos</h1>

        <Link
          href="/admin/empreendimentos/novo"
          className="border rounded px-4 py-2 hover:bg-gray-50"
        >
          + Novo empreendimento
        </Link>
      </div>

      {/* =========================
          Filtros (GET)
      ========================= */}
      <form
        method="GET"
        className="border rounded p-3 mb-4 grid grid-cols-1 sm:grid-cols-12 gap-2"
      >
        <div className="sm:col-span-5">
          <label className="text-xs text-gray-600">Buscar</label>
          <input
            name="q"
            defaultValue={q}
            className="w-full border rounded px-3 py-2"
            placeholder="nome, slug, cidade, bairro, construtora..."
          />
        </div>

        <div className="sm:col-span-3">
          <label className="text-xs text-gray-600">Status</label>
          <select
            name="status"
            defaultValue={status}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Todos</option>
            <option value="ATIVO">ATIVO</option>
            <option value="INATIVO">INATIVO</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-gray-600">Preço até (R$)</label>
          <input
            name="maxPrice"
            defaultValue={maxPrice}
            className="w-full border rounded px-3 py-2"
            placeholder="350000"
            inputMode="numeric"
          />
        </div>

        <div className="sm:col-span-2 flex gap-2">
          <button className="flex-1 border rounded px-3 py-2 hover:bg-gray-50">
            Filtrar
          </button>
          <Link
            className="flex-1 border rounded px-3 py-2 hover:bg-gray-50 text-center"
            href="/admin/empreendimentos"
          >
            Limpar
          </Link>
        </div>
      </form>

      {/* =========================
          Lista
      ========================= */}
      <div className="space-y-2">
        {items.map((e) => {
          const precos = e.tipologias
            .map((t) => t.precoInicial)
            .filter((v): v is number => typeof v === "number");
          const priceFrom = precos.length ? Math.min(...precos) : null;

          return (
            <div key={e.id} className="border rounded p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-lg">{e.name}</div>

                  <div className="text-sm text-gray-600">
                    {e.construtora?.name ? `${e.construtora.name} • ` : ""}
                    {e.cidade ? e.cidade : "Cidade não informada"}
                    {e.uf ? `/${e.uf}` : ""}
                    {" • "}
                    <span className="font-mono">{e.slug}</span>
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    ID: <span className="font-mono">{e.id}</span>
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    Tipo: {String(e.tipo)} • Status:{" "}
                    {e.status} • Tipologias: {e._count.tipologias} •
                    Anexos: {e._count.anexos} • Fotos: {e._count.fotos}
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    {priceFrom
                      ? `A partir de R$ ${priceFrom.toLocaleString("pt-BR")}`
                      : "Sem preço (sem tipologia)"}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 justify-end">
                  <Link
                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                    href={`/admin/empreendimentos/${e.id}/cadastro`}
                  >
                    Editar
                  </Link>

                  <Link
                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                    href={`/admin/empreendimentos/${e.id}/tipologias`}
                  >
                    Tipologias
                  </Link>

                  <Link
                    className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                    href={`/admin/empreendimentos/${e.id}/midias`}
                  >
                    Mídias
                  </Link>

                  {/* Status */}
                  <form action="/api/empreendimentos/toggle-status" method="POST">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="tenantSlug" value="flyimob" />
                    <button className="border rounded px-3 py-2 text-sm hover:bg-gray-50">
                      {e.publicado ? "Inativar" : "Ativar"}
                    </button>
                  </form>

                  {/* Excluir */}
                  <form action="/api/empreendimentos/delete" method="POST">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="tenantSlug" value="flyimob" />
                    <DeleteButton />
                  </form>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-sm text-gray-500">
            Nenhum empreendimento encontrado com os filtros atuais.
          </div>
        )}
      </div>

      {/* =========================
          Paginação
      ========================= */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-xs text-gray-500">
          Página {page} de {totalPages} • Total: {total}
        </div>

        <div className="flex gap-2">
          <Link
            className={`border rounded px-3 py-2 ${
              page <= 1
                ? "pointer-events-none opacity-50"
                : "hover:bg-gray-50"
            }`}
            href={buildPageHref(page - 1)}
          >
            ← Anterior
          </Link>

          <Link
            className={`border rounded px-3 py-2 ${
              page >= totalPages
                ? "pointer-events-none opacity-50"
                : "hover:bg-gray-50"
            }`}
            href={buildPageHref(page + 1)}
          >
            Próxima →
          </Link>
        </div>
      </div>
    </div>
  );
}
