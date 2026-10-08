# Auditoria dos filtros temporais do Pulmão — 08/10/2026

## Diagnóstico

As consultas ao PostgreSQL de produção, executadas em transação `REPEATABLE READ` com `SET TRANSACTION READ ONLY`, reproduziram os três períodos informados. Não foi encontrado defeito no recorte temporal do cálculo financeiro: o consumo do período muda corretamente; o acumulado permanece quando não existem novos gastos ou lançamentos até a nova data final.

| Período | Consumo do período | Consumo acumulado até o fim | Posição econômica acumulada |
|---|---:|---:|---:|
| 01/04/2026–20/04/2026 | R$ 35,55 | R$ 35,55 | −R$ 35,55 |
| 20/04/2026–05/05/2026 | R$ 0,00 | R$ 35,55 | −R$ 35,55 |
| 11/05/2026–11/05/2026 | R$ 0,00 | R$ 35,55 | −R$ 35,55 |

Esses valores pertencem a Gustavo Prado em BRL na operação `cmok2ywtp0001wjkkbqn61fob`, identidade `person:user:cmok2zc2o0007ny0p1fd12bge`. Há outra identidade de mesmo nome em outra operação; sua consulta não trouxe contas nem métricas. Os dados não foram combinados entre operações.

## Origem dos R$ 35,55

Conta: **Operação Goiás - flyimob**, `cmuv9pjr7000zpe0p7544caqq`, BRL, fuso cadastrado **America/Noronha**.

Campanha: **RIVA DC - que Deus abençoe**, ID interno `cmuv9vuhm0049pe0pn5hxlccj`, Meta `120243383586660751`.

| Data civil Meta | Registro MarketingDailyMetric | Investimento Meta | Consumo efetivo no relatório |
|---|---|---:|---:|
| 07/04/2026 | `cmuv9vuiu004hpe0pee78a3l4` | R$ 8,19 | R$ 9,19 |
| 08/04/2026 | `cmuv9vuje004jpe0pgkl7sgts` | R$ 11,89 | R$ 13,33 |
| 09/04/2026 | `cmuv9vujr004lpe0pqjxfopax` | R$ 8,91 | R$ 9,99 |
| 10/04/2026 | `cmuv9vuk3004npe0px4bk7mjh` | R$ 2,71 | R$ 3,04 |
| 12/04/2026 | `cmuv9vukg004ppe0pj8m8v0ar` | R$ 0,00 | R$ 0,00 |
| Total | | **R$ 31,70** | **R$ 35,55** |

Os snapshots originais possuem percentual 0 e effectiveSpend igual ao investimento Meta. O relatório aplica a correção histórica já existente da regra `cmuv9tocc002hpe0plbov96im`: **12,15% a partir de 05/04/2026**, com arredondamento monetário por dia. O evento `cmuvnqkqb0001mp0p7opjrihg` registra a alteração anterior do início de 05/10 para 05/04, motivo “erro inicial”, faixa afetada `[05/04,05/10)`. Portanto a diferença entre soma dos snapshots e relatório é explicada pelo overlay auditado `applyCostCorrections`, não por somatório duplicado, cache ou mudança nesta rodada.

A importação `cmuv9vlfc002lpe0pgn4pmcp7`, período 01/04–05/10, concluiu com `SUCCEEDED` em 05/10/2026 13:15:33.900 UTC. As observações acima são de 05/10/2026 13:15:22.510 UTC. Data de importação/observação não substitui a data civil do gasto.

Vigência responsável: `cmuzarzmj0407mm0pq405pen2`, Gustavo desde **01/01/2026**, sem fim nem cancelamento, criada em **08/10/2026 08:51:38.396 UTC**. Evento `cmuzarzmq0409mm0pkj74n73u`, `CAMPAIGN_RESPONSIBLE_ASSIGNED`, confirma pessoa e início histórico. O algoritmo respeita essa atribuição retroativa; não usa o cargo atual nem a data de criação do vínculo. Não há evidência de atribuição computacional incorreta nesse caso. A intenção comercial dessa vigência retroativa é uma decisão cadastrada da operação e não foi alterada pela auditoria.

Os aportes e ajustes confirmados acumulados de Gustavo até cada uma das três datas finais são zero. Assim, `0 + 0 − 35,55 = −35,55`.

## Fluxo dos filtros e semântica

