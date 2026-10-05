# Validação de Marketing V1 — 03/10/2026

> Validação histórica da fundação. Resultados e configuração da integração de 05/10/2026 estão em [Marketing Meta V1](meta-v1.md).

## Banco

A inspeção de leitura confirmou que todas as migrations anteriores estavam aplicadas. Checksums anteriores corresponderam ao conteúdo local, com normalização LF nos dois arquivos Academy originalmente gravados com outra terminação de linha. Não foram alteradas migrations anteriores.

Migration `20261003020000_marketing_foundation` revisada e aplicada por `prisma migrate deploy`, conforme autorização desta rodada. Operação aditiva: nove tabelas novas, cinco enums, relações compostas, índices, checks e triggers de Marketing; extensão btree_gist para constraints de exclusão. Nenhuma transformação/remoção de dados existentes. Inspeção posterior confirmou as nove tabelas e as exclusões de atribuição/custo. A aplicação web não foi publicada.

O script `scripts/marketing-verify.ts --rollback-test` validou treze grupos de invariantes no PostgreSQL: duas conexões para uma conta canônica; FK de tenant; unicidade da conta; regras sem sobreposição; percentual histórico imutável; atribuição sem sobreposição; snapshot de custo preservado; atualização de acumulados e histórico por corretor; cancelamento preservado; envelope de credencial; tarefas idempotentes/claim/retry/recuperação/lease; auditoria imutável; allowlist de metadata.

Todas as fixtures foram criadas dentro de uma única transação Serializable que terminou com rollback obrigatório. Consulta posterior confirmou **zero tenants sintéticos remanescentes**, com rollback das entidades dependentes. Nenhuma chamada à Meta ou AWS. Nenhum seed comercial.

## Verificações locais

- Prisma validate e generate: aprovados.
- TypeScript sem emissão: aprovado.
- ESLint dos novos serviços, APIs, telas, testes e script de validação: aprovado.
- AdminShell: zero erros; um warning preexistente de `<img>`.
- Suíte nova: 32 testes aprovados.
- Regressão de Documentações, Financeiro e Academy: 218 testes aprovados.
- Total: **250 testes, zero falhas**.
- Build Next/Prisma: aprovado; mantém avisos existentes de middleware, baseline-browser-mapping e configuração Prisma no package.json.
- git diff --check: aprovado.

O primeiro build sem acesso de rede falhou no download das fontes Geist já utilizadas pelo projeto. O build com acesso autorizado passou. Um build posterior encontrou o DLL Prisma em uso pelo servidor local no Windows; o servidor foi encerrado para liberar o arquivo. Nenhuma fonte ou dependência foi alterada para contornar essas limitações.

## Interface

As três telas foram inspecionadas no navegador local em modo exclusivamente de leitura. Confirmados menu Marketing, navegação entre páginas, filtros, estados vazios, Meta não autorizada, botão de sincronização indisponível e formulário de preparação de cadastro sem autorização. Revisão de desktop e celular; geometria da tela móvel de Configurações confirmou ausência de overflow horizontal.

O proxy temporário de inspeção só encaminhava GET, mantinha a sessão no backend e bloqueava gravações. Não houve submissão de conexão, regra ou campanha no banco pela interface. Proxy e sessão foram encerrados e o script temporário foi removido. A interação de telas preenchidas e sucesso de formulários foi validada pelos serviços/testes, sem sessões HTTP que deixassem dados sintéticos persistidos.

## Limites e próxima etapa

Não há autorização OAuth, criptografia operacional de tokens, adaptador Meta, descoberta de ativos, importação real, webhook ou worker ativo. A credencial possui somente um envelope reservado, nulo nesta V1. Antes de ativar o worker real, vincular a persistência ao lease da execução e definir a métrica Meta considerada lead.

Relatórios usam finalidade atual da campanha. Atribuições retroativas são correções explícitas auditadas. Datas são dias locais das contas, com atalhos administrativos em America/Sao_Paulo; moedas são separadas. Sem regra, acréscimo zero; CPL sem leads é ausente.

CRM, Documentações, Financeiro, AWS, configuração externa Railway e autenticação da aplicação não foram alterados. Nenhum vínculo com lead individual ou venda. Sem commit, push ou deploy.

Classificação: **PRONTO PARA REVISÃO**.
