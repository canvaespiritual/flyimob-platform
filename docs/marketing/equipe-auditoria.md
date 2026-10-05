# Auditoria anterior à evolução de equipe

Auditoria de 05/10/2026, sobre ea281c5, antes de alterar implementação.

- `User` pertence diretamente a um `Tenant`: não há membership canônico separado. Seu `UserRole` controla autenticação/RBAC; e-mail é obrigatório e globalmente único, senha usa scrypt e sessão possui versão revogável.
- `FinancialParticipant` identifica a participação econômica pelo ID existente. PIX, direitos, pagamentos, ajustes, liquidações e documentos referenciam esse ID. `userId` é opcional, com unicidade por operação. Vendas e seus estágios mantêm referências financeiras independentes do responsável de Marketing.
- `/admin/usuarios` usa `users:read` (atualmente OWNER), consulta exclusivamente `User` com escopo de operação e oferece convite/ativação. DIRECTOR não recebe gestão de usuários pelo RBAC atual.
- Financeiro > Participantes consulta `FinancialParticipant` e suas relações financeiras, incluindo inativos para histórico. A criação/edição permite vínculo explícito a usuário da mesma operação.
- Marketing aceita OWNER/DIRECTOR. Tanto o seletor quanto a validação de atribuição restringem `User.role = BROKER`. Portanto OWNER/DIRECTOR não aparecem e participantes sem User nunca aparecem. A ausência de usuários BROKER explica o seletor vazio descrito; não é falha de OAuth ou ausência de participantes.
- `CampaignBrokerAssignment` aponta obrigatoriamente para User; intervalos inclusivos no início/exclusivos no fim têm exclusão PostgreSQL contra sobreposição. O status Meta (`sourceStatus`/`effectiveStatus`) é independente de `trackingStatus` interno.
- Reset de senha existente tem token aleatório de 32 bytes, validade de uma hora, claim atômico, scrypt e incremento de `sessionVersion`. Pode servir ao primeiro acesso sem senha administrativa.

## Decisão

Adicionar uma identidade `OperationPerson` de equipe, sem autenticação ou dados financeiros. User e FinancialParticipant recebem vínculos opcionais únicos para ela; seus IDs e relações continuam existentes. Papel operacional e ativação pertencem à identidade, não ao RBAC. Apenas vínculos explícitos existentes por FK entram no backfill; nomes/e-mails não unem pessoas.

Atribuições recebem `personId` opcional e mantêm o `brokerId` legado, que passa a opcional para novas pessoas sem login. Vigências, IDs e histórico permanecem. Uma união manual retargeta apenas a referência operacional de atribuições e guarda a identidade anterior como redirecionamento, sem tocar métricas ou registros financeiros.

Novos usuários/participantes materializam identidade por triggers locais, inclusive nos fluxos antigos. Alterações explícitas do vínculo financeiro usam o mesmo mecanismo de união, com escopo por operação. Pessoas independentes podem ser criadas sem User/participante. OWNER administra equipe; DIRECTOR conserva acesso a Financeiro/Marketing e suas atribuições, sem adquirir gestão de equipe.
