# Documentações — storage privado, upload e acesso (etapa 5)

## Estado atual

Atualização posterior: bucket definitivo `flyimob-documentacoes2` em `us-east-2`, variável local ajustada e integração real aprovada. Os quatro controles privados, Put/Get, bytes/SHA-256, rotas documentais autenticadas, substituição/invalidação e limpeza foram verificados. Consulte [validação real](./validacao-storage-real.md). Os demais registros de bloqueio nesta página descrevem o estado histórico ao concluir a implementação da etapa 5.

Na etapa seguinte, [workflow V1](./workflow-v1.md) acrescenta acesso documental do BROKER somente às suas próprias pastas e permite correções em PENDENCIA_DOCUMENTAL. Os estados de espera, análise e conclusão bloqueiam escritas. O storage e suas garantias não foram redesenhados.

Implementação concluída no código, sem deploy/commit/push. **Uso real de arquivos bloqueado enquanto não houver bucket documental privado configurado.** A inspeção local encontrou região/credenciais S3 existentes, mas não `AWS_S3_DOCUMENTATION_BUCKET`. Não foi escolhido um bucket arbitrário, criada infraestrutura ou alterada configuração AWS/Railway. Não houve envio de e-mail.

O schema Prisma não mudou nesta etapa e nenhuma migration foi criada ou aplicada. Reutiliza DocumentationDocument e DocumentationEvent da fundação já aplicada. O catálogo permanece inalterado, sem tipos exclusivos para correspondente.

## Arquitetura

Reutiliza cliente S3/credenciais/região existentes, com camada própria em `storage.server.ts`. Exige bucket dedicado, diferente de `AWS_S3_BUCKET`, na mesma região do cliente existente.

Chave: `documentacoes/{tenantId}/{folderId}/{UUID aleatório}`. Não contém pessoa, CPF, nome de arquivo ou tipo documental. A API retorna documentId, nunca bucket/storageKey. O banco guarda storageKey e metadados, sem URL pública ou assinada.

Objetos recebem SSE-S3 AES256 e `Cache-Control: private, no-store`, sem ACL pública. Antes de gravar ou ler, o backend exige os quatro controles Block Public Access do bucket habilitados. Se a configuração não puder ser comprovada, responde 503. A escrita condicional `If-None-Match: *` impede regravar uma chave já existente. Substituições sempre têm chave nova.

Escolha deliberada desta V1: **upload pelo backend, sem presigned PUT/POST**. Permite validar bytes antes de gravar e elimina uma autorização de escrita reutilizável depois da finalização. Evita configurar CORS e instalar SDK adicional. Em troca, até 15 MiB atravessam o servidor por arquivo; os limites de body/timeouts do host devem permitir isso antes de publicar. A autorização PROCESSING expira após 30 minutos; não existe URL temporária a compartilhar.

Preview/download também passam pelo backend autenticado. O objeto é lido de forma limitada, validado integralmente e só então devolvido; não se trata de streaming de ponta a ponta e não há redirect/presigned GET. Cada requisição exige sessão válida e autorização corrente. Não há cache documental no service worker existente, que permanece restrito à Academy.

## Fluxo e validação

1. POST de início valida sessão, tenant, role, pasta/atribuição, version, pessoa, tipo ativo, nome/extensão/MIME/tamanho e configuração privada.
2. Na transação, incrementa version, cria PROCESSING com chave própria e registra DOCUMENT_UPLOAD_STARTED. Até 30 autorizações recentes podem estar pendentes por pasta.
3. PUT de bytes exige o uploader original, sessão/atribuição atual e PROCESSING não expirado. Leitura incremental interrompe acima do tamanho autorizado, mesmo sem Content-Length.
4. Conteúdo passa por assinatura e parser/decoder: PDF via pdf-lib, PNG/JPEG via sharp, limite de 20 milhões de pixels, uma imagem por arquivo. PDF protegido, sem páginas, com mais de 2000 páginas, ações JavaScript/Launch/OpenAction/AA, anexos, XFA/RichMedia ou estrutura inválida é recusado. SVG/HTML/Office/ZIP/WebP não são aceitos nesta V1.
5. SHA-256 é calculado pelo servidor; PutObject usa escrita condicional e metadata opaca da autorização e checksum, sem nome original/CPF no objeto.
6. Finalizar recebe documentId/version, nunca storageKey. HEAD confirma tamanho, MIME, documentId, tenant, folder, uploader e checksum. GET condicional ao ETag lê o mesmo objeto, com tamanho limitado. Bytes são novamente validados e SHA-256 confirmado.
7. Nova transação revalida pasta/atribuição/estado/referências/versão, ativa o documento e registra DOCUMENT_ADDED. Finalize já ACTIVE do mesmo uploader é idempotente. Falha de evento aborta alteração do banco.

