# Marketing Meta V1 — implementação e ativação

Data: 05/10/2026. Evolução da fundação existente; nenhuma alteração em CRM, Documentações, Financeiro ou Academy. Não houve commit, push ou deploy.

## Estado real desta entrega

Código implementado e migration `20261005010000_marketing_meta_v1` aplicada ao PostgreSQL configurado. Autorização operacional **pendente**: App ID, App Secret, configuração de Login para Empresas e chave de criptografia ainda não foram preenchidos. Nenhum token antigo foi procurado ou reutilizado. Nenhuma conta/campanha/métrica real da Meta foi importada nesta rodada. Os testes de integração usam credenciais aleatórias sintéticas e respostas simuladas; o teste no PostgreSQL usa rollback obrigatório.

## Variáveis: nome = origem do valor

Os nomes foram preparados em `.env.local`, ignorado pelo Git. Replicar no serviço Railway somente quando for ativar a versão revisada. Não colocar token de usuário em variável global.

| Variável | Valor / origem |
| --- | --- |
| `META_APP_ID` | ID do app **Flyimob Marketing**, em Meta for Developers → app → Configurações do app / Settings → Básico / Basic → App ID. Não foi fornecido; campo local vazio. |
| `META_APP_SECRET` | App Secret do mesmo app, no mesmo painel → Mostrar / Show. Configurar diretamente no servidor, nunca no chat. Campo local vazio. |
| `META_LOGIN_CONFIG_ID` | ID de uma configuração de **Facebook Login for Business**, criada para autorização por usuário, com `ads_read` e contas de anúncios. Campo local vazio. Não é App ID, ID da BM ou da conta de anúncios. |
| `META_OAUTH_REDIRECT_URI` | `https://flyimob.com/api/integrations/meta/callback`, definido pelo proprietário da plataforma nesta conversa. Já preparado localmente. |
| `META_CREDENTIAL_KEY_V1` | Chave criptograficamente aleatória de **32 bytes**, codificada em base64, gerada uma vez em ambiente seguro e guardada no gerenciador de secrets do serviço. Campo local vazio. |

Exemplo de comando para o administrador gerar a chave no próprio terminal seguro: `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"`. Não executar em pipeline com logs públicos. Não rotacionar essa variável isoladamente: as credenciais existentes dependem da chave. Uma futura versão de chave precisa manter leitura da anterior durante a recriptografia. Atualmente a implementação aceita `v1`; reconexão substitui a credencial de uma conexão sem remover seu histórico.

`SESSION_SECRET` e `DATABASE_URL` já pertencem à infraestrutura existente. Não foram copiadas para este documento. Não existe `META_ACCESS_TOKEN` global.

## Configuração manual no app Meta

