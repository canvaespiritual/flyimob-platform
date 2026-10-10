# Desempenho de Marketing — implementação local, 10/10/2026

## Auditoria e reaproveitamento

- Layout e sessão administrativos existentes; acesso OWNER/DIRECTOR, operação não plataforma. Elegibilidade comercial não concede acesso ao painel.
- Meta Graph v26.0: OAuth, contas selecionadas, paginação, leases/retries, sincronização inicial mês anterior + atual e reconciliação últimos sete dias + hoje permanecem intactos.
- A fonte do relatório é exclusivamente MarketingDailyMetric (campanha/dia). MarketingAdDailyMetric não é somada, evitando duplicação dos mesmos gastos.
- Conversas/leads continuam exclusivamente `onsite_conversion.messaging_conversation_started_7d`. Não há integração CRM/Flyhub nessa medida.
- CampaignBrokerAssignment: início inclusivo, fim exclusivo e vínculos cancelados excluídos. OperationPerson sem login e responsáveis históricos inativos permanecem identificáveis. Identidades mescladas usam a resolução canônica existente.
- Snapshot effectiveSpend e overlay applyCostCorrections reutilizados. Não reaplicamos 12,15% sobre um valor que já inclui a regra histórica.
- Cache HTTP privado/no-store existente. Consulta única em snapshot RepeatableRead, sem chamadas ao provedor; limite de 100 mil registros por consulta. Nenhuma nova dependência, tabela ou migration.
- Auditoria real somente de leitura: 1.166 métricas diárias confirmadas BRL entre 07/04/2026 e 10/10/2026; 1.166 registros de anúncios; 60 vínculos históricos, cinco encerrados. Contagens da base, não promessa de cobertura integral de cada operação/conta.

## Implementação

Rota `/admin/marketing/desempenho` e GET `/api/marketing/performance`.
Quatro visões (o escopo listava três, mas inclui explicitamente Corretores como quarta):

1. Evolução diária/acumulada, SVG interativo por teclado/cursor, dois eixos, tabelas de cobertura, indicadores e seletor de gasto Meta/custo efetivo.
2. Comparação ativável, linhas tracejadas, diferenças absolutas/percentuais de gasto, leads e CPL. Base zero/CPL ausente não produz percentual artificial.
3. Dias da semana no calendário local das contas; horários com limitação explícita.
4. Responsáveis com indicadores, variações e evolução semanal/mensal, inclusive período anterior e campanhas sem vínculo. Seleção múltipla no filtro compartilhado.

Filtros semana (últimos sete dias, padrão já existente), mês até hoje, mês anterior completo e personalizado. Conta, moeda e um/vários responsáveis. Todas as moedas permanecem separadas, sem câmbio implícito. Atalhos usam o fuso da conta quando selecionada e America/Sao_Paulo no consolidado. Datas das métricas já representam o dia local do anunciante; não reconvertemos o campo SQL DATE em um instante UTC.

Comparação: intervalo equivalente imediatamente anterior; quando a seleção vai do primeiro dia a um dia do mesmo mês, usa o mês anterior até esse dia, limitado ao último dia disponível. Mês completo compara mês completo. Datas e diferença de duração ficam explícitas.

Cobertura: conta/dia precisa estar coberta por execução SUCCEEDED; dia atual permanece parcial. Registros FAILED/MISSING são contados separadamente. Não ter uma linha de gasto não prova zero sem cobertura. Totais/parciais usam apenas linhas confirmadas; gráficos mostram registros conhecidos e interrompem a linha em dias desconhecidos. Acumulado representa subtotal confirmado, com aviso de cobertura. Todas as contas selecionadas precisam ter cobertura para que o consolidado seja considerado completo; contas descobertas sem sincronização podem manter o aviso conservador.

## Horários: investigação e limitação

O [SDK oficial da Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py) enumera `hourly_stats_aggregated_by_advertiser_time_zone` e `hourly_stats_aggregated_by_audience_time_zone`. Isso confirma a existência dos breakdowns, mas não comprova que a ação específica de conversas seja suportada na combinação requerida.

A [documentação oficial de breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/) retornou HTTP 429 durante a pesquisa. A investigação tentou preparar uma sondagem de até dois GETs em uma campanha, sem escrita, mas o ambiente local não possui META_APP_ID, META_APP_SECRET, META_CREDENTIAL_KEY_V1 e META_LOGIN_CONFIG_ID. Nenhum GET à Meta foi realizado e nenhuma secret de produção foi alterada. Portanto **não afirmamos que a Meta proíbe essa combinação**: a disponibilidade para a ação de mensagens permanece não confirmada.

Não foi criada sincronização horária nem estimativa histórica. Antes de habilitar essa coleta, validar GET Insights com o breakdown do anunciante + spend/actions na versão da integração e em uma conta autorizada; distinguir ações omitidas de zero, validar cobertura e timezone e persistir observações idempotentes numa estrutura adicional isolada. Não usar o fuso da audiência como horário da conta. Resultado atribuído por hora não é o instante de chegada de conversa no WhatsApp. Essa parte permanece pendente de validação do provedor, explicitamente apresentada na interface.

## Segurança e preservação

Todas as consultas têm tenantId; relações de campanhas/vínculos também. Conta/responsável externos à operação retornam 404. Moeda e datas são validadas. Nenhum endpoint de escrita novo. Portal de corretor não criado: a consulta oferece enforcedPersonId exclusivamente como argumento confiável de backend, nunca campo HTTP, rejeitando filtros que ultrapassem esse escopo. Uma futura rota do portal deverá resolver essa identidade a partir da sessão e aplicar sua própria autorização; a rota atual continua administrativa.

