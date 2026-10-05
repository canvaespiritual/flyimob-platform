# Correção auditável de vigência do custo de mídia

## Auditoria antes da implementação

`MarketingCostRule` usa percentual fixo e datas diárias `[validFrom, validTo)`, com exclusão PostgreSQL contra sobreposição. A criação fecha a regra anterior e bloqueia nova vigência sobre métricas já confirmadas. Um trigger impede alterar o início ou o percentual de regras existentes.

`MarketingDailyMetric` preserva `metaSpend`, leads e demais métricas de origem separadamente de `costPercentage`, `costRuleId` e `effectiveSpend`. O gasto efetivo é materializado na importação, com arredondamento monetário decimal. Ingestão e worker mantêm o snapshot de custo em sincronizações posteriores. O relatório soma os valores materializados e distribui cada dia pela vigência do responsável.

Portanto, alterar somente a data da regra não corrigiria os relatórios. A menor evolução escolhida mantém os snapshots e o worker intactos: uma correção autorizada altera a vigência e grava um evento append-only na mesma transação. Na consulta, somente os dias alcançados por correções explícitas recebem o gasto efetivo calculado pela linha temporal corrigida, usando a mesma função `effectiveSpend`. Não há regravação das métricas, dos snapshots ou dos valores brutos. Todas as consolidações e CPLs reutilizam o relatório existente.

Prévia assinada com validade limitada vincula a revisão ao OWNER, operação, regra, motivo e linha temporal. A confirmação rejeita prévia adulterada, expirada ou desatualizada. A linha temporal completa é validada; a correção preserva fins e regras vizinhas e rejeita sobreposição. Não há ajuste silencioso de regras vizinhas.

A migration altera apenas a proteção de início da regra para permitir correção acompanhada de auditoria criada na mesma transação por OWNER ativo da operação. Percentual, identidade, operação, autor original e demais proteções continuam intactos. Nenhuma regra real será corrigida automaticamente durante a publicação: o OWNER fará a revisão e confirmação na interface.

## Implementação

- `src/lib/marketing/cost-corrections.server.ts`: validação da linha temporal, prévia HMAC com duração de 15 minutos, confirmação em transação serializável e recálculo transitório na leitura dos dias corrigidos.
- `src/app/api/marketing/settings/cost-rules/[id]/validity/route.ts`: POST revisa; PATCH exige confirmação e prévia válida; GET consulta a auditoria paginada. Todos exigem OWNER da operação.
- `src/app/admin/marketing/cost-validity-correction.tsx` e `ui.tsx`: ação discreta por regra, percentual/início atual somente leitura, novo início, motivo obrigatório, revisão com intervalo inclusivo exibido, checkbox e botão de confirmação. Histórico mostra antes/depois, percentual, autor, timestamp e motivo, com paginação.
- `src/lib/marketing/queries.server.ts`: relatório usa uma leitura consistente de métricas, eventos e regras. Aplica a mesma função de gasto efetivo nos dias afetados e mantém consolidações, vigências dos responsáveis, CPL, filtros e moedas existentes. Sem correções, utiliza o snapshot original.
- `tests/marketing/cost-corrections.test.ts`: 15 testes adicionais.
- `scripts/marketing-cost-correction-verify.ts`: ensaio PostgreSQL em schema isolado, sem copiar registros reais e com rollback integral.

Não foram alterados o schema Prisma, a fórmula, a ingestão, o worker, OAuth, responsáveis, Documentações, Financeiro, Academy, equipe ou secrets. O relatório recalcula somente em memória; não existe UPDATE das métricas ou dos snapshots.

## Auditoria e migration

Evento permanente `COST_RULE_VALIDITY_CORRECTED` em `MarketingAuditEvent`, usando a estrutura existente: `entityId` identifica a regra; `tenantId` a operação; `actorId` o OWNER; `createdAt` o timestamp automático. `metadata.percentage` guarda o percentual; `before` contém início/fim anteriores; `after` contém início/fim novos, intervalo afetado exclusivo no fim e motivo obrigatório. O trigger append-only continua impedindo atualizar ou excluir eventos.

A migration `20261005140000_marketing_cost_validity_correction` substitui somente a função de proteção da regra, sem remover o trigger ou as constraints. Alterar o início exige evento correspondente criado na mesma transação, por User OWNER ativo da mesma operação e fora da plataforma. O percentual e o criador original seguem imutáveis. A exclusão GiST continua impedindo duas regras vigentes no mesmo dia. A aplicação da migration não altera nenhuma regra real nem métrica.

Não há variáveis de ambiente novas: a revisão assinada reutiliza a `SESSION_SECRET` já usada pela autenticação, sem expor ou modificar seu valor.

A migration foi aplicada no PostgreSQL de produção em 05/10/2026 antes do push. O deploy não precisa aplicá-la novamente; `prisma migrate deploy` reconhecerá seu registro existente.

## Validações

Prisma validate/generate, TypeScript, lint dos arquivos alterados e build de produção passaram. Suíte de Marketing, Documentações, Financeiro e Academy: **341 testes, todos aprovados**.

PostgreSQL: **14 verificações aprovadas**, incluindo alteração 05/10 → 01/04 com auditoria OWNER, bloqueio de ausência de auditoria/ator incorreto/outra operação/datas divergentes, autor/timestamp/metadados corretos, hash de todos os campos da métrica integralmente preservado, percentual imutável, proibição de excluir regra ou alterar/excluir auditoria, manutenção do snapshot confirmado e rejeição de sobreposição. Schema e fixtures removidos por rollback; zero chamadas externas e zero regras reais corrigidas.

## Teste manual após o deploy

1. Entre como OWNER em Marketing → Configurações → Regra de custo de mídia. Na regra de 12,15% iniciada em 05/10/2026, clique em **Corrigir vigência**.
2. Informe **01/04/2026** e o motivo: “Correção da vigência inicial cadastrada incorretamente na implantação do módulo.”
3. Clique em **Revisar correção**. Confira percentual 12,15%, início anterior 05/10/2026, início novo 01/04/2026 e período afetado **01/04/2026 a 04/10/2026**. Até aqui nada é salvo. Cancelar mantém a regra anterior.
4. Marque a confirmação e clique em **Confirmar correção**. Confira a tabela com início 01/04/2026 e o mesmo percentual/fim. Abra novamente a ação e expanda **Histórico de correções** para conferir antes/depois, usuário, timestamp e motivo.
5. No relatório, escolha um período a partir de 01/04/2026 até 04/10/2026. Confira que investimento Meta, leads, impressões e cliques permanecem iguais. Gasto efetivo e CPL devem incorporar 12,15%, respeitando o arredondamento monetário diário já existente. Confira totais, campanhas e responsáveis, incluindo os filtros por período e responsável.
6. Consulte um período anterior a 01/04/2026: ele não deve receber esse acréscimo. Consulte 05/10/2026 em diante: preserve a regra aplicável a cada dia.
7. Execute **Atualizar** se desejar a leitura habitual da Meta; após concluída, consulte novamente o período corrigido e confirme a manutenção do efeito da correção.
8. Como DIRECTOR/MANAGER/BROKER, confirme ausência de acesso à correção; chamadas ao endpoint são bloqueadas também no backend. Na outra operação, a regra e seu histórico não aparecem.
9. Se houver outra regra vizinha, tentar uma data que a sobreponha deve ser recusado já na revisão. Uma revisão que expirar ou cuja linha temporal mudar exige nova revisão.

Não há correção automática de dados durante o deploy. A confirmação da mudança real permanece com o OWNER.
