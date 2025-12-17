import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";

export default async function EditConstrutoraPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const { id } = await Promise.resolve(params);

  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;

  const construtora = await prisma.construtora.findFirst({
    where: { id, tenantId: tenant.id },
    select: {
      id: true,
      name: true,
      website: true,
      email: true,
      telefone: true,
      endereco: true,
      responsavelComercial: true,
      whatsappComercial: true,
      _count: { select: { empreendimentos: true } },
    },
  });

  if (!construtora) return <div className="p-6">Construtora não encontrada.</div>;

  const podeExcluir = construtora._count.empreendimentos === 0;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Editar Construtora</h1>
          <div className="text-sm text-gray-600">
            <b>{construtora.name}</b>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Empreendimentos vinculados: <b>{construtora._count.empreendimentos}</b>
          </div>
        </div>

        <Link
          href="/admin/construtoras"
          className="border rounded px-4 py-2 hover:bg-gray-50"
        >
          ← Voltar
        </Link>
      </div>

      <div className="border rounded p-4">
        <form
          action="/api/construtoras/update"
          method="post"
          className="space-y-3"
        >
          <input type="hidden" name="tenantSlug" value="flyimob" />
          <input type="hidden" name="id" value={construtora.id} />

          <div className="space-y-1">
            <label className="text-sm font-medium">Nome*</label>
            <input
              name="name"
              defaultValue={construtora.name}
              className="border rounded px-3 py-2 w-full"
              required
            />
            <div className="text-xs text-gray-500">
              (Pode editar, mas não pode repetir o nome dentro do mesmo tenant.)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Website</label>
              <input
                name="website"
                defaultValue={construtora.website ?? ""}
                className="border rounded px-3 py-2 w-full"
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <input
                name="email"
                defaultValue={construtora.email ?? ""}
                className="border rounded px-3 py-2 w-full"
                placeholder="email@..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Telefone</label>
              <input
                name="telefone"
                defaultValue={construtora.telefone ?? ""}
                className="border rounded px-3 py-2 w-full"
                placeholder="(62) ..."
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Endereço</label>
              <input
                name="endereco"
                defaultValue={construtora.endereco ?? ""}
                className="border rounded px-3 py-2 w-full"
                placeholder="Endereço da construtora"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Responsável comercial</label>
              <input
                name="responsavelComercial"
                defaultValue={construtora.responsavelComercial ?? ""}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">WhatsApp comercial</label>
              <input
                name="whatsappComercial"
                defaultValue={construtora.whatsappComercial ?? ""}
                className="border rounded px-3 py-2 w-full"
                placeholder="5562..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button className="border rounded px-4 py-2 hover:bg-gray-50">
              Salvar alterações
            </button>

            {podeExcluir ? (
              <button
                formAction="/api/construtoras/delete"
                className="border rounded px-4 py-2 hover:bg-gray-50"
              >
                Excluir
              </button>
            ) : (
              <div className="text-xs text-gray-500">
                (Não pode excluir: vinculada a empreendimentos.)
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
