# Workflow documental V1

## Inspeção e reutilização

Reutilizados os 11 modelos existentes de Documentações, usuários/tenant, Folder.version, atribuição brokerId/correspondentId, eventos imutáveis, snapshots DocumentationRoundDocument/DocumentationAnalysisDocument, DocumentationAnalysisRound, DocumentationAnalysis, DocumentationPendingItem e comentários SHARED. O storage aprovado e seu cliente não foram redesenhados.

Inspeção encontrou estados de montagem, espera, pendências, reanálise e resultados, mas nenhum estado específico de análise em andamento. Única alteração de schema: valor EM_ANALISE no enum DocumentationFolderStatus. Migration aditiva 20261003010000_documentation_review_in_progress **aplicada em produção por prisma migrate deploy, com autorização explícita do responsável**. Confirmadas 28 migrations aplicadas, nenhuma pendente, EM_ANALISE disponível e diff banco/schema Prisma vazio. Não há tabelas/campos novos nem duplicação de estruturas.

## Estados e ações

| Ação | Origem | Destino |
| --- | --- | --- |
| Enviar | EM_MONTAGEM / AGUARDANDO_DOCUMENTOS / PRONTA_PARA_ANALISE | AGUARDANDO_CORRESPONDENTE |
| Iniciar | AGUARDANDO_CORRESPONDENTE / EM_REANALISE | EM_ANALISE |
| Solicitar correções | EM_ANALISE | PENDENCIA_DOCUMENTAL |
| Reenviar | PENDENCIA_DOCUMENTAL, todas resolvidas/canceladas | EM_REANALISE |
| Aprovar / condicionar / reprovar | EM_ANALISE | APROVADO / CONDICIONADO / REPROVADO |

EM_REANALISE representa a fila de reanálise; EM_ANALISE é análise ativa em qualquer rodada. PRONTA_PARA_ANALISE é aceito para compatibilidade; não se acrescentou outro controle manual para esse estado.

Admin regional OWNER/DIRECTOR e BROKER responsável enviam, corrigem documentos e resolvem pendências. CORRESPONDENTE atribuído e responsável pela rodada inicia, cria/revisa/cancela pendências, salva parecer e conclui. OWNER/DIRECTOR não podem produzir resultado em nome do correspondente. Plataforma, tenants divergentes, usuários não atribuídos e roles restantes são negados. O corretor recebe apenas acesso documental às suas próprias pastas, sem acesso à administração do módulo ou a observações administrativas.

Antes de enviar: correspondente ativo do mesmo tenant, ao menos um documento ACTIVE finalizado com checksum, sem uploads PROCESSING ainda válidos e sem pendências OPEN. Em reenvio, a rodada anterior deve estar fechada e a pasta em pendências. A correspondência atual é congelada na rodada.

Cada submissão cria sequence seguinte, sentAt, folderVersion, snapshot dos documentos ativos e evento com remetente/horário. DOCUMENT_REVIEW_STARTED registra persistentemente início/ator; não se duplicam esses dados em campos da rodada. Conclusão cria análise única, snapshot dos documentos analisados, closedAt e evento. Nunca reescreve análise/rodada concluída.

Pendências podem ser gerais, por pessoa/tipo ou documento do snapshot. Vínculos são validados no tenant/pasta/rodada e, quando fornecidos juntos, precisam corresponder. Revisão/cancelamento só em análise, na rodada corrente e pelo autor atual. CANCELLED existente permite corrigir apontamentos indevidos sem apagá-los. Resolução OPEN→RESOLVED só durante PENDENCIA_DOCUMENTAL pelo responsável, com ator/data persistidos. Repetição retorna conflito. Resultado PENDENCIA_DOCUMENTAL exige OPEN; demais resultados não podem abandonar OPEN. CONDICIONADO e REPROVADO exigem parecer. APROVADO aceita parecer opcional.

Parecer em elaboração usa comentário SHARED append-only, referenciado por evento da rodada contendo somente commentId. A conclusão persiste o parecer no registro de análise. Conteúdo não é incluído nos metadados de eventos. Comentários INTERNAL não são consultados por este workflow.

## Documentos e concorrência

