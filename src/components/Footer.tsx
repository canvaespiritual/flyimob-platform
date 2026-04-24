export function Footer() {
  return (
    <footer className="bg-[#0f141a] text-neutral-400 text-sm border-t border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">

        <div className="text-white font-semibold text-lg">
          FlyImob
        </div>

        <div>
          ATACADÃO IMÓVEIS LTDA<br />
          CNPJ: 22.846.405/0001-88<br />
          Goiânia - GO
        </div>

        <div className="flex gap-4 flex-wrap">
          <a href="/politica-de-privacidade" className="hover:text-white">
            Política de Privacidade
          </a>

          <a href="/termos-de-uso" className="hover:text-white">
            Termos de Uso
          </a>
        </div>

        <div className="text-xs text-neutral-500">
          Este site coleta dados para atendimento imobiliário e simulação de crédito.
          A aprovação está sujeita à análise das instituições financeiras.
        </div>

      </div>
    </footer>
  );
}