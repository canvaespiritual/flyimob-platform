# Correção de elegibilidade comercial

A auditoria identificou que Marketing usa a identidade operacional, mas aceita qualquer função. Documentações ainda exige User/BROKER e não permite pessoas sem login. Financeiro identifica beneficiários e papéis econômicos em comissões, sem campo equivalente de responsável operacional na venda; esses vínculos serão preservados.

A policy canActAsSalesResponsible centraliza BROKER, MANAGER, DIRECTOR e DIRECTION (Owner), ativos e não mesclados. Consultas continuam obrigatoriamente isoladas por operação. Esta policy não concede acesso autenticado.

Documentações receberá uma FK composta opcional para OperationPerson, com backfill somente pelo vínculo explícito User.personId. A FK legada para User fica opcional. Vínculos existentes continuam válidos após inativação ou mudança de função, inclusive durante edição de outros campos. A propriedade documental para usuários BROKER será resolvida pelo vínculo da pessoa com User, preservando RBAC. Mesclas explícitas preservam também pastas documentais.

## Resultado

- Policy única: `src/lib/team/policy.ts`, função `canActAsSalesResponsible`. A condição é função comercial, identidade ativa e não mesclada; não exige User ou participante financeiro. `DIRECTION` é a representação operacional de Owner/Direção no enum existente.
- Marketing: validação de novas atribuições e opções usam a mesma policy. Relatórios e vigências existentes não são filtrados pela função atual. Identidade, métricas e vigências anteriores permanecem preservadas.
- Documentações: novo `DocumentationFolder.responsiblePersonId`, FK composta por operação; `brokerId` legado permanece opcional. Criação/troca valida a policy; edição sem troca mantém o responsável mesmo inativo ou com outra função. Listagem, resumo, análise e portal do correspondente exibem a pessoa canônica. Interface usa “Responsável comercial”. O filtro histórico permite localizar pessoas que deixaram de ser elegíveis.
- Acesso autenticado permanece nas policies anteriores. A propriedade de pastas para User BROKER considera `OperationPerson.user`, incluindo login habilitado posteriormente, com fallback para registros legados sem pessoa. Gerentes não ganham acesso adicional por serem elegíveis operacionalmente.
- Mesclas explícitas de identidades atualizam também os vínculos documentais no serviço e no trigger de participantes financeiros. Criar login na própria identidade não altera a responsabilidade.
- Financeiro: não há campo de responsável comercial equivalente em `FinancialSale`; o papel BROKER nas comissões representa o beneficiário econômico. IDs de participantes, vendas, comissões, liquidações e regras econômicas foram preservados.
- Nenhuma alteração em OAuth, sincronização, credenciais, orçamento ou status de campanhas na Meta.

## Migration e validação

Migration aditiva `20261005130000_commercial_responsibility`, aplicada em produção em 05/10/2026 antes da publicação. Backfill determinístico por `tenantId` e `User.id → User.personId`. Nenhuma migration anterior foi editada. Não é necessário executar novamente no deploy; `prisma migrate deploy` reconhece a aplicação registrada.

Prisma validate/generate, TypeScript e build de produção passaram. Suíte completa: **326 testes, 326 passaram**, incluindo 13 novos testes de elegibilidade e regressão. Lint dos arquivos alterados sem erros/avisos; lint global conserva **122 erros e 36 avisos preexistentes**, fora deste escopo.

O script `scripts/commercial-responsibility-verify.ts` ensaiou a migration antes da aplicação em schema isolado do PostgreSQL: **9 verificações**, rollback integral e zero chamadas externas. Verificou preservação por hash dos dados anteriores, backfill, responsável sem login, mudança de função/inativação, isolamento por operação, identidade obrigatória, exclusão restrita e vínculo posterior de participante com User preservando campanhas/documentações e função DIRECTOR. Esse ensaio pressupõe o schema anterior à migration; não deve ser repetido diretamente depois de aplicada.

## Teste manual após o Railway concluir o deploy

1. Como OWNER, em Usuários/Equipe, crie uma pessoa ativa com função Diretor e sem habilitar acesso; repita com Gerente. Confirme “Sem acesso” e ausência de User criado automaticamente.
2. Em Marketing → Campanhas → Gerenciar, confirme Corretor, Gerente, Diretor e Direção/Owner ativos em “Novo responsável”. Administrativo, Parceiro, Outro e inativos não devem aparecer como novas opções.
3. Atribua uma campanha ao diretor sem login com uma data de início válida. Reabra a campanha e confirme nome, função e vigência. Em Equipe, a função deve continuar Diretor.
4. Em Documentações → Pastas → Nova pasta, selecione o mesmo diretor em “Responsável comercial”, preencha os dados obrigatórios do titular e salve. Confirme o nome na listagem, detalhe e análise. Repita com Gerente sem login.
5. Promova ou inative uma pessoa com vínculos. Campanhas, vigências, relatórios e pastas anteriores devem continuar vinculados. Ela deve desaparecer das opções de novos vínculos quando inativa. Em pasta editável, salve somente uma observação: não deve exigir trocar o responsável histórico.
6. Use o filtro “Responsável comercial” nas pastas para localizar vínculos históricos, inclusive após inativação ou mudança para função não comercial.
7. Se habilitar login posteriormente, mantenha a mesma pessoa canônica. Confirme que os vínculos não mudaram. Um User com perfil BROKER deve consultar suas próprias pastas; MANAGER não deve receber acesso novo a Documentações só pela função operacional.
8. Em outra operação, confirme que esses nomes e vínculos não aparecem. Como correspondente, confirme o nome comercial correto nas pastas já atribuídas e a manutenção das restrições de acesso.
9. Confira vendas, participantes, comissões e Academy existentes. Em Marketing, confirme filtros, histórico de atribuições e métricas anteriores, sem necessidade de reimportação.
