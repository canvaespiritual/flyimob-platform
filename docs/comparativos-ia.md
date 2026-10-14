# Direcionamento com IA

## Uso

Na criação de um comparativo, marque **Direcionamento com IA e anexos**. Informe um título e o nome digitável do cliente; não há vínculo obrigatório com o CRM.

1. Selecione as tipologias dos empreendimentos. A mesma tipologia pode aparecer em várias opções, para comparar unidades e planos diferentes.
2. Em cada opção, envie PDF, JPEG, PNG ou WebP. O arquivo original fica privado. A leitura inicia após o envio; confira os alertas e edite os campos e textos. **Aprovar e ir para a próxima** confirma a proposta e avança.
3. Registre opcionalmente o resumo do crédito e até dois anexos gerais (aprovação e simulação Caixa). Selecione os campos da apresentação e finalize.

O link reúne crédito, opções de compra e próximos passos. Fotos, localização, características e entrega vêm do cadastro; o preço e as condições vêm da proposta revisada. Valores não informados não são preenchidos com preços do cadastro nem com saldos estimados.

## Dados e revisão

- `Comparativo.modoDirecionamento` ativa o novo fluxo. Registros anteriores recebem `false` e continuam no editor existente.
- `ComparativoItem.planoRascunho` guarda a versão editável; `planoPagamento`, a aprovada; `extracaoOriginal`, o resultado da leitura com identificação do anexo, checksum, modelo e momento da extração.
- Cada grupo preserva tipo, quantidade, primeira/última parcela, total informado, datas, variação, resumo editável e página de origem. Há linhas adicionais livres.
- Componentes com nomenclatura própria ou classificação incerta são preservados em linhas de texto com nome original, valores, condições, datas e página de origem. Cada linha pode ser editada, ocultada ou excluída antes da aprovação. Ocultar preserva o rascunho; excluir remove a linha da versão revisada, mantendo a extração original. Estas linhas são descritivas e não são somadas novamente aos totais.
- Mensais sem fase explícita ficam separadas das mensais durante a obra e após as chaves. O financiamento bancário fica separado do parcelamento da construtora.
- Para PDFs com tabela mensal decrescente legível em texto, a sequência completa extraída é ordenada por data para conferir quantidade, primeira e última parcela. Não se inventa uma progressão.
- Campos ausentes ficam nulos. Não se calculam entrada total, total de prestações, preço/m² ou saldo de financiamento neste modo. Quantidades, totais e vencimentos são copiados somente quando explícitos no documento. A data de entrega do cadastro é apenas informação descritiva; não classifica fases nem determina pagamentos. Nomes dos campos financeiros e grupos preservam os rótulos originais da construtora.
- Reextrações preenchem um novo rascunho, preservando a proposta anteriormente aprovada. Revisões numéricas e tokens de processamento impedem que uma resposta tardia sobrescreva alterações mais recentes.
- A publicação exige todas as opções aprovadas. Alterações retiram o link do estado publicado até nova finalização. A prévia de um comparativo ainda não publicado requer sessão do mesmo tenant e opções aprovadas.

## Arquivos e acesso

Anexos ficam no bucket documental privado já utilizado pela plataforma, com prefixo `private/comparativos/`. Metadados são armazenados em `ComparativoAnexo`; há um anexo atual por opção e dois slots gerais. Planos aceitam PDFs com até 10 páginas; anexos gerais, até 50. Limite de 15 MB por arquivo.

A apresentação é acessível a quem possui o link de alta entropia. Seus anexos são servidos pela aplicação somente com sessão autorizada ou com o slug de um comparativo publicado. Não existem URLs públicas do bucket. Rascunhos, respostas originais e chaves de armazenamento não são enviados ao cliente na apresentação. Ocultar um bloco na apresentação não revoga o acesso de quem possui o link; para suspender o compartilhamento, retire o comparativo do estado publicado mediante edição.

Excluir ou substituir um anexo remove seu vínculo atual; os objetos privados anteriores permanecem sujeitos à política de retenção do bucket. Não são copiados para novos comparativos ao duplicar.

## Configuração

- `OPENAI_API_KEY`: segredo somente no servidor. Nunca usar variável `NEXT_PUBLIC_`.
- `OPENAI_COMPARATIVOS_MODEL`: modelo da Responses API com visão e saída estruturada; padrão validado `gpt-4.1`.
- `AWS_S3_DOCUMENTATION_BUCKET` e credenciais AWS: infraestrutura documental privada existente.

Integração usa Responses API, saída JSON estruturada e `store: false`. PDFs são enviados com texto extraído adicional para conferência; imagens são interpretadas visualmente. A API tem cobrança própria. O conteúdo do anexo é tratado como dado, sem executar instruções nele. A extração não aprova crédito nem determina elegibilidade.

O processamento aguarda a resposta da API no servidor (limite de 150 segundos), sem worker adicional nesta versão. A interface apresenta o andamento e preserva o anexo em caso de falha. Extrações interrompidas podem ser retomadas após expirar a janela de processamento de três minutos.

## Publicação

Chave e modelo foram cadastrados em `flyimob-platform`, ambiente `production`, com `--skip-deploys`. Antes de publicar o novo código, aplicar **somente** a migration `20261014150000_comparativo_direcionamento` após conferir se não existem outras migrations pendentes. A migration acrescenta campos e uma tabela; não reescreve comparativos existentes. O worker da Academy não precisa da chave nem de atualização por esta funcionalidade.

A publicação para teste em produção foi autorizada. Não iniciar a nova versão em produção antes de aplicar e verificar a migration. Use `scripts/comparativos-release-check.mjs` para conferir identidade do banco e migrations; `--apply` aplica apenas quando as pendências correspondem à entrega.

## Verificação

- `tsx --test tests/comparativos/plano.test.ts`: finanças, nulos, tabelas decrescentes, limites de PDF, payload público e contrato da API.
- `tsx scripts/comparativos-integration-smoke.ts`: migration e rotas reais em schema temporário com registros sintéticos; isolamento de tenant, revisões concorrentes, aprovação/publicação, duplicação e compatibilidade com comparativos antigos. O schema é removido no final.
- `tsx scripts/verify-comparativo-extraction.ts`: leitura real dos exemplos enviados (requer `OPENAI_API_KEY` e os arquivos em Downloads); não imprime credenciais nem identificadores pessoais.
- `tsx scripts/comparativos-ui-preview.ts`: prévia local dos componentes reais com APIs e dados sintéticos em `http://localhost:3114`; não acessa produção.

Os quatro documentos de teste tiveram os preços reconhecidos; a MRV teve 48 mensais, primeira de R$ 1.172,14 e última de R$ 562,11. Resultado de exemplos não substitui revisão humana de propostas novas.
