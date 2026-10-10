# Ativação do piloto Flyimob + Horizonte — 10/10/2026

## Execução autorizada em produção — atualização

- Migration `20261010120000_training_access` aplicada em 10/10/2026 às 22:28:11 UTC; somente ela estava pendente, sem diferenças de conteúdo no histórico.
- Par Ed25519 novo configurado exclusivamente no backend Railway Flyimob. Fingerprint pública SHA-256: `6f98a8daa37381e064a9dcd2e59228a150e5531d3db9623b82cef1ecf1f90052`.
- Cliente Horizonte `flyimob` cadastrado e habilitado, com escopo exclusivo `cmv2etzu60000s90wahxoe74k`. Não havia outros clientes cadastrados. Flags de integração configuradas nos dois backends; publicação iniciada pelo fluxo existente.
- SELECT no banco privado confirmou `activeMediaId=b651d2f3-e738-4e22-a02c-a23ec8fc9836`, estado READY, PRIVATE, 447,167 s, H.264/AAC, 1280×720. Nenhum conteúdo foi alterado.
- Sem corretor piloto selecionado: nenhum TrainingAccess, usuário parceiro ou matrícula foi criado. A exchange completa e reprodução/progresso reais dependem da seleção do corretor existente.
- Acesso SSH temporário usado somente para cadastro da chave pública e consultas; remover registro e arquivos temporários ao finalizar.

As seções abaixo preservam o registro da preparação anterior e seus resultados, anteriores à autorização de publicação.

## Identificação confirmada por leitura

| Item | Valor verificado |
|---|---|
| Horizonte | `https://ead-horizonte-production.up.railway.app` |
| Deploy efetivo | `114500dc-04d4-40d3-91fd-8c5d67247782`, SUCCESS |
| Commit publicado | `1cc2909fce01a1ac8bc3f47992f9f2eb19dbcbd2` |
| Curso publicado | **Curso Iniciação Flyimob** — `cmv2etzu60000s90wahxoe74k` |
| Primeiro módulo | **Start Corretor - Introdução ao mercado imobiliário**, posição 1 |
| Primeira aula publicada | **Módulo Introdutório - Conhecendo o mercado imobiliário e definindo a estratégia de entrada!** — `cmv2exxp30004s90wmtc7qnyo`, posição 1 |
| Mídia apresentada na administração | Origem **Privado**, `3df34eb3-5d0b-4d5c-8c01-75e4facc7a46.mp4`, **Pronto**, 447 s, remultiplexado |
| Estado atual da integração Horizonte | `INTEGRATIONS_ENABLED` não habilitado, confirmado por configuração remota |
| Saúde/API pública sem sessão | `/api/health` 200; `/api/v1/courses` 401 |
| Flyimob | `https://flyimob.com`, quatro BROKER ativos em tenants não plataforma |

O ID do curso foi lido do seletor real na administração autenticada; o da aula veio do link real de prévia. Nenhum formulário foi enviado e a prévia não foi aberta: ela criaria sessão/auditoria de playback. A administração informa origem privada e versão pronta, mas não mostra o `activeMediaId`. **Esse identificador de revisão ainda não foi confirmado por leitura; será registrado no primeiro POST playback autorizado ou na consulta SELECT abaixo.** Não foi inventado ID de módulo/mídia nem confundida a aula técnica de homologação com a primeira aula publicada.

Horizonte não tem conexão pública de banco configurada; o ambiente local também não tem chave SSH. Não foram criados túnel/chave/proxy nem alteradas credenciais. A configuração/quantidade de IntegrationClient não pôde ser consultada no banco privado. O cliente `flyimob` abaixo é um cadastro proposto, não um cliente cuja existência já foi confirmada.

Consulta somente leitura que o operador pode executar no banco privado Horizonte:

```sql
BEGIN READ ONLY;
SELECT l.id, l.published, l."videoSource", l."activeMediaId", a.state, a.metadata
FROM "Lesson" l LEFT JOIN "MediaAsset" a ON a.id=l."activeMediaId"
WHERE l.id='cmv2exxp30004s90wmtc7qnyo';
SELECT id, enabled, "allowedCourseIds" FROM "IntegrationClient" WHERE id='flyimob';
ROLLBACK;
```

## Configuração preparada, sem aplicar

Flyimob: `HORIZONTE_ORIGIN=https://ead-horizonte-production.up.railway.app`; `HORIZONTE_COURSE_IDS=cmv2etzu60000s90wahxoe74k`; `HORIZONTE_CLIENT_ID=flyimob` após confirmar/cadastrar esse cliente; chave privada Ed25519 PKCS8 PEM exclusivamente no backend; `HORIZONTE_ENABLED=false` até ativar o piloto. Os quatro valores de conexão ainda estavam ausentes na configuração remota Flyimob; a chave também não existe no ambiente local. `APP_URL=https://flyimob.com` já está configurado e é usado como origem exata de mutações em produção, inclusive atrás do proxy Railway; headers encaminhados não ampliam essa autorização.

