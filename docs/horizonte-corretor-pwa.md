# Integração Horizonte e PWA do corretor — implementação local, 10/10/2026

Atualização da rodada seguinte: consultar `docs/horizonte-ativacao-piloto.md` para IDs reais, estado remoto confirmado, migration e configuração de ativação. As verificações abaixo descrevem a rodada inicial.

## Diagnóstico e contrato consultado

Flyimob usa Next.js 16 App Router, React 19, Prisma/PostgreSQL e RBAC em `src/lib/rbac.ts`. O corretor é `BROKER`, não `CORRETOR`. Cookie HttpOnly `flyimob_session` contém assinatura HMAC; a sessão valida usuário ativo, tenant e `sessionVersion` no banco. Não foi criado login ou cookie adicional. A área de trabalho é `/admin`; documentos próprios ficam em `/documentacoes`. O Academy existente é um funil comercial e seu PWA administrativo é independente dos treinamentos.

A cópia local `C:/Users/Breno Veloso/Desktop/EAD` tem remoto `https://github.com/canvaespiritual/ead-horizonte.git`, HEAD `1cc2909fce01a1ac8bc3f47992f9f2eb19dbcbd2` e estava sem alterações. Foram lidos `docs/INTEGRATION.md`, `src/lib/integration/service.ts`, `src/lib/education/service.ts`, `src/lib/education/policy.ts` e handlers reais de exchange/courses/playback/progress. Nenhum arquivo Horizonte foi alterado. Não se confirmou que esse HEAD é o atualmente implantado; isso deve ser confirmado pelo operador.

Contrato efetivamente consultado:

| Operação | Horizonte |
|---|---|
| Troca assinada Ed25519 | POST `/api/integrations/v1/exchange` |
| Cursos/módulos/aulas autorizados | GET `/api/v1/courses` |
| Abrir player | POST `/api/lessons/{id}/playback` |
| Renovar URL, verificar revisão | PATCH `/api/lessons/{id}/playback` |
| Heartbeat de progresso | POST `/api/lessons/{id}/progress` |

O contrato local informa integração desativada por padrão e nenhum cliente cadastrado em produção. Vídeo funcionando na interface Horizonte não comprova habilitação das APIs de integração. A produção não foi consultada nem modificada.

## Funcionalidades preparadas

- `/admin/treinamentos`: cursos autorizados, descrição, módulos, aulas, conclusão histórica, progresso do curso, player PRIVATE com `playsInline`, anterior/próxima e erros. A última aula aberta é uma referência local; posição e progresso permanecem exclusivamente na Horizonte. Abrir novamente recupera a posição retornada por ela.
- `/admin/treinamentos/acessos`: OWNER/DIRECTOR do próprio tenant selecionam corretor ativo e conjunto de cursos, revogam desmarcando e salvando, e consultam/repetem sincronização pendente. Outros perfis e tenant de plataforma não recebem esse acesso novo.
- BFF `/api/training/*`: identidade derivada da sessão, sem aceitar userId do navegador; autorização local e catálogo autorizado verificam a aula em cada operação. Progress aceita só os campos do contrato. Corpo tem limite real de leitura de 16 KiB, mutações exigem Origin exato e rejeitam cross-site.
- `TrainingAccess`: apenas direitos locais, estado de sincronização, autor da última alteração, data e referência da última aula. Não duplica aluno, cursos, arquivos ou progresso Horizonte. FK composta preserva tenant/usuário.
- Chave privada e bearer nunca são entregues ao navegador nem gravados em banco/log. A URL temporária de mídia é entregue ao player conforme o contrato; vídeo fica na Horizonte/S3. Token é descartado após cada operação.

## Sincronização e limitações

O conjunto local substitui as concessões PARTNER em cada exchange; vazio revoga todas. Lock consultivo PostgreSQL por corretor serializa concessões/revogações e operações upstream entre processos. A transação é limitada a 20–30 s; chamadas HTTP têm timeout de 8 s e não seguem redirects.

Ao salvar acesso, a intenção local persiste mesmo quando a troca falha, com `syncPending=true`. Novas operações Flyimob sempre consultam os direitos locais, portanto revogação bloqueia novos acessos mesmo sem Horizonte. Administrador pode repetir “Salvar / sincronizar”; acesso do aluno tenta novamente quando ainda existem cursos; abrir cursos também tenta uma revogação vazia pendente. Não há worker automático nesta versão. Uma URL S3 já emitida permanece válida até seu TTL, definido pela Horizonte (política local consultada: 300 s); um vídeo já carregado no dispositivo também não pode ser apagado remotamente.

Implementação conservadora faz exchange e consulta de catálogo em cada operação, inclusive heartbeat de 10 s, evitando cache de autorização desatualizado e concorrência de tokens entre instâncias. Isso recria concessões/sessões na Horizonte e mantém uma transação Flyimob aberta durante a chamada. Antes de escala, medir carga/latência e implementar reutilização segura de bearer exclusivamente no servidor com revisão das permissões, invalidação e retry de token revogado. Não habilitar indiscriminadamente para toda a base sem esse teste de capacidade.

