# Reabertura e respostas do correspondente

## Operação

O fluxo de pendências permanece: o correspondente registra correções e conclui com PENDENCIA_DOCUMENTAL; o responsável corrige os arquivos, resolve os apontamentos e reenvia para EM_REANALISE.

Uma pasta REPROVADO pode ser reaberta pelo OWNER/DIRECTOR ou BROKER atualmente responsável, com motivo obrigatório. A ação muda a pasta para PENDENCIA_DOCUMENTAL para preparar os ajustes. Não altera a análise, o fechamento ou os snapshots anteriores e não envia automaticamente ao correspondente. Não cria pendências fictícias em nome dele.

Após os ajustes, “Reenviar para análise” cria a próxima rodada. O campo de resposta aceita esclarecimentos sem exigir documentos novos. Continuam obrigatórios ao menos um documento ativo finalizado, correspondente ativo e ausência de pendências abertas. A resposta é um comentário SHARED, vinculado à rodada por evento com commentId, e aparece nas mensagens da rodada para ambos os lados. O motivo da reabertura fica nas mensagens da rodada anterior. Mensagens exibem os últimos 50 registros da rodada selecionada.

REPROVADO anterior permanece como resultado histórico mesmo quando a operação interpreta o parecer como uma solicitação de correção. Pastas APROVADO/CONDICIONADO não são reabertas por esta ação. Versão, rodada atual, escopo e auditoria transacional continuam obrigatórios.

## Notificações

Componente no layout raiz, ativo nas áreas internas admin, documentações, academy-admin e corretor-academy. OWNER/DIRECTOR recebem respostas das pastas do tenant; BROKER recebe somente das pastas atualmente atribuídas a ele. Plataforma e correspondente não recebem esta central.

Eventos existentes do correspondente alimentam o aviso: resultado, parecer compartilhado, criação/revisão/cancelamento de pendência e documento anexado. Não há cópia de mensagens ou documentos na notificação. “Ver pasta” abre a análise no administrativo. O conteúdo completo permanece na pasta autenticada.

Aviso ao encontrar resposta não lida, sino persistente com contador e central paginada com Não lidas/Todas. Fechar o aviso, navegar ou abrir a pasta não marca leitura. Somente “Marcar como lida” cria o recibo por usuário/evento, persistente e idempotente. Uma resposta nova exige uma leitura nova. Leitura não resolve pendência.

Atualização a cada 20 segundos com a página visível e ao retomar o foco/visibilidade. Não usa push do navegador ou e-mail. Eventos anteriores à instalação também aparecem como não lidos até a marcação individual. Não lidas têm paginação independente para não esconder respostas antigas. Falhas de atualização ficam visíveis.

## Banco e liberação

## Acompanhamento por rodada

Cada rodada tem `firstViewedAt` próprio. A abertura é confirmada por POST autenticado depois que a pasta carregou na tela visível do correspondente. Login, lista de clientes, prefetch e GET não produzem visualização. O servidor valida tenant, papel, atribuição e rodada atual. Um lock na pasta serializa abertura com envio/troca de correspondente; timestamp e evento `DOCUMENT_REVIEW_VIEWED` são persistidos na mesma transação. Não muda Folder.version nem inicia a análise. Reaberturas da mesma rodada não criam novos eventos; reanálise tem um timestamp novo, inicialmente nulo.

“Acompanhamento” aparece como coluna na listagem, no resumo e na análise, com enviada/visualizada/início. O início usa o evento `DOCUMENT_REVIEW_STARTED` existente, sem inventar datas. Rodadas antigas concluídas continuam sem visualização registrada; não há backfill. Visualização e início geram notificações internas pelo mesmo feed de respostas. A migration adicional `20261013020000_documentation_round_first_view` acrescenta somente uma coluna nullable.

## Preparação da publicação

Migration aditiva `20261013010000_documentation_notification_reads`: índice único composto nos eventos e tabela de recibos com FKs compostas para evento/pasta/tenant e usuário/tenant. Eventos imutáveis não são atualizados. Aplicar a migration pelo fluxo habitual antes de publicar a versão que usa as notificações. A implementação local não aplica migrations nem altera as pastas reais automaticamente.

Verificação local: testes de workflow (reabertura, reenvio textual, histórico, bloqueios e rollback), notificações (escopo, paginação, projeção, recibos e autenticação) e regressão de Documentações. Testes usam dados simulados, sem banco ou storage de produção.

Resultado: 134 testes aprovados; Prisma validate/generate, TypeScript, lint dos arquivos alterados, build de produção e diff check aprovados. O build precisou de acesso fora do sandbox às fontes Google já usadas no projeto. Não houve QA visual autenticado, aplicação da migration, commit, push ou deploy nesta entrega.

Atualização de 13/10/2026: o responsável autorizou implementar o acompanhamento e publicar o conjunto, incluindo migration e deploy. Regressão documental completa agora com 172 testes aprovados, incluindo concorrência/idempotência, permissões, rollback e renderização dos marcos. Build completo aprovado. Preflight confrontou em memória as identidades de conexão local/remota e o serviço `flyimob-platform` do projeto `flyimob`, ambiente production; os 38 checksums aplicados correspondem aos arquivos locais (aceitando a normalização CRLF/LF). Somente as duas migrations desta entrega estão pendentes. O script `scripts/documentacoes-release-check.mjs` não imprime variáveis e recusa outro alvo, checksum divergente, migrations desconhecidas ou falhas.

A comparação prévia do schema também mostrou uma divergência anterior no nome da FK de `TrainingAccess` (`TrainingAccess_user_fkey` no banco). As migrations desta entrega não renomeiam essa FK nem alteram Treinamentos.

As duas migrations foram aplicadas com sucesso pelo `prisma migrate deploy` autorizado. Confirmadas 40 migrations aplicadas, coluna `firstViewedAt` e três constraints válidas (PK e FKs compostas) nos recibos. Não houve reabertura automática de pastas nem backfill de visualizações.
