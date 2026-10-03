# Documentações — ativação da fundação em produção (03/10/2026)

O responsável confirmou explicitamente que o PostgreSQL Railway configurado é produção e autorizou a única migration documental pendente. Não houve deploy da aplicação, commit, push, alteração de configurações externas ou envio de e-mails.

## Revisão e aplicação

Antes: 27 migrations locais, 26 aplicadas, nenhuma desconhecida ou falha; apenas `20261003000000_documentation_foundation` pendente. Dois checksums da Academy coincidem após normalizar CRLF/LF. Migrations antigas não foram alteradas. A comparação read-only do schema anterior com o datasource foi vazia.

O SQL foi lido integralmente: nenhuma exclusão ou transformação de dados, roles existentes preservadas, nova coluna `sessionVersion NOT NULL DEFAULT 0`, novas entidades, relações e constraints. A adição com default constante em PostgreSQL moderno não exige reescrever a tabela; exige lock DDL. Os quatro índices em tabelas antigas exigem varredura e podem bloquear escrita durante sua criação. As tabelas verificadas tinham tamanhos totais entre 64 e 200 KiB e poucos registros estimados. Os demais índices/triggers são em tabelas novas. A adição do enum não cria usuários com a nova role.

Aplicado com `node node_modules/prisma/build/index.js migrate deploy`, equivalente ao fluxo Prisma de produção. Resultado: sucesso em aproximadamente 8 segundos. Nenhuma outra migration foi executada. Não foram usados reset ou db push.

Depois: 27 migrations aplicadas, nenhuma pendente; `migrate status` atualizado; comparação do schema Prisma atual com o datasource vazia.

## Estrutura real validada

`scripts/documentacoes-activation.ts --inspect` consulta metadados em transação READ ONLY e compara-os com o SQL revisado:

- 11 tabelas documentais;
- 49 índices válidos adicionados pela migration, incluindo os índices compostos e o índice único parcial de titular;
- 41 constraints adicionais validadas, incluindo checks e FKs com colunas, tenant/pasta e políticas RESTRICT/CASCADE conferidas;
- sete enums documentais conferidos e todas as seis roles presentes, sem perda das anteriores;
- seis colunas monetárias Decimal(18,2);
- `User.sessionVersion` NOT NULL, default 0, todos os usuários existentes com valor 0;
- trigger de eventos habilitado para UPDATE e DELETE;
- sessão legada sem `sv` compatível com o usuário existente de versão zero, usando contexto local de sessão e sem expor cookie.

## Catálogo

Tenant operacional selecionado: **FlyImob Brasília**, slug `fly-imob-brasilia`, ID `cmjjziyt30004wjwkr45f3vgf`, com OWNER e BROKER ativos. O tenant `flyimob` é plataforma; outro cadastro de Brasília não possui usuários. Não se gravou catálogo nesses tenants nem nas outras operações.

`--seed` reutiliza `ensureCatalog` da camada operacional:

| Execução | Inseridos | Total no tenant |
| --- | ---: | ---: |
| Primeira | 20 | 20 |
| Segunda | 0 | 20 |

Todos `defaultRequired=false`, sem sobrescrever personalizações. Este catálogo é a única gravação operacional permanente desta etapa, além da migration e de seu registro Prisma.

## Smoke real com rollback

`--smoke` usa uma transação externa com rollback intencional e savepoints para testar os serviços existentes e recuperar erros esperados. Nenhuma alteração sintética é commitada. Usuários OWNER/BROKER reais servem apenas como referências de FK, sem alterações. Demais usuários, tenant, construtora, empreendimento, pastas e pessoas são sintéticos. Não existe envio externo nem arquivo real.

Resultados aprovados:

- Pasta com titular, tenant correto, corretor válido, status EM_MONTAGEM, version 0 e eventos reais.
- Cônjuge, dois fiadores, edição e remoção segura, preservação do titular; segundo titular recusado pelo serviço e também diretamente pelo índice PostgreSQL.
- Correspondentes sintéticos com hash scrypt compatível, atribuição/troca, consulta exclusiva das atribuições, negativa de administração e de análise não submetida.
- Negativa de pasta/pessoa/corretor/correspondente/construtora/empreendimento de outro tenant. A FK composta também recusou diretamente pessoa de outro tenant em documento sintético sem arquivo.
- Atualização incrementa version; nova tentativa com versão antiga recebe DocumentationError 409; estado recente permanece intacto.
- Os oito eventos previstos foram produzidos. Metadata não contém CPF, telefone, e-mail, observação, senha, hash ou token.
- INSERT de evento permitido; UPDATE/DELETE recusados por `DocumentationEvent is append-only`, SQLSTATE 23000.
- Catálogo listado, editado, reordenado, inativado e reativado dentro da transação, com rollback.

Depois do rollback, verificações por IDs e marcador confirmaram: **nenhum dado sintético permaneceu no banco de produção**. As mensagens Prisma P2002, P2003 e append-only durante o teste são negativas esperadas, não falhas de ativação.

## APIs e interface

`--queries` executou os handlers reais com contexto local de sessão autenticada, consultando produção: pastas/cards, filtros, correspondentes, configurações e opções de corretor/correspondente/CRM/construtora/empreendimento. Todos responderam 200, com JSON serializável. Pasta inexistente retornou 404; anônimo retornou 401. Não há mocks nessas consultas de leitura.

Isso valida as queries que alimentam `/admin/documentacoes`, `/pastas`, `/correspondentes` e `/configuracoes`, mas **não representa login nem navegação visual em navegador**. Não foram usadas credenciais reais de login ou publicada uma conta sintética para validar a interface. O correspondente foi validado nos serviços/consultas reais dentro do rollback e na regressão automatizada; não houve login de correspondente no navegador. Formulários e comportamento visual continuam sujeitos à revisão manual antes da publicação.

## Validação local

Prisma validate/generate aprovados; TypeScript aprovado; 114 testes automatizados aprovados (Documentações, autenticação, Academy e Financeiro); lint do script de ativação e diff check aprovados. Build Next executado sem deploy.

Comandos dos smoke tests (somente repetir com autorização explícita de produção):

```powershell
node --import tsx scripts/documentacoes-activation.ts --inspect
node --import tsx scripts/documentacoes-activation.ts --seed
node --import tsx scripts/documentacoes-activation.ts --smoke
node --import tsx scripts/documentacoes-activation.ts --queries
```

Nenhuma correção no código da aplicação foi necessária. O teste de enum foi ajustado para conferir o conjunto de roles sem presumir a ordem histórica. O script de inspeção aceita `--production-confirmed` para registrar a confirmação explícita do operador, sem deduzir o ambiente.

Situação: **PRONTO PARA REVISÃO**. Banco sincronizado e fundação operacional validada; publicação não realizada. Resta revisar a experiência visual autenticada.

Próxima etapa: storage documental privado + upload múltiplo + classificação por Pessoa/Tipo + upload pelo correspondente + preview/download autorizado. Não implementada nesta ativação.