Player renova a URL a cada 240 s e para em erro ou mudança de revisão. Progresso só é confirmado pelo backend Horizonte; não existe fila offline. Até 10 s recentes podem não ser salvos ao fechar/trocar a aula. Horizonte mede cobertura, não simples seek. YouTube é suportado pelo ID oficial em embed de vídeo e não mede progresso/retomada pelo contrato atual. Não é iframe do painel Horizonte. Horizonte limita cinco sessões de playback ativas por aluno e expira em três horas; múltiplas reaberturas podem atingir o limite, pois o contrato não oferece encerramento de sessão.

GET courses fornece conclusão histórica da aula, não a revisão atual; a porcentagem do player corresponde à versão ativa. Exibir “concluída” no catálogo e porcentagem menor no player de uma versão substituída reflete esse contrato.

## Pendência: catálogo administrativo

Não existe endpoint parceiro de catálogo administrativo nos handlers consultados. GET courses depende de matrícula/autorização de aluno. Não foi usada identidade fictícia com cursos concedidos para contornar essa regra.

A tela administrativa lista referências em `HORIZONTE_COURSE_IDS`, não títulos/metadados de um catálogo inventado. Para cumprir integralmente a seleção por catálogo, precisamos de uma exportação oficial de IDs/títulos com manutenção manual, ou autorização para a Horizonte oferecer leitura limitada dos cursos publicados no escopo do cliente. Proposta mínima: operação de catálogo parceiro autenticada, somente leitura, sem permissão administrativa global. Path/contrato dessa operação devem ser definidos pela Horizonte; não foi criado endpoint nem alteração naquele repositório.

## Configuração de homologação

Nenhum `.env`, segredo ou credencial foi modificado. Sem habilitação explícita, o adaptador responde indisponível e não chama Horizonte.

```dotenv
HORIZONTE_ENABLED=false
HORIZONTE_ORIGIN=https://DOMINIO-REAL-HORIZONTE
HORIZONTE_CLIENT_ID=CLIENTE-CADASTRADO-PELO-OPERADOR
HORIZONTE_PRIVATE_KEY=PEM-ED25519-NO-GERENCIADOR-DE-SEGREDOS
HORIZONTE_COURSE_IDS=IDS-REAIS-SEPARADOS-POR-VIRGULA
```

`HORIZONTE_PRIVATE_KEY` aceita PEM com quebras de linha ou `\n` literal; nunca usar NEXT_PUBLIC. Somente em ambiente autorizado: `HORIZONTE_ENABLED=true`. HTTPS obrigatório em produção; localhost HTTP é aceito apenas fora de produção. Horizonte precisa reconhecer a chave pública, o escopo e habilitar integrações. Confirmar CORS da mídia S3 para a origem Flyimob e compatibilidade de seu formato nos dispositivos.

Migration preparada: `prisma/migrations/20261010120000_training_access/migration.sql`. Não foi aplicada em banco algum. Cliente Prisma foi gerado localmente. As páginas/API que consultam TrainingAccess precisam da migration num banco autorizado antes de teste funcional autenticado.

## Cobertura das rotas BROKER no PWA

| Rotas/fluxos | Auditoria local e ajustes | Homologação ainda necessária |
|---|---|---|
| `/admin`, `/admin/dashboard` | Sessão e redirect existentes; dashboard atual é “Em construção”; shell com menu completo mobile, cabeçalho flexível e instalação | Login, expiração, retorno pelo ícone e logout em Android/iOS |
| `/admin/clientes`, `/admin/crm` | Permissão CRM preservada; layout em cards e formulário responsivo existentes; modal passou a usar 90dvh; inputs 16px no mobile | Criar/editar, pesquisa, filtros e teclado físico/virtual |
| `/admin/comparativos` | Cards mobile e tabela desktop já existentes; ações e filtros mantidos | Criar, pesquisar, excluir e compartilhar |
| `/admin/comparativos/[id]` | Modal de tipologias com rolagem e limite 90dvh; grids responsivos existentes | Adicionar/remover tipologias, edição, teclado e mídia |
| `/admin/comparativos/[id]/finalizar` | Grids responsivos e fluxo existente preservados | Finalização e link público |
| `/documentacoes`, `/documentacoes/pastas/[id]` | Guard BROKER/tenant/atribuição existente; instalação/conexão e inputs mobile agora também presentes; fila, retry, formatos e download existentes preservados | Upload PDF/JPG/HEIC, interrupção de rede, preview e correções em aparelhos |
| `/`, `/empreendimentos/[slug]` | Mapa antes oculto no mobile agora visível; busca flexível, filtros roláveis; altura dinâmica; detalhes/galeria responsivos existentes | Google Maps, toque, filtros, galeria e visualização de documentos |
| `/c/[slug]` | Comparativo público já possui cards responsivos, mapa/galeria e compartilhamento | Link compartilhado dentro/fora do PWA |
| `/simulador-mcmv` | Formulário público e cálculo existentes preservados | Teclado numérico, cenários e navegação |
| `/admin/treinamentos` | Novo fluxo completo de cursos/player; lista de aulas acessível no mobile | Reprodução real, pausa, seek, retomada, troca de revisão e revogação |

