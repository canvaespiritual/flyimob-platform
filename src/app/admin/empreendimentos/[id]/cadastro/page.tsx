import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import EmpreendimentoWizardNav from "../../../../../components/empreendimentos/EmpreendimentoWizardNav";

export default async function CadastroEmpreendimentoHubPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const { id } = await Promise.resolve(params);

  const tenant = await prisma.tenant.findUnique({ where: { slug: "flyimob" } });
  if (!tenant) return <div className="p-6">Tenant flyimob não encontrado.</div>;

  const emp = await prisma.empreendimento.findFirst({
    where: { id, tenantId: tenant.id },
    select: {
      id: true,
      name: true,
      slug: true,
      publicado: true,
      lat: true,
      lng: true,
      cidade: true,
      uf: true,
      bairro: true,
      tipo: true,
      _count: { select: { tipologias: true, anexos: true, fotos: true } },
    },
  });

  if (!emp) return <div className="p-6">Empreendimento não encontrado.</div>;

  const base = `/admin/empreendimentos/${emp.id}`;

  const okGeral =
    Boolean(emp.name) &&
    Boolean(emp.slug) &&
    Boolean(emp.tipo) &&
    emp.lat != null &&
    emp.lng != null;

  const okTipologias = emp._count.tipologias > 0;
  const okMidias = emp._count.fotos > 0 || emp._count.anexos > 0;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Cadastro do Empreendimento</h1>
          <div className="text-sm text-gray-600">
            <b>{emp.name}</b> • <span className="font-mono">{emp.slug}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {(emp.bairro ? `${emp.bairro} • ` : "")}
            {emp.cidade || "Cidade não informada"}
            {emp.uf ? `/${emp.uf}` : ""}
            {" • "}
            Tipo: {String(emp.tipo).replaceAll("_", " ")}
            {" • "}
            Publicado: {emp.publicado ? "Sim" : "Não"}
          </div>
        </div>

        <Link
          href="/admin/empreendimentos"
          className="border rounded px-4 py-2 hover:bg-gray-50"
        >
          ← Voltar
        </Link>
      </div>

      {/* Barra de etapas (clicável) */}
      <EmpreendimentoWizardNav empreendimentoId={emp.id} current="geral" />

      {/* Cards das etapas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StepCard
          title="1) Geral"
          status={okGeral ? "ok" : "pendente"}
          description="Dados principais, endereço e pinagem (geocode)."
          meta={[
            emp.lat != null && emp.lng != null ? "📍 Pin: OK" : "📍 Pin: pendente",
            emp.publicado ? "🟢 Publicado" : "⚪ Não publicado",
          ]}
          href={`${base}/edit`}
          cta={okGeral ? "Revisar" : "Completar"}
        />

        <StepCard
          title="2) Tipologias"
          status={okTipologias ? "ok" : "pendente"}
          description="Unidades, preços, área, quartos e regras de financiamento."
          meta={[
            `Tipologias: ${emp._count.tipologias}`,
          ]}
          href={`${base}/tipologias`}
          cta={okTipologias ? "Gerenciar" : "Adicionar"}
        />

        <StepCard
          title="3) Mídias"
          status={okMidias ? "ok" : "pendente"}
          description="Fotos (capa + galeria) e anexos (PDF, plantas, etc.)."
          meta={[
            `Fotos: ${emp._count.fotos}`,
            `Anexos: ${emp._count.anexos}`,
          ]}
          href={`${base}/midias`}
          cta={okMidias ? "Gerenciar" : "Adicionar"}
        />
      </div>

      {/* Ações rápidas */}
      <div className="mt-6 border rounded p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="text-sm text-gray-700">
          <b>Fluxo recomendado:</b> Geral → Tipologias → Mídias.  
          Depois, publique e confira no mapa + landing page pública.
        </div>

        <div className="flex gap-2">
          <Link
            className="border rounded px-3 py-2 hover:bg-gray-50"
            href={`/empreendimentos/${emp.slug}`}
            target="_blank"
          >
            Ver landing pública
          </Link>
          <Link
            className="border rounded px-3 py-2 hover:bg-gray-50"
            href="/"
            target="_blank"
          >
            Ver mapa
          </Link>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  title,
  status,
  description,
  meta,
  href,
  cta,
}: {
  title: string;
  status: "ok" | "pendente";
  description: string;
  meta: string[];
  href: string;
  cta: string;
}) {
  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{title}</div>
        <div
          className="text-xs px-2 py-1 rounded border"
          style={{
            borderColor: status === "ok" ? "rgba(31,182,178,0.5)" : "rgba(243,112,33,0.5)",
            color: status === "ok" ? "#0f766e" : "#b45309",
            background: status === "ok" ? "rgba(31,182,178,0.08)" : "rgba(243,112,33,0.08)",
          }}
        >
          {status === "ok" ? "OK" : "Pendente"}
        </div>
      </div>

      <div className="text-sm text-gray-700">{description}</div>

      <div className="text-xs text-gray-600 space-y-1">
        {meta.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>

      <div className="mt-auto pt-2">
        <Link
          href={href}
          className="inline-flex border rounded px-3 py-2 hover:bg-gray-50 text-sm"
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}
