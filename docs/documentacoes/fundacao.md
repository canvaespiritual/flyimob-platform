# Documentações — fundação técnica

Este documento registra a etapa 2. A camada operacional foi acrescentada na etapa 3 e a migration foi aplicada em produção na etapa 4; veja [ativacao-producao.md](ativacao-producao.md) para o estado atual. Não houve deploy da aplicação.

Esta entrega prepara o domínio e o isolamento de acesso. Não inclui cadastro
operacional de pastas, upload documental, download/ZIP, máquina de transições,
notificações, dashboard ou integrações. Não houve commit, deploy ou alteração
externa de AWS/Brevo/Railway.

## Autenticação e revogação

O login continua usando `src/lib/auth.server.ts`, scrypt no formato existente e
`SESSION_SECRET`. Nenhuma conta ou hash existente é convertido. `auth.ts`, que
possui formato incompatível, não é usado pelos novos fluxos.

`User.sessionVersion` começa em zero. Novos cookies assinados levam `sv` com a
versão lida no banco; cookies antigos sem `sv` são interpretados como zero.
`getSessionUser()` exige usuário ativo e versão coincidente. O reset de senha
incrementa a versão na mesma transação que atualiza o hash. Inativação e mudança
de role via API de usuários também incrementam a versão. Reativação não reduz a
versão, portanto não recupera sessões antigas.

Futuras rotas de troca de senha devem atualizar hash e incrementar a versão na
mesma transação. Mudanças externas que escrevam diretamente no banco precisam
seguir esse contrato. Não existe nova infraestrutura de sessões ou jobs.

Tokens com formato, assinatura, JSON ou payload inválidos retornam sessão
inválida, sem lançar exceção. O tenant e a role efetivos vêm do usuário no banco,
e não de parâmetros enviados pelo cliente ou da role antiga no cookie.

## Perfis e rotas

- OWNER/DIRECTOR de operação: menu Documentações após Financeiro e placeholder
  em `/admin/documentacoes`. Plataforma não recebe acesso documental.
- CORRESPONDENTE: nenhuma permissão administrativa; login/convite apontam para
  `/correspondente`. O layout administrativo redireciona antes de criar o shell.
- BROKER: comportamento anterior preservado; visão documental fica para a
  próxima entrega.
- Academy: recusa explícita de CORRESPONDENTE, mesmo se seu ID constar na lista
  de administradores. Não houve mudança na PWA ou nos processos comerciais.

O `returnTo` é validado como caminho interno. Para CORRESPONDENTE, o destino é
sempre `/correspondente`, independentemente do parâmetro.

## Credenciais de correspondente

O convite efetivo continua em `/api/admin/users/invite`, usando
`UserInviteToken`, Brevo e a tela atual de ativação. A interface de Usuários
inclui a nova role. Aceitação e consumo desse convite agora são atômicos.
Convites existentes mantêm seus tokens e modelos. Fluxos alternativos não foram
consolidados; apenas os pontos tipados/destinos necessários foram preparados.

`POST /api/documentacoes/correspondentes` cria uma conta diretamente, exclusivamente
por OWNER de operação. Corpo: `name`, `email`, `password`. Tenant e role são
fixados pelo servidor; senha usa o hash do login. A resposta contém somente os
campos públicos da conta, nunca senha ou hash. E-mail duplicado retorna 409.
Não há tela de criação direta nesta entrega.

## APIs existentes protegidas

`getPermissionApiSession()` devolve 401/403 para handlers. Os handlers de escrita
de Construtoras, Empreendimentos, fotos/anexos e Tipologias usam `data:manage` e
tenant da sessão. IDs de recursos são conferidos dentro desse tenant; o slug
enviado pelo navegador não concede autorização. Referências de construtora em
cadastro/edição de empreendimento também são conferidas.

Os handlers administrativos de Comparativos usam `comparativos:use`. Os de
itens que antes não tinham guarda passaram a conferir o tenant do comparativo.
Rotas públicas de comparação, OG e mapa permanecem públicas e preservadas.
Essa alteração foi necessária para impedir que o novo perfil acessasse APIs
que antes exigiam somente login ou não tinham autenticação.

## Domínio Prisma

Entidades novas:

- DocumentationFolder: operação, CRM opcional, corretor obrigatório,
  correspondente opcional, referências comerciais, observação interna e versão.
