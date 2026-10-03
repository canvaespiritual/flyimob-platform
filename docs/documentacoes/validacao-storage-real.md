# Validação do storage real — 03/10/2026

## Nova validação após correção manual — APROVADA

Bucket definitivo: `flyimob-documentacoes2`, confirmado via HeadBucket em `us-east-2`, usando o cliente compartilhado da aplicação. `.env.local` atualizado somente na variável documental, sem duplicação, alteração de credenciais ou uso do bucket antigo.

GetPublicAccessBlock confirmou os quatro controles como true: BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy e RestrictPublicBuckets. A verificação da própria camada documentationStorage.ready também passou.

`scripts/documentacoes-storage-smoke.ts` executou PutObject pelo storage da aplicação, HeadObject/GetObject pela mesma camada e comparação integral de bytes e SHA-256 de PDF sintético. Em seguida executou os handlers reais de início, PUT e finalização, verificando ACTIVE/checksum no PostgreSQL, classificação Pessoa/Tipo, preview inline e download attachment com bytes idênticos, no-store e ausência de redirect. Sessões ausentes retornaram 401 e BROKER retornou 403. Respostas de início e listagem não expuseram storageKey nem URL S3. Substituição e invalidação passaram; documentos REPLACED/INVALIDATED retornaram 409 para leitura.

Sessões assinadas foram geradas somente em memória. O contexto de cookies Next foi reproduzido localmente; não houve teste visual em navegador ou requisição ao deploy Railway. Os handlers usaram SQL real em transação externa, com savepoints nos serviços. Tenant, usuários, pasta, pessoa, tipo, documentos e eventos sintéticos foram revertidos; consultas posteriores confirmaram zero registros sintéticos. Nenhum cadastro real foi utilizado.

Três objetos sintéticos foram apagados em finally e cada chave retornou 404 em HeadObject após a remoção; zero falhas de limpeza. Uma consulta posterior ListObjectsV2, pelo probe --empty, confirmou bucket vazio e repetiu a confirmação de região e dos quatro controles privados. Nenhuma configuração AWS foi alterada. Sem commit, push, deploy ou workflow.

Regressão: 138 testes aprovados, zero falhas; Prisma validate/generate, TypeScript, lint, diff check e build final aprovados.

Comandos: `node --import tsx scripts/documentacoes-storage-probe.ts` (verificação inicial); `node --import tsx scripts/documentacoes-storage-smoke.ts` (validação real com rollback/limpeza). A suíte de regressão e demais comandos permanecem documentados em storage-privado.md.

## Histórico da primeira tentativa — bloqueio resolvido

Estado: BLOQUEADO por incompatibilidade objetiva de região, antes de qualquer escrita.

## Configuração local

`.env` e `.env.local` já existiam e continuam ignorados pelo Git. Acrescentado somente `AWS_S3_DOCUMENTATION_BUCKET=flyimob-documentacoes` ao `.env.local`, sem duplicação ou alteração de credenciais. Não existe `.env.example` no projeto.

## Diagnóstico real

O script `scripts/documentacoes-storage-probe.ts` carrega as variáveis via `@next/env`, importa o mesmo cliente S3 da aplicação e chama `documentationStorage.ready()`. A tentativa de GetPublicAccessBlock retornou PermanentRedirect (HTTP 301). O diagnóstico HeadBucket confirmou:

- Região configurada no cliente: `us-east-2`.
- Região do bucket documental: `us-east-1`.

Nenhum PutObject, GetObject documental, DeleteObject ou registro sintético no banco foi executado. Não houve objeto de teste a limpar. O fluxo real foi interrompido conforme solicitado quando encontrada incompatibilidade externa. Não se pode afirmar ainda que Block Public Access ou IAM satisfazem os requisitos.

## Correção externa necessária

Disponibilizar o bucket documental na região do cliente compartilhado (`us-east-2`) e ajustar a variável/policy para esse bucket; alternativamente, autorizar uma alteração de código para cliente documental com região própria. Não alterar globalmente AWS_REGION sem avaliar o bucket antigo, pois isso afeta seus uploads. Nenhuma dessas alterações foi executada.

A implementação também exige `s3:GetBucketPublicAccessBlock` no ARN do bucket. Essa ação não consta na lista de permissões informada pelo usuário; conferir a policy. Não é possível determinar se está ausente de outras policies enquanto a chamada retorna redirecionamento.

Após compatibilizar a região e as permissões, repetir a verificação privada, smoke com arquivo sintético e limpeza em finally, e o fluxo documental usando transação/rollback para dados temporários. Sem commit, push, deploy ou alteração AWS nesta etapa.

## Regressão

Aprovados: Prisma validate; Prisma generate (via npm run build); TypeScript --noEmit --incremental false; lint do script; 138 testes de Documentações/autenticação/Academy/Financeiro, zero falhas; npm run build; git -c core.safecrlf=false diff --check. Os testes automatizados usam banco e storage simulados e não substituem a validação S3 real bloqueada.
