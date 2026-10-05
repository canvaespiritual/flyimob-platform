# Equipe operacional e responsáveis de Marketing

## A–C. Diagnóstico e arquitetura

A auditoria anterior à implementação está em `equipe-auditoria.md`. O seletor antigo consultava exclusivamente `User.role = BROKER`; OWNER/DIRECTOR e participantes sem login não eram elegíveis.

Não havia membership/pessoa canônica separado. User representa autenticação; FinancialParticipant representa participação econômica e já tem `userId` opcional. Foi acrescentada uma identidade de equipe `OperationPerson`, sem credenciais e sem valores financeiros. Não foi criada tabela Broker.

## D–F. Schema, migration e backfill

- `OperationPerson`: ID, tenant, nome, e-mail opcional, função operacional, status ativo, indicador de cadastro/ativação operacional explícita e redirecionamento de identidade unida.
- `OperationalRole`: DIRECTION, DIRECTOR, MANAGER, BROKER, ADMINISTRATIVE, PARTNER, OTHER. Não concede permissões e não substitui UserRole.
- `User.personId` e `FinancialParticipant.personId`: opcionais e únicos, com FK composta por operação. IDs antigos e relações financeiras continuam intactos.
- `CampaignBrokerAssignment.personId`: vínculo novo; `brokerId` legado continua existente e agora aceita null para pessoas sem login. Exige ao menos uma identidade, mantém a exclusão de sobreposição, vigências e autoria.
- Migration única: `20261005120000_operation_people`, transacional PostgreSQL. Não altera migrations anteriores; não remove tabelas, colunas, registros, valores financeiros ou métricas.
- Backfill: uma identidade por User, IDs determinísticos `person:user:<id>`; participante com vínculo explícito ao User da mesma operação usa a identidade dele. Os demais recebem `person:participant:<id>`. Não compara nomes/e-mails. Participantes sem User começam com função OUTRO, para classificação manual pelo OWNER.
- Triggers locais materializam a identidade em criações dos fluxos antigos de User/participante. Vínculo financeiro explícito ao User da operação reúne as identidades. Não há criação automática de login para participantes.

## G–H. Equipe e Financeiro

`/admin/usuarios` mostra Pessoa, Função, Acesso, Financeiro e Status. OWNER cadastra pessoa sem convite, edita função/status e vincula registros existentes por seleção explícita. Selecionar participante/usuário existente reutiliza sua identidade. Vínculos que tentariam reunir dois acessos ou dois participantes são recusados.

Habilitar acesso é uma ação separada: OWNER escolhe e-mail e permissão de sistema. O novo User não tem senha até sua definição. O link privado gerado usa o reset existente: 32 bytes aleatórios, uma hora, uso único com claim atômico, scrypt e revogação das sessões pela versão. Não há senha temporária em texto puro. O link não é enviado automaticamente; OWNER deve entregá-lo por canal privado. Gerar outro link invalida o anterior.

Convites e ativação/inativação de acessos existentes continuam na seção expansível da tela. Ativação operacional e ativação do login são independentes. DIRECTOR não ganhou gestão de equipe; conserva Financeiro/Marketing e atribuições conforme regras anteriores.

Quando OWNER administra explicitamente uma pessoa na equipe, sua ativação operacional passa a valer independentemente das fontes de login/financeiro. Um login inativo pode continuar inativo enquanto a identidade operacional ativa recebe campanhas. Isso não reativa acesso nem participação financeira.

Financeiro > Participantes e o detalhe mostram função operacional/acesso e um link de gestão de equipe para OWNER. PIX, comissões, conta corrente, vendas, pagamentos, ajustes, documentos, fechamentos e relatórios mantêm seus mecanismos e IDs.

## I–K. Marketing, deduplicação e vigência

- Novo responsável inclui pessoas operacionalmente ativas com User ativo, participante ativo ou cadastro independente. Não exige login ou função BROKER. Identidades unidas e fontes inativas sem alternativa ativa não são elegíveis.
- O filtro Responsável atual considera a atribuição vigente, não as futuras. A visão histórica pode consultar responsáveis inativos e consolida pela identidade vigente em cada dia.
- Deduplicação ocorre por `personId` e FKs explícitas. Homônimos sem vínculo não são unidos. União manual mantém o registro anterior como alias (`mergedIntoId`), retargeta somente referências operacionais das atribuições e preserva IDs/intervalos/valores financeiros/métricas. Não há tela de desfazer união nesta versão; confirme a identidade antes de vincular.
- Vigência: início inclusivo, fim exclusivo. Troca encerra a anterior; períodos futuros agendados continuam. Cancelamento no mesmo início marca a linha cancelada, sem removê-la. Intervalos continuam protegidos contra sobreposição no PostgreSQL.
- Status Meta exibido utiliza effectiveStatus, com fallback sourceStatus/UNKNOWN. ACTIVE verde, PAUSED âmbar, demais neutros, com texto/tooltip.
- Filtro Meta: ativas por padrão, pausadas, demais, todas. Ordenação global ACTIVE → PAUSED → demais, atualização decrescente/ID dentro dos grupos, antes da paginação. Busca por nome na interface considera todos os estados Meta e informa isso na tela.
- Finalidade e acompanhamento interno permanecem manuais. PAUSED na Meta pode continuar em acompanhamento; sincronização não modifica função/finalidade/atribuição/acompanhamento. Orçamento, pausa, reativação e edição Meta continuam fora do escopo.
- As chaves legadas `brokers`/`brokerId` no relatório representam agora a identidade operacional, para conservar o contrato do grid. A coluna legada User ID das atribuições permanece para compatibilidade; clientes antigos podem enviar User ID, resolvido por FK.