- DocumentationPerson: pessoa real da pasta com vínculo independente do tipo
  documental. Vários fiadores/terceiros são permitidos.
- DocumentationDocumentType: catálogo por tenant com código único, ordem,
  obrigatoriedade padrão e ativação. Ainda não foi populado.
- DocumentationDocument: arquivo único para administração/correspondente, autor
  e role/origem históricos, metadados, checksum e substituição. `fileSize` é
  BigInt; futuras APIs devem serializá-lo explicitamente. Não possui URL pública.
- DocumentationAnalysisRound: sequência por pasta, correspondente, versão
  enviada e datas. Não implementa transições.
- DocumentationRoundDocument: associação às revisões de arquivo de cada envio.
- DocumentationAnalysis: uma devolutiva por rodada, valores Decimal(18,2),
  observação e metadataVersion.
- DocumentationAnalysisDocument: associação dos arquivos da devolutiva à
  mesma entidade documental.
- DocumentationPendingItem: pendência individual com referências opcionais,
  autor, resolução e estado.
- DocumentationComment: INTERNAL ou SHARED, sem endpoints nesta fase.
- DocumentationEvent: evento imutável, ator/role e metadados mínimos.

São sete enums documentais, além da nova opção em UserRole. Os estados de pasta
incluem CONDICIONADO separado de PENDENCIA_DOCUMENTAL. Não existem estados
comerciais de venda/fechamento nem fórmulas automáticas de capacidade total.

As relações compostas exigem tenant coincidente e, nas entidades internas,
pasta coincidente. Pessoas, documentos, rodadas e análises não podem ser
referenciados de outra pasta. Os índices cobrem status, responsáveis, datas e
referências. Foram acrescentados únicos `(tenantId,id)` em User, CRMLead,
Construtora e Empreendimento para suportar as FKs, sem transformar dados.

FKs novas usam RESTRICT para preservar referências/histórico. Quando houver
pastas associadas, futuras telas precisam tratar a tentativa de excluir CRM ou
cadastros referenciados, por exemplo desassociando explicitamente com auditoria
quando permitido. Nenhuma pasta é criada automaticamente neste estágio.

A migration adiciona checks de tamanho/versão/rodada, índice parcial limitando
um titular por pasta e trigger impedindo UPDATE/DELETE na timeline. Isso não
equivale a RLS nem protege contra administrador do banco que desabilite triggers
ou use TRUNCATE; o descarte por retenção exigirá processo separado e autorizado.

`documentationFolderScope()` prepara o filtro obrigatório por tenant, role e
atribuição. Correspondentes precisam também de estado enviado e rodada dirigida
a eles. Não existem endpoints operacionais que exponham esse modelo ainda.
Serviços futuros devem validar roles dos responsáveis, comentários internos,
coerência entre pendência/análise/rodada e transições; FK não substitui autorização.

## Storage futuro

O contrato documental guarda somente `storageKey`, sem URL pública. Próxima
etapa: storage privado e chaves `documentacoes/{tenantId}/{folderId}/{randomId}`,
sem nome/CPF, com download autorizado no servidor. Nenhum bucket, objeto, upload
ou configuração AWS foi criado/modificado. Os uploads públicos dos outros
módulos preservam seus contratos, agora com guardas nos handlers envolvidos.

## Migration e implantação futura

Arquivo: `prisma/migrations/20261003000000_documentation_foundation/migration.sql`.
Gerado por diff entre schema original do Git e schema local, sem conexão a banco.
SQL revisado: onze tabelas novas, sete enums, nova role, coluna de versão em User,
índices, FKs e trigger/checks. Nenhum DROP, truncamento ou transformação dos
registros existentes. Índices/FKs podem exigir locks durante aplicação.

**A migration não foi aplicada.** O código que consulta sessionVersion depende
dela; não liberar o novo código antes de migrar o ambiente identificado.

Depois de identificar ambiente, verificar backup, migrations pendentes e obter
autorização, o comando de aplicação é:

```powershell
npx prisma migrate deploy
```

Esse comando aplica todas as migrations pendentes, não somente esta. Não usar
`db push` nem `migrate dev` contra produção. Validar primeiro em homologação.

## Validação

