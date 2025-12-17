import EmpreendimentoGeocode from "../../empreendimentoGeocode";

import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import EmpreendimentoWizardNav from "../../../../../components/empreendimentos/EmpreendimentoWizardNav";

export default async function EditEmpreendimentoPage(
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(params);

  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;

  const construtoras = await prisma.construtora.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });

  const empreendimento = await prisma.empreendimento.findFirst({
    where: { id, tenantId: tenant.id },
    select: {
      id: true,
      name: true,
      slug: true,
      tipo: true,
      endereco: true,
      bairro: true,
      cidade: true,
      uf: true,
      cep: true,
      descricao: true,
      dataLancamento: true,
      dataEntrega: true,
      contatoNome: true,
      contatoTelefone: true,
      contatoWhatsapp: true,
      construtoraId: true,
      lat: true,
      lng: true,
      publicado: true,
    },
  });

  if (!empreendimento) return <div className="p-6">Empreendimento não encontrado.</div>;

  const TIPOS = [
    "CONDOMINIO_VERTICAL",
    "CONDOMINIO_CASAS",
    "CONDOMINIO_LOTES",
    "LOTEAMENTO",
    "APARTAMENTO",
    "CASA",
    "LOTE",
    "COMERCIAL",
    "GALPAO",
    "AREA",
    "FAZENDA",
    "OUTRO",
  ] as const;

  const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Editar Empreendimento</h1>
          <div className="text-sm text-gray-600">
            <b>{empreendimento.name}</b> • <span className="font-mono">{empreendimento.slug}</span>
          </div>
        </div>

        <Link href="/admin/empreendimentos" className="border rounded px-4 py-2 hover:bg-gray-50">
          ← Voltar
        </Link>
      </div>

      {/* WIZARD NAV + BOTÕES (usa o form id="empreendimento-form") */}
      <EmpreendimentoWizardNav
        empreendimentoId={empreendimento.id}
        current="geral"
      />

      <form
        id="empreendimento-form"
        action="/api/empreendimentos/update"
        method="post"
        className="space-y-4"
      >
        <input type="hidden" name="tenantSlug" value="flyimob" />
        <input type="hidden" name="id" value={empreendimento.id} />

        <div className="space-y-2">
          <label className="text-sm font-medium">Nome*</label>
          <input
            name="name"
            defaultValue={empreendimento.name}
            className="border rounded px-3 py-2 w-full"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Slug (travado)</label>
          <input
            name="slug"
            defaultValue={empreendimento.slug}
            className="border rounded px-3 py-2 w-full bg-gray-50"
            readOnly
          />
          <div className="text-xs text-gray-500">
            No MVP vamos manter o slug travado para não quebrar links.
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Tipo*</label>
          <select
            name="tipo"
            className="border rounded px-3 py-2 w-full"
            defaultValue={String(empreendimento.tipo)}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <EmpreendimentoGeocode
          initialEndereco={empreendimento.endereco || ""}
          initialLat={empreendimento.lat}
          initialLng={empreendimento.lng}
          initialBairro={empreendimento.bairro || ""}
          initialCidade={empreendimento.cidade || ""}
          initialUf={empreendimento.uf || ""}
          initialCep={empreendimento.cep || ""}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium">Construtora</label>
          <select
            name="construtoraId"
            className="border rounded px-3 py-2 w-full"
            defaultValue={empreendimento.construtoraId ?? ""}
          >
            <option value="">Sem construtora (revenda/particular)</option>
            {construtoras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Descrição (opcional)</label>
          <textarea
            name="descricao"
            defaultValue={empreendimento.descricao ?? ""}
            className="border rounded px-3 py-2 w-full min-h-[120px]"
            maxLength={1000}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Data de lançamento (opcional)</label>
            <input
              name="dataLancamento"
              type="date"
              defaultValue={toDateInput(empreendimento.dataLancamento)}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Data de entrega (opcional)</label>
            <input
              name="dataEntrega"
              type="date"
              defaultValue={toDateInput(empreendimento.dataEntrega)}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Contato (nome)</label>
            <input
              name="contatoNome"
              defaultValue={empreendimento.contatoNome ?? ""}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Telefone</label>
            <input
              name="contatoTelefone"
              defaultValue={empreendimento.contatoTelefone ?? ""}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">WhatsApp</label>
            <input
              name="contatoWhatsapp"
              defaultValue={empreendimento.contatoWhatsapp ?? ""}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            name="publicado"
            defaultChecked={empreendimento.publicado}
          />
          Publicar no mapa
        </label>

        {/* Botão “Salvar alterações” pode ficar, mas agora o Wizard já tem os botões principais */}
        <button className="border rounded px-4 py-2 hover:bg-gray-50">
          Salvar alterações
        </button>
      </form>
    </div>
  );
}
