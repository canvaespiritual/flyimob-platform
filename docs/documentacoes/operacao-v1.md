# Documentações — primeira camada operacional

## Estado histórico ao concluir a etapa 3 em 03/10/2026

**Atualização da etapa 4:** fundação aplicada em produção e validada; catálogo inicializado e smoke tests com rollback aprovados. Veja [ativacao-producao.md](ativacao-producao.md). O bloqueio descrito abaixo registra a situação anterior, já resolvida. A aplicação nova não foi publicada.

**Código implementado; uso real bloqueado até sincronizar o banco confirmado.**

Não foram executados deploy, commit, push, migration, seed remoto, reset ou alterações em AWS, Railway, Brevo ou Meta.

Inspeção somente de leitura: PostgreSQL remoto Railway, database `railway`, schema `public`. `.env` e `.env.local` apontam para a mesma conexão utilizada pelo Prisma e pela aplicação. A classificação produção/homologação/desenvolvimento não pode ser deduzida com segurança da conexão.

- 27 migrations locais; 26 aplicadas e concluídas; nenhuma migration desconhecida, antiga pendente ou marcada como rollback.
- Única pendente: `20261003000000_documentation_foundation`.
- Dois checksums de arquivos locais diferem dos registros aplicados: `20260915000000_add_academy_foundation` e `20260915000001_add_academy_leads_sales_webhook`. Ambos coincidem ao normalizar CRLF para LF; não foi alterado o histórico.
- Comparação read-only do schema anterior à fundação com o datasource configurado não encontrou drift estrutural. Isso não comprova equivalência de triggers ou índices parciais customizados.
- Nenhuma tabela `Documentation*`, coluna `User.sessionVersion` ou valor de enum `CORRESPONDENTE` existe no banco consultado.
- O SQL da fundação e as constraints estão no repositório; a validação real de foreign keys, índices, trigger imutável e comportamento transacional PostgreSQL depende da aplicação em ambiente confirmado.

O comando `prisma migrate deploy` não foi executado. A regra explícita do prompt impede aplicar a migration enquanto houver dúvida sobre o ambiente. Não se deve publicar este código, inclusive as mudanças anteriores de autenticação que consultam `sessionVersion`, contra esse banco ainda desatualizado.

## Rotas e permissões

| Área | Rotas | Acesso |
| --- | --- | --- |
| Visão geral/pastas | `/admin/documentacoes`, `/pastas`, `/pastas/nova`, `/pastas/[id]` | OWNER e DIRECTOR regional, mantendo política da fundação |
| Correspondentes | `/admin/documentacoes/correspondentes` | OWNER e DIRECTOR leem; somente OWNER gerencia credenciais |
| Configurações | `/admin/documentacoes/configuracoes` | OWNER e DIRECTOR leem; somente OWNER modifica |
| Resumo pessoal | `/correspondente` | CORRESPONDENTE regional; somente atribuições próprias |

APIs sob `/api/documentacoes`:

- `GET/POST pastas`; `GET/PATCH pastas/[id]`;
- `POST pastas/[id]/pessoas`; `PATCH/DELETE pastas/[id]/pessoas/[personId]`;
- `GET opcoes?kind=broker|correspondent|crm|builder|property&q=...` — até 30 resultados por busca;
- `GET/POST correspondentes`; `PATCH correspondentes/[id]`;
- `POST correspondentes/convite` e `POST correspondentes/[id]/recuperar-acesso` — reutilizam fluxos existentes, com verificação de configuração de e-mail; não testados com envio real;
- `GET/POST tipos`; `PATCH tipos/[id]`; `POST tipos/inicializar`.

Autorização é server-side antes da leitura de recursos. Toda referência usa tenant da sessão, independentemente dos valores enviados pelo navegador. Respostas próprias usam cache privado/no-store. Pasta/pessoa de outro tenant não é encontrada; mutações de tipos/usuários ausentes ou com versão divergente retornam conflito sem dados do recurso.

## Dados, catálogo e concorrência

Criação aceita CRM opcional ou titular manual; valida nome, CPF com dígitos verificadores e telefone obrigatório. O CRM fornece snapshot de nome/telefone/e-mail; não é modificado e não controla dinamicamente a pasta. Corretor deve ser BROKER ativo do tenant; correspondente opcional deve ser CORRESPONDENTE ativo. Empreendimento e construtora são validados no mesmo tenant, respeitando sua relação.