## L–M. Validação e limites

- Prisma validate/generate e TypeScript sem erros.
- Suíte completa disponível: 313 testes passando, incluindo OAuth/sync Meta, Documentações, Financeiro e Academy.
- Lint dos arquivos alterados: zero erros/avisos. Lint geral tem 122 erros/36 avisos preexistentes em arquivos fora da mudança; não foi feita refatoração desses módulos para limpar a dívida geral.
- Teste final da migration em cópia isolada do schema PostgreSQL, com rollback obrigatório: 21 verificações passaram. Compara fingerprints internos de User, participantes, vendas, direitos, pagamentos, ajustes, liquidações, PIX, campanhas, métricas e atribuições antes/depois do backfill. Somente personId novo é excluído da comparação. Não imprime dados pessoais ou credenciais; schema temporário e fixtures são revertidos.
- Testes reais cobrem criação por fluxos antigos, pessoa sem login/sem financeiro, reutilização de participante, união explícita, inativos, histórico diário, exclusão de vigências, status/filtros/paginação, RBAC, primeiro acesso e ausência de chamadas externas. Fixtures e DDL de ensaio são revertidos.
- Após a aplicação, o ensaio curto de criativos/auditoria passou em sete grupos (unicidade, tenant, valores não negativos, substituição intradiária, indicadores e auditoria imutável/allowlist), com zero fixtures restantes. O verificador legado em uma única transação longa atingiu o limite de tempo do banco remoto; suas verificações restantes foram executadas nesse ensaio separado. Não houve falha de asserção da implementação, e as transações expiradas foram revertidas.
- Build de produção validado. Avisos já existentes de middleware, configuração Prisma e baseline-browser-mapping.
- Nenhum arquivo de OAuth, callback, criptografia, descoberta ou worker Meta foi modificado. Nenhuma chamada real à Meta ou alteração de secrets é necessária para esta publicação.
- Somente vínculos explícitos já existentes são unidos automaticamente. Se Breno não tinha User vinculado ao participante, OWNER deve vinculá-los manualmente. Não se inferem funções de Victor/Laura/Sandra pelo nome.
- A migration foi aplicada ao banco de produção em 05/10/2026; `prisma migrate status` confirmou as 31 migrations em dia. Não há migration pendente para este deploy. O script de build não executa migrations; a aplicação foi feita antes da publicação do código. Não foi usado db push/reset.

## N. Teste manual em flyimob.com após o deploy

1. Entre como OWNER da operação e abra `/admin/usuarios`. Confira Gustavo/User OWNER, Breno/User DIRECTOR e os participantes existentes sem acesso. Não deve existir login automaticamente criado para Victor, Laura ou Sandra.
2. Em Breno, clique Editar/vincular e selecione explicitamente o participante financeiro correto e o acesso existente. Salve; confira uma única linha com acesso DIRECTOR e participante financeiro original. Se já vinculados, não precisa repetir.
3. Em Victor, Laura e Sandra, atribua função Corretor mantendo seus participantes e sem habilitar acesso. Em Gustavo/Breno, confira função operacional Direção/Diretor e mantenha permissões existentes.
4. Abra Financeiro > Participantes e os detalhes. Confira os mesmos IDs nas URLs, PIX, comissões, valores liquidados/futuros e conta corrente. A função/acesso deve aparecer sem alterar esses valores.
5. Abra `/admin/marketing/campanhas`. Por padrão veja ativas. Selecione Todas e confira ACTIVE antes de PAUSED/demais, badges/textos e acompanhamento em coluna separada. Teste pausadas/demais, conta, finalidade e busca por nome de uma campanha pausada.
6. Em Gerenciar, confira Novo responsável com Victor/Laura/Sandra sem login e Gustavo/Breno com suas funções. Não crie um cadastro duplicado para conseguir atribuir campanha.
7. Faça uma atribuição real na data comercial correta. Programe uma troca futura e confira histórico com início inclusivo/fim exclusivo. Antes da data futura, o filtro Responsável atual deve continuar encontrando o responsável anterior. Cancelar a troca no mesmo início conserva a linha cancelada.
8. Na visão geral selecione o período e finalidade desejados (Todas inclui campanhas ainda Não classificadas). Confira investimento/conversas por responsável de cada dia. Personalize colunas/recarregue e confira persistência do grid.
9. No Ads Manager, uma campanha pausada deve aparecer Pausada após a próxima leitura, mantendo acompanhamento Flyimob como foi definido. Use Atualizar como OWNER e compare a mesma data/fuso/moeda; repetir não deve somar o gasto novamente. Não precisa refazer OAuth para esta evolução.
10. Cadastre uma pessoa de teste independente sem acesso e sem participante. Confira que pode ser responsável e não consegue login. Inative operacionalmente e confira que sai do seletor de novas atribuições, mantendo o histórico.
11. Para validar primeiro acesso, use uma pessoa de teste/e-mail controlado: Habilitar acesso, escolha BROKER e gere link privado. Defina a senha no link, teste login e confirme que o mesmo link não funciona novamente; gerar outro link invalida o anterior. Use a seção de gestão de acesso para inativar o login de teste quando terminar.
12. Entre como DIRECTOR: Marketing/Financeiro devem continuar acessíveis, gestão de equipe deve continuar bloqueada. Confira também Documentações e Academy. Pessoas sem User continuam sem permissões.