Horizonte: cliente com a chave **pública SPKI** correspondente, escopo contendo somente o curso acima e `enabled=true` na ativação; `INTEGRATIONS_ENABLED=true` na aplicação. Sem novo login, cookies ou banco compartilhado. A primeira exchange cria/reutiliza o aluno parceiro por `subject=tenantId:userId`, preservando os usuários Flyimob existentes; não faz associação por e-mail. Bearer Horizonte dura cinco minutos, nunca sai do BFF; concessões PARTNER recebem validade de 23 horas e cada exchange substitui o conjunto desse parceiro. Direitos locais continuam sendo consultados em todas as operações sensíveis.

Arquivos prontos: `docs/training-activation.env.example` (sem segredo, não carregado automaticamente), `docs/training-client-registration.sql` (cadastro desativado, sem sobrescrever cliente existente) e `scripts/training-signing-check.mjs` (validação offline e fingerprint pública SHA-256, sem imprimir chave privada). A geração/cadastro do par de chaves não foi executada. Depois da configuração autorizada, comparar a fingerprint pública derivada da chave backend com a chave registrada na Horizonte.

## Migration revisada contra o estado atual

Somente `20261010120000_training_access` está pendente no inventário local versus `_prisma_migrations` de produção. `TrainingAccess` ainda não existe; `User_tenantId_id_key` e a coluna `User.sessionVersion` já existem. A migration cria apenas tabela/índices/check/FK; não recria usuários, não altera tabelas comerciais nem faz backfill. Dados atuais não exigem transformação para a tabela inicialmente vazia.

As duas migrations Academy de 15/09 têm diferenças apenas LF/CRLF na cópia Windows: normalizar LF reproduziu exatamente os checksums aplicados. Nenhuma diferença de conteúdo foi encontrada, nem os arquivos históricos foram editados. Essa tolerância está implementada no [código oficial do Prisma 6.19](https://github.com/prisma/prisma-engines/blob/6.19.0/schema-engine/connectors/schema-connector/src/checksum.rs). O restante do histórico coincide byte a byte.

Na janela autorizada: backup/recuperação disponíveis; conferir novamente status; aplicar `prisma migrate deploy` no alvo Flyimob confirmado, sem seed/reset/db push. Atenção ao publicar: usuários já verão o menu novo, mas a migration deve estar aplicada antes do primeiro uso autenticado das APIs de treinamentos. Não colocar chave privada em variável pública/build/browser.

## Checklist curto de ativação — requer autorização

1. Confirmar revisão ativa com SELECT acima e selecionar **um corretor Flyimob existente** para piloto; confirmar que a aula original permanece publicada/READY.
2. Gerar/configurar Ed25519 no backend Flyimob; cadastrar somente a chave pública e escopo do curso na Horizonte, após verificar cliente existente. Publicar Flyimob e aplicar a única migration pendente na janela autorizada, inicialmente com integração desativada.
3. Habilitar cliente/integração Horizonte e variáveis Flyimob; conceder o curso somente ao piloto. Validar GET/Range da mídia no domínio Flyimob antes de propor qualquer alteração AWS/CORS.
4. Mesmo login Flyimob: Treinamentos → curso real → primeira aula. Registrar source/revision/session, reproduzir >30 s, pausar, esperar confirmação, fechar/reabrir e comparar posição/progresso Horizonte. Nunca registrar bearer ou URL assinada em evidência compartilhada.
5. Revogar somente o acesso desse piloto e verificar bloqueio imediato de novas operações, pausa do player no próximo heartbeat e expiração das URLs já emitidas. Não revogar alunos/matrículas MANUAL reais da Horizonte.
6. Android/iPhone instalado: repetir o fluxo e validar menu, clientes/formulários, comparativos/compartilhamento, documentos/uploads/preview, mapa/filtros, simulador, offline e atualização com formulário aberto. Ampliar usuários somente após esses testes e medição de carga.

Rollback: desabilitar integração Flyimob, preservar direitos/dados para auditoria e, se autorizado, sincronizar revogação/desativar o cliente Horizonte. Nenhuma operação destrutiva de banco é necessária. O catálogo administrativo completo não bloqueia esse piloto: o curso real já foi identificado; a tela ainda usa referências configuradas.

## Verificações desta rodada

- Consultas Railway/configuração e Flyimob SQL em transação **READ ONLY**; nenhum segredo apareceu na saída ou foi gravado em arquivo.
- Nove testes de integração passaram: assinatura, alterações do corpo, tenant/role/origem, proxy Railway, escopo local, revogação com indisponibilidade, token curto e worker sem cache sensível.
- Build final local 183/183; TypeScript, Prisma validate e lint das áreas de treinamento passaram.
- Componente React real testado em servidor isolado localhost com API e vídeo **sintéticos**: 390×844 e 1280×800 sem transbordamento horizontal, módulos/player, retomada em 24 s, reprodução até 35 s, atualização de progresso/conclusão e mensagem de revogação com vídeo pausado. Isso não comprova reprodução/progresso na Horizonte real nem instalação em aparelho.
- Player passou a tentar salvar também em pausa/fim/seek/background, respeitando intervalo mínimo da Horizonte. Fecha/troca abrupta ainda pode perder o último trecho; aguardar confirmação antes de avaliar retomada exata.
- PWA amplo da rodada anterior preservado; nenhuma funcionalidade do corretor foi removida. Scripts de prévia não criam rota Next ou acesso de teste em produção.

Nenhum commit/push/deploy, migration aplicada, variável alterada, chave gerada, curso/matrícula modificado ou acesso real concedido nesta rodada.
