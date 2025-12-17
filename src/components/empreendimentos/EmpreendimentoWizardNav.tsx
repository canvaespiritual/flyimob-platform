"use client";

type Step = "geral" | "tipologias" | "midias";

export default function EmpreendimentoWizardNav({
  empreendimentoId,
  current,
}: {
  empreendimentoId: string;
  current: Step;
}) {
  const base = `/admin/empreendimentos/${empreendimentoId}`;

  function go(path: string) {
    window.location.href = path;
  }

  return (
    <div className="border-b mb-6 pb-3 flex items-center justify-between">
      {/* Etapas */}
      <div className="flex items-center gap-4 text-sm">
        <StepItem
          label="Geral"
          active={current === "geral"}
          onClick={() => go(`${base}/edit`)}
        />
        <span>→</span>
        <StepItem
          label="Tipologias"
          active={current === "tipologias"}
          onClick={() => go(`${base}/tipologias`)}
        />
        <span>→</span>
        <StepItem
          label="Mídias"
          active={current === "midias"}
          onClick={() => go(`${base}/midias`)}
        />
      </div>

      {/* Ações rápidas */}
      <div className="flex gap-2">
        {current !== "geral" && (
          <button
            type="button"
            onClick={() => go(`${base}/edit`)}
            className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
          >
            Voltar ao Geral
          </button>
        )}

        {current === "geral" && (
          <>
            <button
              type="submit"
              form="empreendimento-form"
              className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
            >
              Salvar
            </button>

            <button
              type="submit"
              form="empreendimento-form"
              onClick={() =>
                setTimeout(() => go(`${base}/tipologias`), 100)
              }
              className="border rounded px-3 py-1 text-sm bg-gray-900 text-white"
            >
              Salvar e ir para Tipologias
            </button>

            <button
              type="submit"
              form="empreendimento-form"
              onClick={() =>
                setTimeout(() => go(`${base}/midias`), 100)
              }
              className="border rounded px-3 py-1 text-sm bg-gray-700 text-white"
            >
              Salvar e ir para Mídias
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StepItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-medium ${
        active ? "text-black" : "text-gray-400 hover:text-black"
      }`}
    >
      {label}
    </button>
  );
}