Testes sintéticos usam o contexto real de cookies do Next e Prisma/S3 mockados:
não criam usuários, enviam e-mails, gravam objetos ou alteram banco.

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --incremental false
node --import tsx --test tests/documentacoes/foundation.test.ts tests/academy/foundation.test.ts tests/academy/push.test.ts tests/financeiro/grouped-invoicing.test.ts tests/financeiro/receipt-remittance.test.ts
npm run lint
npm run build
```

O lint global já apresenta problemas em módulos existentes. Eles não autorizam
refatorações fora deste escopo. A validação do SQL no PostgreSQL, migrations
efetivamente aplicadas, login em navegador com contas reais e envio Brevo/AWS
permanecem pendentes, pois o banco/serviços externos não foram preparados aqui.

## Resultado da verificação desta entrega

- Prisma validate: passou.
- Prisma generate: passou (client instalado 6.19.3, sem troca de dependências).
- TypeScript sem emissão: passou.
- Testes: 90 passaram; 17 de fundação documental e 73 das suítes existentes.
- Lint de arquivos novos e núcleo de autenticação/acesso: passou.
- Lint global: falha por problemas existentes. Comparação dos 46 arquivos TypeScript
  alterados com HEAD: 15 erros antes, 10 depois, sem aumento de diagnósticos por regra.
- Build de produção: passou; Prisma generate e Next build, sem migrations/deploy.
- Git diff --check: passou.
- Migration: gerada e revisada; não aplicada em nenhum banco.
- Diff: 47 arquivos existentes alterados e 11 arquivos novos. No diff rastreado,
  636 linhas adicionadas e 202 removidas; arquivos novos não entram nesse subtotal.

## Inventário completo de arquivos

### Criados
- `docs/documentacoes/fundacao.md`
- `prisma/migrations/20261003000000_documentation_foundation/migration.sql`
- `src/app/admin/documentacoes/page.tsx`
- `src/app/api/documentacoes/correspondentes/route.ts`
- `src/app/correspondente/page.tsx`
- `src/lib/api-access.server.ts`
- `src/lib/auth-policy.ts`
- `src/lib/documentacoes/access-policy.ts`
- `src/lib/documentacoes/access.server.ts`
- `tests/documentacoes/foundation.test.ts`
- `tests/documentacoes/request-context.ts`

### Alterados

- `prisma/schema.prisma`
- `src/app/academy-admin/layout.tsx`
- `src/app/admin/AdminShell.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/usuarios/UsersClient.tsx`
- `src/app/api/admin/users/invite/route.ts`
- `src/app/api/auth/accept-invite/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/api/comparativos/create/route.ts`
- `src/app/api/comparativos/delete/route.ts`
- `src/app/api/comparativos/duplicate/route.ts`
- `src/app/api/comparativos/finalize/get/route.ts`
- `src/app/api/comparativos/finalize/save/route.ts`
- `src/app/api/comparativos/get/route.ts`
- `src/app/api/comparativos/items/add/route.ts`
- `src/app/api/comparativos/items/move/route.ts`
- `src/app/api/comparativos/items/remove/route.ts`
- `src/app/api/comparativos/items/update/route.ts`
- `src/app/api/comparativos/list/route.ts`
- `src/app/api/comparativos/tipologias/search/route.ts`
- `src/app/api/comparativos/update/route.ts`
- `src/app/api/construtoras/create-json/route.ts`
- `src/app/api/construtoras/create/route.ts`
- `src/app/api/construtoras/delete/route.ts`
- `src/app/api/construtoras/update/route.ts`
- `src/app/api/empreendimentos/anexos/delete/route.ts`
- `src/app/api/empreendimentos/anexos/upload/route.ts`
- `src/app/api/empreendimentos/create/route.ts`
- `src/app/api/empreendimentos/delete/route.ts`
- `src/app/api/empreendimentos/fotos/delete/route.ts`
- `src/app/api/empreendimentos/fotos/set-cover/route.ts`
- `src/app/api/empreendimentos/fotos/upload/route.ts`
- `src/app/api/empreendimentos/toggle-status/route.ts`
- `src/app/api/empreendimentos/update/route.ts`
- `src/app/api/invites/accept/route.ts`
- `src/app/api/invites/route.ts`
- `src/app/api/tipologias/create/route.ts`
- `src/app/api/tipologias/delete/route.ts`
- `src/app/api/tipologias/update/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/invite/[token]/InviteAcceptForm.tsx`
- `src/app/login/LoginForm.tsx`
- `src/lib/academy/admin-access.server.ts`
- `src/lib/auth.server.ts`
- `src/lib/rbac.ts`
- `src/lib/session.server.ts`