Abrir [Meta for Developers — apps](https://developers.facebook.com/apps/) e selecionar **Flyimob Marketing**, sem criar outro app por BM.

1. Em **Settings / Configurações do app → Basic / Básico**: conferir App ID e App Secret; **App Domains = `flyimob.com`**. A plataforma Website deve usar **Site URL = `https://flyimob.com`**. Conferir os campos de política de privacidade, termos e exclusão de dados exigidos pela Meta antes de disponibilizar o app a terceiros; não foram alterados nesta rodada.
2. Abrir/adicionar o produto **Facebook Login for Business / Login do Facebook para Empresas**. Em **Settings / Configurações**, habilitar **Client OAuth Login**, **Web OAuth Login** e HTTPS. Em **Valid OAuth Redirect URIs / URIs de redirecionamento OAuth válidos**, registrar exatamente **`https://flyimob.com/api/integrations/meta/callback`**, sem barra final.
3. Em **Configurations / Configurações** do Login para Empresas, criar uma configuração de autorização com **token de acesso de usuário** e a permissão **`ads_read`**, incluindo as contas de anúncios apropriadas. Copiar seu **Configuration ID** para `META_LOGIN_CONFIG_ID`. Não escolher token de system user para este fluxo: a implementação verifica `/me/permissions`, identifica `/me` e troca token de usuário por duração estendida. Não acrescentar `ads_management`.
4. Para o teste inicial em modo de desenvolvimento, usar uma pessoa com papel permitido no app e acesso de análise às contas. O acesso de usuários externos pode exigir modo Live, revisão/acesso avançado de `ads_read`, verificação empresarial e os requisitos que o painel indicar. A validação manual anterior no Graph API Explorer não comprova que essas condições de OAuth estejam prontas.
5. Após configurar secrets e disponibilizar o código sob a URL pública, executar **Marketing → Configurações → Conectar Meta**, criar um nome e usar **Conectar Meta** na conexão. O usuário autoriza diretamente na Meta, sem entregar senha ao Flyimob. Selecionar as contas descobertas e usar **↻ Atualizar** na Visão geral.

As páginas oficiais [fluxo manual OAuth](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) e [Login para Empresas](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/) retornaram HTTP 429 durante a consulta desta rodada. Os nomes de menus acima são os campos esperados para o produto; ainda precisam ser conferidos no painel privado do app existente, que não foi acessado. Não foi inventado App ID/config ID. A versão **v26.0** também consta no [SDK oficial da Meta](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/api.js). A [coleção oficial da Meta](https://www.postman.com/meta/facebook-marketing-api/request/u07tack/get-ad-insights-l1) confirma leitura de Insights com spend, impressões, cliques/actions e Bearer Token.

## OAuth e credenciais

`POST /api/marketing/meta/connect` é OWNER-only. Gera state aleatório de 256 bits, guarda somente SHA-256 com tenant, ator, conexão, versão e validade de 10 minutos. Um cookie HttpOnly/Secure/SameSite=Lax vincula o retorno ao navegador. Callback exige sessão válida do OWNER e consumo único do state. Recusas, replay, expiração e troca de sessão não substituem credenciais existentes.

Código e tokens são trocados no backend. A conexão recebe envelope AES-256-GCM com nonce aleatório, tag e AAD vinculando tenant/conexão/versão da chave. Não há token em resposta administrativa, auditoria, documentação ou logs do módulo. O único dado OAuth devolvido ao frontend no início é a URL de autorização com state; nunca access token ou App Secret. A callback redireciona para URL fixa com resultado seguro e `Referrer-Policy: no-referrer`.

Reconexões fazem compare-and-swap de `credentialVersion`, preservando contas, seleção, campanhas, métricas e atribuições. A validade do token estendido é persistida. Não há refresh token genérico: expiração/revogação exige **Reconectar Meta**. A configuração deve emitir tokens de usuário com `expires_in`; ausência de validade verificável não é aceita como autorização permanente.

## Descoberta, seleção e ingestão

- `/me/adaccounts`: ID canônico `account_id` (sem `act_`), nome, `account_status`, moeda, timezone e business mínimo quando informado. Deduplicação por tenant + ID externo, mesmo se várias conexões enxergarem a conta. Somente após concluir todas as páginas os vínculos ausentes tornam-se inacessíveis; falhas preservam a descoberta anterior. Contas novas começam não selecionadas.
- Contas acompanhadas: vínculo `MetaConnectionAccount.selected`, acesso disponível, autorização válida, acompanhamento ACTIVE e `account_status=1`. Contas com status diferente/desconhecido permanecem visíveis e históricas, mas não entram no sync. Valores desconhecidos aparecem explicitamente na interface. Uma reconexão/descoberta não apaga seleção.
- `/act_<id>/campaigns`: ID estável, nome, status/effective_status, criação e horário de sync. Rename atualiza a mesma campanha; não altera finalidade, acompanhamento ou corretor. Version increment invalida edição administrativa aberta antes da importação.
- `/act_<id>/ads`: somente IDs de anúncio, campanha, ad set e creative. Sem binários, públicos, targeting ou dados pessoais.
- `/act_<id>/insights`: `level=campaign` e `level=ad`, `time_range` explícito, `time_increment=1`, spend/impressões/cliques/actions/datas/IDs. O contrato de leitura por campanha é obtido por `level=campaign` na conta, evitando uma requisição por campanha. IDs desconhecidos de campanhas históricas são aceitos somente se já houver campanha daquela conta no banco; caso contrário o sync falha com segurança.

**Conversas iniciadas / Leads Meta = `onsite_conversion.messaging_conversation_started_7d`**, conforme teste manual do usuário. `link_click` fornece somente cliques no link. Não existe fallback para depth, post_engagement ou total_messaging_connection. Uma resposta válida sem a action produz zero; erro, linha inválida, ausência de resposta ou página interrompida não vira zero. A V1 conserva somente os valores das actions usados (conversas e cliques no link), sem payload bruto indiscriminado.

## Sincronização, concorrência e falhas

OWNER: botão **↻ Atualizar** chama `POST /api/marketing/sync`, cria/reutiliza tarefas persistidas e processa contas selecionadas, uma vez por conta canônica. DIRECTOR pode filtrar/classificar/atribuir, mas não configurar/autorização/sync. Primeiro sync importa desde o primeiro dia do mês anterior até hoje no timezone da conta. Sync seguinte reconcilia 7 dias anteriores + hoje. Configurações oferece backfill de intervalo explícito, limitado a 367 dias.

Claim por lease + índice único de execução RUNNING por tenant/conta; recuperação após 10 minutos. Paginação completa e validação precedem a transação de escrita. No commit, o worker bloqueia a tarefa e verifica lease, versão/autorização, seleção e conta. Todos os dados da conta e o sucesso são confirmados atomicamente, com isolamento Serializable. Falha durante a leitura não deixa campanhas ou métricas parcialmente substituídas.

Valor diário é **substituído**, não somado: 18 → 31 termina em 31. Observações antigas não regressam as novas. Snapshot da regra de custo permanece estável; gasto Meta permanece original. Linha válida com zero é CONFIRMED; linha ausente não apaga um dado anterior. Dias sem linha não são fabricados como zero.

Rate limits e falhas temporárias ficam PENDING com backoff exponencial e até 5 tentativas. Botão posterior retoma tarefas elegíveis. Falha de autenticação (190) invalida a conexão; erro de acesso a conta (10/200) torna o vínculo inacessível, sem invalidar silenciosamente outras contas. Nova descoberta pode restaurar o acesso. Timeout de 30s por requisição, nenhum redirect HTTP de dados, limite de 1000 páginas / 100 mil objetos por leitura. Request handler é limitado a 300s e transação a 120s; grandes volumes podem precisar de processamento segmentado em etapa futura. Execução interrompida é recuperável pelo lease; não há promessa de conclusão de grandes contas dentro de uma única requisição.

Worker persistente de passagem única disponível: `node --import tsx scripts/marketing-worker.ts`. Processa até 100 contas com tarefas já pendentes/elegíveis e recupera leases vencidos. Pode ser agendado como serviço Railway dedicado; **nenhum serviço/cron foi criado nem ativado nesta rodada**. Sem esse agendamento, retentativas exigem novo clique. Um sync de uma conta pode falhar enquanto outras concluem; a UI informa o resultado por tentativa e mantém os dados anteriores.

## Dashboard e grid

Filtros consultam PostgreSQL; não chamam Meta. Hoje, ontem, 7 dias, mês atual, anterior e personalizado. Conta específica usa seu timezone nos atalhos; visão de várias contas usa calendário administrativo America/Sao_Paulo e conserva as datas locais da origem. Moedas são separadas, sem FX. Hoje é parcial até última atualização; o horário exibido é administrativo de São Paulo. A última sincronização bem-sucedida da conta (ou a mais recente entre as contas do tenant) aparece mesmo quando a resposta válida de Insights foi vazia; não representa atualização simultânea de todas as contas.

Colunas: campanha, corretor vigente nos dias do período, conta, finalidade, status Meta, gasto Meta, gasto efetivo, acréscimo, conversas, CPL Meta, CPL efetivo, impressões, cliques, cliques no link, CPC e CPM. Quando o período inclui corretores diferentes na mesma campanha, a célula lista os nomes; os totais por corretor usam a vigência diária. BigInt de delivery é serializado como string, sem perda de precisão.

Derivados em Decimal, sem persistência extra: CPL Meta = bruto/conversas; CPL efetivo = efetivo/conversas; CPC = bruto/cliques; CPM = bruto/impressões × 1000; denominador zero ou delivery indisponível = `—`. Acréscimo = efetivo − bruto.

Presets Gestão diária, Aquisição, Financeiro e Completa; restaurar padrão; seleção e ordem por setas. Preferência localStorage em chave **tenant + usuário + versão**, apenas nomes/ordem/preset, sem dados empresariais ou credenciais. Não acompanha o usuário em outro navegador/dispositivo; evolução futura pode migrar para tabela por usuário.

## Criativos e consolidação futura

`MarketingAdDailyMetric` mantém tenant/campanha, ad set externo, anúncio externo, creative externo quando disponível, dia/moeda/gasto/conversas/observação/task. Identidade única anúncio/dia, ligada a campanha e task com FKs compostas por tenant. Não somar esses registros ao total campanha/dia: são granularidades alternativas.

Creative ID é a identidade devolvida pelo anúncio **no momento da consulta**. Para intervalos anteriores em que o anúncio teve o creative trocado, a V1 não prova qual creative estava vigente naquele dia. Ads históricos sem creative disponível mantêm creative nulo. Não apresentar esse vínculo como histórico garantido; futura análise deverá distinguir observação de identidade versus vigência histórica. Campanha/dia e o histórico de corretor continuam sendo a fonte dos totais empresariais. A consolidação por corretor atravessa contas e conexões, sem duplicar a conta canônica. Vendas/receita/ROI e gerador de relatórios não foram implementados.

## Validação e próximos passos

Prisma validate/generate; migration diff prévia só com acréscimos; migrate deploy concluído; diff após a migration vazio. TypeScript sem erros, lint das áreas alteradas sem erros; build de produção concluído. Regressão: **285 testes aprovados** (67 Marketing, incluindo 35 novos, e 218 regressões). PostgreSQL: **20 grupos aprovados**, rollback obrigatório, zero tenants sintéticos restantes e zero chamadas externas. `git diff --check` passou. Avisos de baseline-browser-mapping, middleware legado e configuração Prisma em package.json são anteriores ao módulo.

Verificação no navegador com proxy temporário somente GET: tela real vazia, botão Atualizar, catálogo de 16 colunas, preset Completa, reordenação, preferência mantida após reload e restauração do padrão. Nenhuma mutação empresarial foi enviada por essa prévia; somente a preferência local de grid foi exercitada e restaurada. O banco Railway apresentou falha de conexão transitória no primeiro carregamento e respondeu após reload. Não há validação visual de campanhas/métricas reais enquanto a autorização Meta estiver pendente.

Próximo passo: preencher as quatro variáveis vazias em ambiente seguro, criar/conferir a configuração de Login para Empresas e, após a revisão e autorização posterior de deploy, concluir OAuth com credencial nova. Então descobrir/selecionar contas e validar gasto/conversas de hoje e de um intervalo conhecido contra Ads Manager. A validação operacional com dados reais permanece bloqueada por essa configuração e pela autorização nova; o código local não foi publicado em flyimob.com.
