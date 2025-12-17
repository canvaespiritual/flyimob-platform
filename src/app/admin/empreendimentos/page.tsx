import Link from "next/link";
import { prisma } from "../../../lib/prisma";


export default async function EmpreendimentosPage() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;

  const items = await prisma.empreendimento.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      tipo: true,
      publicado: true,
      cidade: true,
      uf: true,
      construtora: { select: { name: true } },
      _count: { select: { tipologias: true, anexos: true, fotos: true } },
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Empreendimentos</h1>

        <Link
          href="/admin/empreendimentos/novo"
          className="border rounded px-4 py-2 hover:bg-gray-50"
        >
          + Novo empreendimento
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((e) => (
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
                  Tipo: {String(e.tipo)} • Publicado:{" "}
                  {e.publicado ? "Sim" : "Não"} • Tipologias: {e._count.tipologias} •
                  Anexos: {e._count.anexos} • Fotos: {e._count.fotos}
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  className="border rounded px-3 py-2 hover:bg-gray-50"
                  href={`/admin/empreendimentos/${e.id}/cadastro`}

                >
                  Editar
                </Link>

                <Link
                  className="border rounded px-3 py-2 hover:bg-gray-50"
                  href={`/admin/empreendimentos/${e.id}/tipologias`}
                >
                  Tipologias
                </Link>
                <Link
  className="border rounded px-3 py-2 hover:bg-gray-50"
  href={`/admin/empreendimentos/${e.id}/midias`}
>
  Mídias
</Link>

              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-sm text-gray-500">
            Nenhum empreendimento cadastrado ainda. Clique em <b>+ Novo empreendimento</b>.
          </div>
        )}
      </div>
    </div>
  );
}
