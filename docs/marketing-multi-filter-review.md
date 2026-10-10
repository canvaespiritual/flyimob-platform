# Revisão dos filtros múltiplos de Marketing — 10/10/2026

## Escopo e contrato

Visão geral, Campanhas, Desempenho, Aportes e Pulmão reutilizam `multi-filter.tsx`. Busca, caixas de seleção, selecionar todas, limpar e resumo compacto. Alterar a seleção não consulta novamente até aplicar os filtros. “Todas (sem restrição)” e limpar omitem os IDs; selecionar todas marca explicitamente as opções disponíveis. Os formulários de cadastro permanecem individuais. O filtro de campanha única da Visão geral permanece fora do escopo.

APIs preservam os nomes anteriores (`accountId`, `brokerId`, `personId`) e aceitam chaves repetidas. IDs são deduplicados e validados contra a operação. OR dentro de cada conjunto; AND entre contas, responsáveis e demais filtros. “Não atribuídas” pode ser combinada com pessoas. Identidades históricas e suas vigências conservam o tratamento existente. As moedas continuam separadas.

No Pulmão, os movimentos e métricas completos das contas selecionadas alimentam o razão e a conciliação física. Só depois são filtradas as posições individuais. Selecionar responsáveis não modifica caixa Meta, consumo físico, entradas físicas ou posição institucional das contas.

## Validação

- 248 testes focados aprovados: seleção múltipla, permissões, desempenho, gráficos, finanças, financiamentos, fundamentos, correções históricas, equipe e integração Meta simulada.
- Prisma validate, TypeScript, lint dos arquivos alterados e build Next aprovados.
- Lint geral encontrou 124 erros e 36 avisos fora dos arquivos alterados; não foram feitas correções em outros módulos.
- Pré-publicação: comparação programática com os conteúdos de `HEAD` confirmou os mesmos 124 erros e 36 avisos na base, zero erros/avisos nos 18 arquivos de código/testes afetados. Repositório `canvaespiritual/flyimob-platform`, branch `main`, sincronizada com o remoto; 37 migrations aplicadas, nenhuma pendente ou falha; aporte histórico confirmado da Laura presente, tudo consultado em READ ONLY.
- Revisão visual local autenticada das cinco abas; Desempenho com três contas/três responsáveis, busca, selecionar todas, limpar e combinação vazia; Pulmão com uma conta e três responsáveis. Nenhum formulário financeiro ou ação Meta foi enviado.
- 56 verificações PostgreSQL em transação explicitamente READ ONLY / RepeatableRead na operação com 20 contas e 13 pessoas: nove combinações (uma/três/todas contas × uma/três/todas pessoas), gastos Meta e leads por SQL direto versus Visão geral e Desempenho, carregamento de Campanhas e Aportes, igualdade dos dados completos das contas do Pulmão antes/depois do filtro de pessoas e fingerprint SHA-256 dos movimentos financeiros preservado.

O procedimento de leitura é reproduzível por `node --import tsx scripts/marketing-multi-filter-verify.ts`. Precisa de uma operação com dados, owner e ao menos três contas/pessoas. Não chama a Meta nem serviços de escrita. Nos testes unitários, cenários sintéticos cobrem moedas, históricos, combinações vazias e IDs parcialmente externos.

Não houve migration, alteração de lançamentos, campanhas ou permissões, commit, push ou deploy.

## Arquivos

- Interface: `src/app/admin/marketing/{ui,finance-ui,performance-ui,multi-filter}.tsx`.
- Consultas e seleção: `src/lib/marketing/{queries.server,finance-queries.server,metrics.server,performance.server,performance,filter-selection}.ts`.
- Regressões e adaptação dos fixtures: `tests/marketing/{multi-filter,finance,foundation,meta,team,cost-corrections,performance-access}.test.ts`.
- Conferência PostgreSQL: `scripts/marketing-multi-filter-verify.ts`.
- Este relatório. O arquivo preexistente `scripts/correct-vitoria-sale.cjs` permanece intocado e fora do escopo.