BROKER não tem `data:manage`, `users:read` ou `documentacoes:manage`; construtoras, gestão de empreendimentos, usuários e administração documental não integram o menu do corretor. Marketing/financeiro também não foram adicionados ao perfil. Não foram escondidas funções mobile para reduzir a interface. A auditoria acima é de código: não equivale à validação visual/funcional em todos os aparelhos.

Manifest `/corretor.webmanifest` cobre `/` para manter mapa, páginas públicas e documentos no mesmo aplicativo, start `/admin`. Worker `/corretor-sw.js` usa allowlist de recursos estáticos; APIs, HTML autenticado, RSC, uploads, documentos, vídeos e tokens não são cacheados. Offline em navegação mostra apenas página pública de conexão. A instalação não depende de push. PWA Academy mantém worker específico e escopo mais restrito; não foi alterado. Update espera ação explícita do usuário após salvar os formulários. HTTPS e aparelho real são necessários para homologar instalação, atualização e retomada.

## Validação local

Suíte completa: 523 testes passaram, incluindo cinco novos testes de assinatura, escopo/revogação e worker. Depois foram adicionados dois testes de handlers reais com sessão sintética e fluxo BFF completo contra transporte simulado; os sete testes de integração passaram. TypeScript, lint das novas áreas, Prisma validate e diff check passaram; o lint do shell mantém apenas o aviso preexistente de `<img>`. Build final de produção passou com 183/183 páginas, incluindo os últimos ajustes de navegação e o novo layout de documentos. Testes usam mocks e registros sintéticos, sem banco/produção. Test runner precisou de execução autorizada fora do sandbox por `spawn EPERM`; primeira tentativa de build não baixou Google Fonts no sandbox e foi repetida com acesso autorizado à rede.

Smoke HTTP em servidor local de produção: 14 verificações passaram (manifest/worker/offline/ícones 200 e MIME correto; páginas protegidas 307; APIs GET/POST/PUT sem sessão 401 e no-store). Comando reutilizável: `node scripts/training-smoke.mjs http://localhost:3105`; script recusa origem que não seja localhost/127.0.0.1. Servidor de smoke foi encerrado após a verificação. Não foi feita inspeção visual em navegador autenticado nem teste físico de instalação.

Não houve commit/push, deploy, migration, concessão real de cursos, alteração de credenciais ou gravação na Horizonte. O arquivo preexistente não rastreado `scripts/correct-vitoria-sale.cjs` foi preservado.

## Homologação real e publicação

1. Confirmar contrato/commit implantado da Horizonte, origem real, ID do Curso Iniciação Flyimob, revisão/formato da aula e escopo do cliente. Resolver catálogo administrativo.
2. Criar ambientes de homologação separados e banco Flyimob autorizado. Revisar/aplicar somente a nova migration nesse banco; não apontar testes de escrita para produção.
3. Operador cadastra cliente/chave pública/escopo na Horizonte, configura chave privada só no servidor Flyimob e habilita os ambientes de homologação. Essas ações externas requerem autorização própria.
4. Corretor sintético Flyimob recebe somente o curso de teste. Abrir Treinamentos, reproduzir a aula PRIVATE, assistir >30 s, pausar, fechar/reabrir e verificar posição sem outro login. Validar heartbeat, conclusão por cobertura e retomada da última aula em outro dispositivo.
5. Validar aluno sem curso, outro tenant/role, forja de lesson/sessionId, origem externa, revogação durante reprodução, indisponibilidade e recuperação, URL expirada, mudança de revisão e limite de sessões. Conferir que token/chave não aparecem no navegador/logs/cache.
6. Android e iPhone: instalar, executar cada linha da matriz de rotas, testar teclado/rolagem/upload/documento, rede instável, fechar/reabrir, logout/login, atualização com formulário aberto e coexistência com Academy. Registrar aparelho/browser/versão e evidências.
7. Medir carga das trocas por heartbeat, pool/transações, rate limiting na borda Horizonte e retenção dos registros de integração. Implementar cache seguro de bearer/worker de sincronização se necessário antes de ampliar usuários.
8. Somente após aceite: autorizar commit/push, backup/revisão de migration e credenciais, publicar Flyimob com integração desativada, aplicar migration autorizada, verificar login e funções existentes, configurar cliente e habilitar um corretor piloto. Expandir após os dois marcos aprovados.

Rollback operacional: desabilitar `HORIZONTE_ENABLED`, preservar TrainingAccess para auditoria e manter funções imobiliárias. Não apagar tabelas/dados nem executar migration reversa destrutiva. Desabilitar treinamento não revoga sozinho URLs já emitidas; operador deve sincronizar revogação/desabilitar cliente Horizonte conforme contrato e autorização.