1. `Filters` serializa FormData: `period=custom`, `from`, `to`, conta/pessoa/função opcionais. Datas HTML vêm em `YYYY-MM-DD`.
2. `LungView` consulta `/api/marketing/finance/lung?…` com `cache: no-store`. O efeito invalida respostas de consultas anteriores por cleanup `live=false`.
3. GET autentica, autoriza OWNER/DIRECTOR e encaminha `new URL(req.url).searchParams`. Resposta usa `Cache-Control: private, no-store`.
4. `period()` valida datas reais, ordem e intervalo máximo; não converte datas civis pela zona do navegador.
5. `marketingLung` consulta tenant e contas selecionadas em snapshot transacional. Busca histórico até o maior de hoje/data final para atender também caixa e conciliação atuais. **Não aplicar `gte: from` nessa busca:** isso apagaria aportes/gastos anteriores da posição acumulada.
6. `economicLedger` elimina movimentos/métricas posteriores a `to`; consumo/aportes do período exigem também `>= from`. Os limites do período são inclusivos. Vigência histórica responsável é `[validFrom,validTo)`; canceladas são excluídas na consulta.
7. Agrupamento é por identidade operacional canônica + moeda, limitado às contas filtradas. Custo efetivo utiliza regra/overlay por data. A posição é aportes confirmados + ajustes confirmados − consumo efetivo acumulado.

Datas do Insights são persistidas em `@db.Date`, representadas em UTC meia-noite como transporte da data civil. O recorte econômico não deve converter `2026-04-07` para 06/04 no fuso brasileiro. Caixa/observações/marcos físicos são timestamps e seguem o fuso da conta. A nova legenda formata strings civis diretamente em `DD/MM/YYYY`.

Caixa disponível e conciliação são atuais, independentes do período econômico; campanhas ativas também são contadas hoje. Esses comportamentos permanecem e a tabela agora explicita “Campanhas ativas hoje”.

## Correções locais

- Causa da ambiguidade visual: uma célula exibia `consumo do período / consumo acumulado`, tornando fácil interpretar o segundo valor como gasto do intervalo. Novo componente `FinancePositionTable` usa colunas distintas e títulos com a data final do acumulado. A legenda mostra o período **retornado pelo servidor**. Aportes e leads/CPL também foram separados para manter a leitura consistente.
- Defeito adicional comprovado pelo fluxo React: aplicar filtros idênticos fazia `setData(undefined)`, mas `setQuery(mesmaString)` não mudava dependência do efeito; nenhuma nova consulta era disparada e a tabela desaparecia. Cada aplicação agora incrementa o contador de atualização, inclusive quando a query é igual. O mesmo problema existia em Aportes no componente compartilhado e recebeu a mesma correção.
- Nenhuma alteração nos cálculos, aportes, marcos, saldos, snapshots, vigências ou migrations. Sem chamada à Meta. Sem commit, push ou deploy nesta rodada.

## Outros responsáveis, contas e moedas

Nos três períodos reais, a consulta da operação trouxe somente Gustavo com consumo não zero; demais responsáveis retornaram zero e Gustavo em USD retornou zero. Só a campanha/conta BRL identificada acima possui métricas anteriores a 11/05 nessa operação. Não foi observada mistura de moedas ou vazamento entre contas/identidades. Isso não certifica a completude histórica de contas sem importação; zero significa ausência de gasto confirmado no histórico disponível.

A ambiguidade de apresentação e o defeito de reaplicação são comuns à interface, portanto poderiam afetar qualquer responsável/conta/moeda. A regressão sintética inclui outra pessoa, USD, conta estrangeira, pessoa estrangeira, datas de fronteira, vigência semifechada e identidade histórica inativa.

## Validação

- Suíte Marketing + Documentações + Financeiro + Academy: **416 testes aprovados, zero falhas**, incluindo 13 novas regressões.
- Regressões de períodos: os três intervalos informados, 07/04 e 08/04 isolados, 09–10/04, período anterior aos gastos, extremos inclusivos e exclusão de registros futuros.
- Regressões de aportes/ajustes anteriores ao início, regra de custo corrigida com arredondamento diário sem reescrita, isolamento por conta/pessoa/moeda, renderização real React da tabela e GET autenticado com datas/Cache-Control, inclusive query repetida.
- Prisma validate/generate, TypeScript e ESLint dos arquivos envolvidos: aprovados.
- Build de produção: aprovado, incluindo compilação, checagem TypeScript e geração das páginas. Avisos existentes de convenção middleware, baseline-browser-mapping e configuração Prisma não impediram o build.

Não foi realizado teste com sessão real do navegador de produção. O percurso HTTP foi validado com autenticação e dados sintéticos, e o serviço de consulta com dados reais em transação somente leitura. O defeito de reaplicação foi comprovado por inspeção das dependências React; não há teste de montagem interativa do hook.

Para reconsultar a evidência: `node --import tsx scripts/marketing-lung-audit.ts`. O script somente seleciona campos financeiros/de identificação necessários e não projeta credenciais. O banco rejeita qualquer escrita dentro dessa transação.

Após eventual publicação autorizada, conferir os três períodos com Gustavo/conta Goiás, observar colunas separadas e reaplicar o mesmo filtro duas vezes. A tabela deve continuar disponível; o acumulado deve permanecer 35,55 e somente o consumo do período deve zerar nos dois últimos intervalos.
