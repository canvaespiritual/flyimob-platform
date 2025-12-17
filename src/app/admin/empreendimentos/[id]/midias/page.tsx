import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import MidiasClient from "./midiasClient";

export default async function MidiasPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(params);

  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant não encontrado.</div>;

  const empreendimento = await prisma.empreendimento.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true, name: true, slug: true },
  });
  if (!empreendimento) return <div className="p-6">Empreendimento não encontrado.</div>;

  const fotos = await prisma.empreendimentoFoto.findMany({
    where: { empreendimentoId: empreendimento.id },
    orderBy: [{ isCover: "desc" }, { ordem: "asc" }],
  });

  const anexos = await prisma.empreendimentoAnexo.findMany({
    where: { empreendimentoId: empreendimento.id },
    orderBy: [{ ordem: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Mídias</h1>
          <div className="text-sm text-gray-600">
            <b>{empreendimento.name}</b> • <span className="font-mono">{empreendimento.slug}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link className="border rounded px-3 py-2 hover:bg-gray-50" href="/admin/empreendimentos">
            ← Voltar
          </Link>
          <Link className="border rounded px-3 py-2 hover:bg-gray-50" href={`/admin/empreendimentos/${empreendimento.id}/edit`}>
            Editar
          </Link>
        </div>
      </div>

      <MidiasClient
        tenantSlug="flyimob"
        empreendimentoId={empreendimento.id}
        fotos={fotos}
        anexos={anexos}
      />
    </div>
  );
}