Operações documentais e administrativas apropriadas permitidas em montagem/aguardando documentos/pendências. Espera, análise e estados terminais bloqueiam escritas. Alteração de status de pasta com pendências não pode contornar o reenvio pelo PATCH administrativo. Correspondente mantém restrição de autoria para correções; BROKER atua somente na pasta atualmente atribuída a ele. Arquivos inativos continuam sem preview/download. Nenhum objeto ou histórico é apagado automaticamente.

Toda mutação usa transação e CAS de Folder.version + status + escopo atual, inclusive notas/pendências. Criação de rodada, snapshots, resultado e auditoria são atômicos. Duplicações retornam 409, sem criar segunda rodada/conclusão. Todas as ações após envio verificam roundId da rodada corrente. Restrições SQL únicas/composite FKs da fundação permanecem como proteção adicional.

## API e telas

GET/POST `/api/documentacoes/pastas/[id]/workflow`. POST exige sessão, origem permitida, action, version e roundId (exceto submit). Ações: submit/start/issue/editIssue/cancelIssue/resolve/note/finish. Não retorna storageKey, URL S3, CPF, contatos ou observações administrativas.

Admin: aba Análise da pasta. Corretor: `/documentacoes` e `/documentacoes/pastas/[id]`, com link no painel. Correspondente: filas primeira análise/reanálise/em análise/correções/concluídas e pasta compartilhando DocumentsPanel/WorkflowPanel.

Rodadas paginadas em 10, pendências em 20. Seleção histórica mantém consulta sem permitir editar rodada anterior. Seletor de documento mostra os 100 arquivos ativos mais recentes; tipos ativos até 200. Lista de arquivos existente segue paginação própria. Não há segundo upload. Snapshots são preservados por IDs; arquivos substituídos/invalidados não são reabertos como ativos.

## Auditoria

DOCUMENT_REVIEW_SUBMITTED, DOCUMENT_REVIEW_RESUBMITTED, DOCUMENT_REVIEW_STARTED, DOCUMENT_ISSUE_CREATED, DOCUMENT_ISSUE_UPDATED, DOCUMENT_ISSUE_CANCELLED, DOCUMENT_ISSUE_RESOLVED, DOCUMENT_REVIEW_NOTE_SAVED, DOCUMENT_REVIEW_CHANGES_REQUESTED, DOCUMENT_REVIEW_APPROVED, DOCUMENT_REVIEW_CONDITIONED, DOCUMENT_REVIEW_REJECTED.

Eventos guardam roundId, ator/role/data e IDs/sequência nos metadados; nunca documentos, URL S3, tokens ou texto do parecer/pendência. O trigger imutável existente permanece intacto.

Sem notificações, regras comerciais pós-aprovação, reabertura terminal, integração externa, commit, push, deploy da aplicação ou alteração AWS. Regressão repetida após a migration: 156 testes aprovados, zero falhas; Prisma validate/generate, TypeScript, lint, build e diff check aprovados. Não houve QA sintético em produção. O responsável dispensou banco de teste/QA artificial como requisito desta publicação e realizará QA funcional posteriormente no uso normal. Nenhum bloqueio técnico identificado na revisão final.

## Verificações

Prisma validate/generate, TypeScript, lint das áreas alteradas, build Next e diff check aprovados. **156 testes aprovados, zero falhas (18 novos sobre os 138 anteriores).** Suíte final inclui Documentações, autenticação, Academy e Financeiro. Novos casos verificam ciclo com duas rodadas, resultados terminais e justificativas, referências/roles/atribuição/tenant, duplicações concorrentes, rollback da auditoria, pareceres, projeção pública, bloqueios documentais e impossibilidade de contornar pendências pelo PATCH administrativo.

```powershell
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/documentacoes src/app/admin/documentacoes src/app/api/documentacoes src/app/correspondente src/app/documentacoes tests/documentacoes/workflow.test.ts tests/documentacoes/storage.test.ts tests/documentacoes/operations.test.ts scripts/documentacoes-storage-smoke.ts
node --import tsx --test --test-reporter=spec tests/documentacoes/workflow.test.ts tests/documentacoes/storage.test.ts tests/documentacoes/operations.test.ts tests/documentacoes/foundation.test.ts tests/academy/foundation.test.ts tests/academy/push.test.ts tests/financeiro/grouped-invoicing.test.ts tests/financeiro/receipt-remittance.test.ts
npm run build
git -c core.safecrlf=false diff --check
```
