import { prisma } from "../../../lib/prisma";
import Link from "next/link";
import ConfirmDeleteButton from "../../../components/ConfirmDeleteButton";

export default async function ConstrutorasPage({
  searchParams,
}: {
  searchParams?: { returnTo?: string };
}) {
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
      observacao: true, // ✅ NOVO
      _count: { select: { empreendimentos: true } },
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Construtoras</h1>
          <div className="text-sm text-gray-500">
            Cadastre, edite e gerencie as construtoras do tenant <b>flyimob</b>.
          </div>
        </div>

        <Link
          href="/admin"
          className="border rounded px-4 py-2 hover:bg-gray-50"
        >
          ← Voltar
        </Link>
      </div>

      {/* FORM DE CADASTRO (do zero) */}
      <div className="border rounded-lg p-4 bg-white mb-6">
        <div className="font-medium mb-3">Adicionar construtora</div>

        <form
          action="/api/construtoras/create"
          method="post"
          className="space-y-3"
        >
          <input type="hidden" name="tenantSlug" value="flyimob" />
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome*</label>
              <input
                name="name"
                placeholder="Nome da construtora"
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Website</label>
              <input
                name="website"
                placeholder="https://..."
                className="border rounded px-3 py-2 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <input
                name="email"
                placeholder="email@..."
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Telefone</label>
              <input
                name="telefone"
                placeholder="(61) ..."
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">WhatsApp comercial</label>
              <input
                name="whatsappComercial"
                placeholder="5561..."
                className="border rounded px-3 py-2 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Responsável comercial</label>
              <input
                name="responsavelComercial"
                className="border rounded px-3 py-2 w-full"
                placeholder="Nome do contato"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Endereço</label>
              <input
                name="endereco"
                className="border rounded px-3 py-2 w-full"
                placeholder="Endereço da construtora"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Observação</label>
            <textarea
              name="observacao"
              className="border rounded px-3 py-2 w-full min-h-[110px]"
              placeholder="Ponto de referência, política de negociação, cultura da construtora, contatos internos, etc."
            />
            <div className="text-xs text-gray-500">
              (Campo interno: ajuda muito no dia a dia.)
            </div>
          </div>

          <div className="flex justify-end">
            <button className="bg-black text-white rounded px-4 py-2">
              Adicionar
            </button>
          </div>
        </form>
      </div>

      {/* LISTA */}
      <div className="space-y-2">
        {construtoras.map((c) => (
          <div
            key={c.id}
            className="border rounded p-3 flex items-start justify-between gap-3 bg-white"
          >
            <div className="min-w-0">
              <div className="font-medium">{c.name}</div>

              {(c.website || c.email || c.telefone) && (
                <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                  {c.website && <div className="truncate">{c.website}</div>}
                  {c.email && <div className="truncate">{c.email}</div>}
                  {c.telefone && <div className="truncate">{c.telefone}</div>}
                </div>
              )}

              {c.observacao && (
                <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">
                  <span className="text-gray-500">Obs:</span> {c.observacao}
                </div>
              )}

              <div className="text-xs text-gray-500 mt-2">
                Empreendimentos vinculados:{" "}
                <b>{c._count.empreendimentos}</b>
              </div>
            </div>

           <div className="flex gap-2">
  <Link
    className="border rounded px-3 py-2 hover:bg-gray-50"
    href={`/admin/construtoras/${c.id}/edit`}
  >
    Editar
  </Link>

  {c._count.empreendimentos === 0 && (
    <form>
      <input type="hidden" name="tenantSlug" value="flyimob" />
      <input type="hidden" name="id" value={c.id} />
      <ConfirmDeleteButton
        formAction="/api/construtoras/delete"
        className="border rounded px-3 py-2 hover:bg-gray-50 text-red-600 border-red-300"
        confirmText={`Tem certeza que deseja excluir a construtora "${c.name}"?`}
      >
        Excluir
      </ConfirmDeleteButton>
    </form>
  )}
</div>

          </div>
        ))}

        {construtoras.length === 0 && (
          <div className="text-sm text-gray-500">
            Nenhuma construtora cadastrada ainda.
          </div>
        )}
      </div>
    </div>
  );
}