Formato e tamanho declarados não bastam para ativar um arquivo. Não há antivírus/CDR nesta etapa: parser, magic bytes, restrição de formatos e bloqueio de ações PDF reduzem risco, mas não garantem ausência de todo malware ou vulnerabilidade de visualizador.

## Autorizações e concorrência

OWNER/DIRECTOR regional podem consultar e administrar documentos de seu tenant. CORRESPONDENTE só acessa documentos das pastas atualmente atribuídas a ele; pode corrigir apenas os que ele próprio enviou com origem CORRESPONDENT. BROKER, plataforma, tenants divergentes e demais roles não ganham acesso documental.

A policy documental é própria e permite acesso por atribuição mesmo antes de submissão formal. Não altera a policy de análise, que continua exigindo status submetido/rodada. Correspondente não recebe observações administrativas, comentários internos, CPF/contatos na página documental, configurações ou APIs de alteração de pessoas/responsáveis.

Escritas documentais são permitidas em EM_MONTAGEM e AGUARDANDO_DOCUMENTOS; demais estados são somente leitura nesta V1. Início, finalização e invalidação usam version da pasta como compare-and-swap. Metadata enviado pelo cliente não determina tenant/uploader/origem. Pessoa deve pertencer ao mesmo tenant e pasta; tipo deve ser ativo no tenant.

Download revalida atribuição e estado ACTIVE depois do I/O de storage. Invalidados, substituídos e PROCESSING não podem ser baixados nem visualizados. CORRESPONDENTE lista somente ACTIVE, mesmo forjando audit=true. OWNER/DIRECTOR podem listar histórico paginado com os metadados preservados.

## Auditoria e versões

- Invalidação: ACTIVE → INVALIDATED, motivo obrigatório em replacementReason, ator/data no evento imutável. Objeto físico preservado.
- Substituição: cria PROCESSING novo com replacedDocumentId e motivo obrigatório. Original permanece ACTIVE até finalizar. Finalização atomicamente muda o original para REPLACED, o novo para ACTIVE e registra eventos. Se o anterior foi alterado, a finalização é recusada.
- Eventos: DOCUMENT_UPLOAD_STARTED, DOCUMENT_ADDED, DOCUMENT_INVALIDATED e DOCUMENT_REPLACED. Metadata contém somente IDs; não inclui nome de arquivo, motivo, conteúdo, CPF, URL, hash ou token.
- Não foi acrescentado DOCUMENT_DOWNLOADED para evitar ruído na timeline. Não existe nova estrutura de log de acesso nesta etapa.

## UX

A aba Documentos do admin e `/correspondente/pastas/[id]` usam o mesmo componente. Fila de até 20 arquivos com classificação Pessoa/Tipo por arquivo, Pessoa para todos, upload geral/sem pessoa, upload direto pela categoria selecionada e ações de substituição/invalidação conforme capacidades do servidor.

Envios sequenciais limitam pressão de memória e permitem atualizar version entre arquivos. Cada arquivo mostra aguardando/enviando/validando/concluído/erro e progresso de transporte por XMLHttpRequest. Erro não cancela os demais; fila mantém arquivo/classificação e authorizationId para repetir PUT/finalize. Uma classificação autorizada não pode mudar silenciosamente durante o envio.

Fila fica em memória; recarregar/fechar a página perde arquivos locais não concluídos. Upload com objeto já recebido pode ser finalizado novamente; admin vê pendentes próprios no histórico e possui ação de tentar finalizar. Autorizações expiradas reiniciam no próximo retry, mantendo arquivo e classificação na fila. Não há drag-and-drop, câmera/scanner ou classificação automática.