Pasta inicia em `EM_MONTAGEM`. Nesta etapa só se pode alternar para `AGUARDANDO_DOCUMENTOS`; outros estados são visíveis em consultas, sem transições operacionais. As alterações exigem a versão atual, incrementada por compare-and-swap na mesma transação dos dados e eventos. Erro de evento aborta a transação. Alterações concorrentes retornam 409 e orientam recarregar.

Pessoas permitem múltiplos vínculos iguais. O titular não pode ser removido ou reclassificado. Não se aceita segundo titular. Pessoas com documentos ou pendências não podem ser removidas; as demais são removidas com evento preservado.

O catálogo possui 20 códigos estáveis, ordem 1–20, ativo e `defaultRequired=false`. `createMany(skipDuplicates)` combinado ao índice único tenant/código insere somente faltantes, sem sobrescrever personalizações. A inicialização pode ser solicitada pelo OWNER em Configurações e também ocorre transacionalmente na criação de pasta. Não há exclusão física de tipos. Como a migration foi bloqueada, nenhum catálogo foi gravado no banco remoto. Após sincronização, cada operação pode inicializá-lo pelo botão; não existe GET com escrita implícita.

Tipos e situação de correspondentes usam `updatedAt` como versão otimista. Inativar correspondente incrementa `sessionVersion`, revogando sessões anteriores; reativar não revalida os cookies antigos. Criação direta fixa role/tenant, usa scrypt existente e não retorna senha/hash. Convites fixam CORRESPONDENTE no servidor. Recuperação usa os tokens/e-mail existentes.

## Histórico e resumo do correspondente

Eventos: FOLDER_CREATED, FOLDER_UPDATED, BROKER_ASSIGNED, CORRESPONDENT_ASSIGNED, CORRESPONDENT_CHANGED, PERSON_ADDED, PERSON_UPDATED e PERSON_REMOVED. Metadata contém IDs e nomes de campos, sem CPF, contatos, nomes de pessoas ou observações. A timeline mostra ator e data e pagina 20 eventos.

Listas de pastas/correspondentes e resumo do correspondente paginam 20 registros. Agregações usam filtros do tenant; não carregam blobs nem realizam uma consulta por pasta.

O resumo do correspondente inclui atribuições ainda em montagem para refletir o vínculo solicitado nesta etapa. Expõe somente nome do titular, data e status; não dá acesso administrativo nem à pasta completa, CPF ou observações. A policy de acesso futuro à análise continua exigindo status submetido e rodada própria. Abrir/analisar segue indisponível.

## Limites e validação

Responsividade segue classes e estrutura do painel: cards brancos, bordas, formulários em grid, ações que quebram linha e tabela com rolagem horizontal. Não houve validação visual autenticada ou teste ponta a ponta no banco, pois ele não recebeu a fundação.

Não implementados: storage/upload, presigned/finalize, preview/download, ZIP, análise, pendências operacionais, workflow de submissão/aprovação, notificações, e-mails de movimentação, OCR/IA ou integrações novas. Não há arquivos/documentos fictícios.

Comandos de validação local:

```powershell
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/documentacoes src/app/admin/documentacoes src/app/api/documentacoes src/app/correspondente/page.tsx tests/documentacoes/operations.test.ts
node --import tsx --test --test-reporter=dot tests/documentacoes/operations.test.ts tests/documentacoes/foundation.test.ts tests/academy/foundation.test.ts tests/academy/push.test.ts tests/financeiro/grouped-invoicing.test.ts tests/financeiro/receipt-remittance.test.ts
npm run build
git -c core.safecrlf=false diff --check
```

Testes usam delegates Prisma e serviços externos simulados. A garantia real de rollback, CAS concorrente e trigger PostgreSQL deve ser validada após migração em ambiente confirmado. O lint global já tinha problemas anteriores; o lint desta camada é executado separadamente.

Resultados locais: 114 testes aprovados (24 desta camada e 90 anteriores), zero falhas; Prisma validate/generate, TypeScript, lint dos arquivos novos, build e diff check aprovados. O build precisou de acesso às fontes já usadas pelo projeto; uma tentativa intermediária foi bloqueada pela rede do sandbox e outra pela engine Prisma em uso no Windows, ambas resolvidas sem alterar dependências.

Inspeção reprodutível read-only: `node scripts/documentacoes-inspect.mjs`. O script consulta metadados em transação READ ONLY e não imprime conexão, credenciais ou dados pessoais.

Próxima etapa: identificar formalmente o ambiente, sincronizar/validar a fundação e inicializar os catálogos. Só depois avançar para storage privado, upload múltiplo e classificação por pessoa/tipo com autorização segura.
