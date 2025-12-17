import { prisma } from "../../../lib/prisma";
import Link from "next/link";


export default async function ConstrutorasPage({
  searchParams,
}: {
  searchParams?: { returnTo?: string };
}) {

  // Por enquanto, fixo no tenant FlyImob.
  // Depois vira dinâmico via login (multi-tenant).
  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;
  const returnTo = searchParams?.returnTo || null;


  const construtoras = await prisma.construtora.findMany({
  where: { tenantId: tenant.id },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    name: true,
    website: true,
    email: true,
    telefone: true,
    responsavelComercial: true,
    whatsappComercial: true,
    _count: { select: { empreendimentos: true } },
  },
});


  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Construtoras</h1>

      <form action="/api/construtoras/create" method="post" className="flex gap-2 mb-6">
        <input type="hidden" name="tenantSlug" value="flyimob" />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

        <input
          name="name"
          placeholder="Nome da construtora"
          className="border rounded px-3 py-2 w-80"
          required
        />
        <button className="border rounded px-4 py-2">Adicionar</button>
      </form>

      <div className="space-y-2">
        {construtoras.map((c) => (
          <div key={c.id} className="border rounded p-3 flex items-start justify-between gap-3">
  <div>
    <div className="font-medium">{c.name}</div>
    {c.website && <div className="text-sm text-gray-500">{c.website}</div>}
    <div className="text-xs text-gray-500 mt-1">
      Empreendimentos vinculados: {c._count.empreendimentos}
    </div>
  </div>

  <Link
    className="border rounded px-3 py-2 hover:bg-gray-50"
    href={`/admin/construtoras/${c.id}/edit`}
  >
    Editar
  </Link>
</div>

        ))}
        {construtoras.length === 0 && (
          <div className="text-sm text-gray-500">Nenhuma construtora cadastrada ainda.</div>
        )}
      </div>
    </div>
  );
}