Documentos são organizados por pessoa, com categoria, nome, tamanho, remetente, role/origem, data e status. Listagem pagina 30 documentos e identifica quando não há arquivo na página; não carrega tudo indefinidamente. Preview abre nova aba com viewer nativo do navegador; download usa disposition sanitizada. PDFs não recebem CSP sandbox porque esse header pode bloquear o viewer nativo do Chromium; imagens mantêm sandbox. Ações PDF perigosas são recusadas pelo parser. Referência: [issue oficial Chromium](https://issues.chromium.org/issues/40754148).

## Endpoints

Sob `/api/documentacoes/pastas/[id]/documentos`:

| Método | Caminho | Função |
| --- | --- | --- |
| GET | raiz | Lista documentos, pessoas e tipos; audit somente admin |
| POST | raiz | Inicia autorização PROCESSING |
| PUT | `[documentId]/upload` | Recebe bytes limitados e grava objeto privado |
| POST | `[documentId]/finalizar` | Confirma storage/integridade e ativa |
| POST | `[documentId]/invalidar` | Invalida logicamente com motivo |
| GET | `[documentId]/arquivo` | Preview autenticado |
| GET | `[documentId]/arquivo?download=true` | Download autenticado |

`GET /api/documentacoes/correspondente/pastas/[id]` retorna apenas o resumo permitido da atribuição. Rotas de escrita rejeitam Origin divergente/Sec-Fetch-Site cross-site. Respostas de arquivo têm no-store, nosniff, CSP default-src none/frame-ancestors self (sandbox adicional para imagens), SAMEORIGIN, CORP same-origin e referrer-policy no-referrer. Nome original não pode injetar headers ou virar caminho.

## Configuração externa necessária — NÃO executada

1. Disponibilizar bucket dedicado privado na região já usada por AWS_REGION.
2. Habilitar os quatro controles Block Public Access e, preferencialmente, BucketOwnerEnforced. Não conectar a CDN/website/API pública que exponha o prefixo.
3. Definir AWS_S3_DOCUMENTATION_BUCKET para o backend local e, no momento autorizado, para a aplicação publicada. Não reutilizar o bucket público atual.
4. Conceder ao principal existente somente as permissões necessárias para o novo bucket/prefixo. Template de IAM, ainda não aplicado:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetBucketPublicAccessBlock",
      "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET/documentacoes/*"
    }
  ]
}
```

Recomenda-se policy do prefixo que exija TLS e escrita If-None-Match, sem revogar permissões dos uploads antigos. Para uma limpeza futura, DeleteObject deve ser restrito ao operador autorizado; não é necessário para o fluxo normal. A aplicação não requer ListBucket, CORS de navegador ou acesso público.

5. Confirmar limite de request ≥15 MiB, timeout compatível e memória para decoder/validação no host Next. Com serverless/proxy que imponha body menor, não publicar sem adaptar a arquitetura para staging direto + promoção imutável após verificação.
6. Depois da configuração, realizar smoke sintético real e QA de preview/upload em desktop/celular, com limpeza dos objetos de teste.

Referências oficiais: [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html), [escritas condicionais](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

## Limpeza futura de PROCESSING

Não foi criado cron/job nem feita exclusão física operacional. Autorizações expiram em 30 minutos; pendentes antigos continuam identificáveis por status/createdAt e não aparecem na lista padrão. Falha/abandono pode deixar objeto privado e registro PROCESSING.

Procedimento futuro autorizado: selecionar PROCESSING com createdAt muito anterior à expiração (por exemplo, 24 horas), obter lock da pasta/version, revalidar status/idade e referências a rodadas/análises/substituições, invalidar logicamente com evento contendo ID/motivo operacional, depois remover somente o objeto daquela storageKey quando política de retenção permitir. Repetição deve ser idempotente, considerar versões do bucket e recuperar falhas de DeleteObject. Nunca apagar ACTIVE/REPLACED/INVALIDATED por esse critério nem eventos históricos. Ausência do objeto não deve impedir invalidar autorização abandonada. Não foi executado nesta etapa.

## Testes e limites de validação

24 testes novos de storage e 114 anteriores aprovados: total 138, zero falhas. Cobrem formatos/conteúdo, headers de imagem e PDF, início/finalize, key arbitrária, isolamento, correção própria, nova versão, hash, metadata/ETag, falta de bucket, revogação de atribuição durante I/O, estado alterado e rollback de evento. PDF e imagens foram gerados em memória. S3 e banco são simulados nesta suíte.

Prisma validate/generate, TypeScript, lint das áreas alteradas, build e diff check foram aprovados. O build final inclui o ajuste do header PDF e a retomada da fila após autorização expirada. Não houve upload de objeto real, escrita documental em produção, alteração do catálogo ou envio de e-mail. Portanto não houve objeto/dado de teste persistido a limpar. Ainda não se realizou smoke S3 real ou QA visual autenticada; faltam configuração privada e confirmação dos limites do host.

```powershell
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/documentacoes src/app/admin/documentacoes src/app/api/documentacoes src/app/correspondente tests/documentacoes/storage.test.ts
node --import tsx --test --test-reporter=spec tests/documentacoes/storage.test.ts tests/documentacoes/operations.test.ts tests/documentacoes/foundation.test.ts tests/academy/foundation.test.ts tests/academy/push.test.ts tests/financeiro/grouped-invoicing.test.ts tests/financeiro/receipt-remittance.test.ts
npm run build
git -c core.safecrlf=false diff --check
```

Não implementados: workflow/rodadas operacionais/pendências/análise/aprovação, notificações, ZIP, OCR/IA ou integrações. Os objetos públicos existentes e seus helpers não foram modificados.

Classificação: **PRONTO PARA REVISÃO do código; operação de arquivos bloqueada pela configuração externa ausente.** Não houve deploy.