Pulmão, aportes, financiamentos, bonificações, liquidações, Meta e lançamentos não foram alterados. Não houve commit, push ou deploy.

## Como validar visualmente

- Iniciar a aplicação local e entrar como OWNER ou DIRECTOR; Marketing → Desempenho.
- Evolução: selecionar período com dados, variar conta/responsável, alternar custo Meta/efetivo e diário/acumulado. Cursor/Tab consultam valores. Abrir dados diários; verificar gaps e aviso nos dias sem cobertura.
- Comparação: ativar/desativar e comparar semana, mês até hoje, mês completo e dia único; conferir as datas anteriores, linhas tracejadas e diferenças. Base zero deve ser não calculável.
- Dias e horários: conferir totais por dia da semana e o aviso de indisponibilidade por hora; nenhum lead horário fictício.
- Corretores: escolher vários responsáveis com Ctrl, abrir cada cartão e evoluções semanais/mensais atuais/anteriores; selecionar Sem responsável; testar alguém com vínculo encerrado/inativo em um período histórico.
- Verificar vazio, conta/moeda sem dados, período de hoje e erro de filtro. Um BROKER não recebe acesso ao módulo administrativo.

## Validação

40 testes focados aprovados: 23 de cálculos/escopos, dois de renderização de gráfico e 15 regressões de correção histórica. TypeScript e lint dos arquivos alterados aprovados. Build final aprovado (179 páginas, incluindo as duas rotas novas); Prisma generate aprovado pelo build. Nenhuma suíte completa foi repetida. A renderização dos gráficos foi verificada por SSR; navegação visual autenticada completa ainda precisa ser realizada localmente seguindo os passos acima.

Smoke real em transação READ ONLY na operação com histórico: 01–20/04: gasto Meta 31,70, efetivo 35,55 e 33 leads; 11/05: zero registros, sem cobertura confirmada; 01–10/10: gasto Meta 765,01, efetivo 857,94 e 244 leads. São observações no momento da consulta, não dados inseridos pelo teste. Todos os períodos foram corretamente marcados como cobertura incompleta no consolidado.

## Arquivos

Alterado: `src/app/admin/marketing/layout.tsx` (somente link da nova aba).

Criados:

- `src/lib/marketing/performance.ts`: cálculos, intervalos e escopo.
- `src/lib/marketing/performance.server.ts`: consulta consistente, isolamento e correções históricas.
- `src/app/api/marketing/performance/route.ts`: GET administrativo.
- `src/app/admin/marketing/desempenho/page.tsx`: página.
- `src/app/admin/marketing/performance-ui.tsx`: filtros, indicadores e visões.
- `src/app/admin/marketing/performance-chart.tsx`: gráfico reutilizável.
- `src/app/admin/marketing/performance-broker.tsx`: evolução por responsável.
- `tests/marketing/performance.test.ts`: regressões e autorização.
- `tests/marketing/performance-chart.test.ts`: renderização acessível e casos vazios.
- `docs/marketing/desempenho.md`: este relatório.

O arquivo preexistente e não relacionado `scripts/correct-vitoria-sale.cjs` foi preservado sem execução ou alterações. Scripts temporários de auditoria somente de leitura foram removidos.

## Revisão final antes da publicação

- Defeito comprovado e corrigido: vários pontos isolados por lacunas podiam desaparecer no SVG. A regressão falhou antes da correção (zero círculos em vez de quatro) e passou depois; os dias desconhecidos continuam sem linhas de conexão.
- 107 testes focados aprovados: Desempenho, gráficos, acesso ao endpoint, custos históricos e regressões existentes de Aportes/Pulmão. TypeScript pelo build final, lint dos arquivos revisados e build aprovados. Nenhuma suíte completa da plataforma foi repetida.
- Cinco combinações reais, em transação READ ONLY, conferidas contra a Visão geral e a soma dos agrupamentos. Nos casos sem filtro de responsável, gasto Meta e leads também coincidiram com agregação direta do banco. O responsável selecionado teve seis registros confirmados; a conta selecionada teve 67. O fingerprint dos movimentos financeiros permaneceu idêntico antes/depois.
- A rota anônima local redirecionou para login, preservando returnTo. Sessões simuladas exclusivamente nos testes confirmaram 401 para anônimo e 403 para papéis sem acesso. Contas/pessoas externas à operação são rejeitadas antes da leitura de gastos.
- Navegação autenticada interativa ainda pendente: o navegador interno não possui sessão local válida. A primeira tentativa exibiu erro de login; após reiniciar o servidor local com acesso ao banco, o formulário permanece pedindo credenciais. Nenhuma senha ou configuração de autenticação foi alterada.
- Limitação horária continua explícita e conhecida; não foi criada sincronização adicional nesta revisão.

Parecer enquanto faltar a validação interativa autenticada: **EXISTEM PENDÊNCIAS**. Não foram encontrados outros bloqueios de cálculo, isolamento ou compatibilidade nos checks executados. Sem commit, push, migration ou deploy.

## Aprovação para publicação

O usuário confirmou pessoalmente a navegação autenticada e a interface visual da aba e autorizou commit, push e deploy da implementação, correções e testes. A pendência de validação interativa acima foi resolvida por essa confirmação. Não há migration nesta publicação. A análise horária permanece explicitamente indisponível na versão atual.
