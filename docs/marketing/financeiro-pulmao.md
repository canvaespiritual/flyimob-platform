# Financeiro de Marketing / Pulmão — relatório de implantação

## A. Arquitetura encontrada e reaproveitada
Marketing já possui MetaConnection com OAuth e AES-GCM vinculados ao tenant/conexão, MetaAdAccount/MetaConnectionAccount, campanhas com IDs externos estáveis, CampaignBrokerAssignment com intervalos [validFrom, validTo), MarketingDailyMetric e MarketingAdDailyMetric, regra/snapshot de custo, correções auditadas de vigência, fila MarketingSyncRun com lease/backoff e MarketingAuditEvent append-only. Nada disso foi recriado.

OperationPerson é a identidade das pessoas e já se relaciona com User e FinancialParticipant opcionalmente. Novos aportantes comerciais consomem canActAsSalesResponsible: BROKER, MANAGER, DIRECTOR e DIRECTION/OWNER ativos e não mesclados, inclusive sem login. Inativos e funções posteriores permanecem no histórico. Mesclagens explícitas são resolvidas na leitura; o movimento original não é reescrito.

Financeiro geral permanece responsável por vendas, comissões, participantes, recebimentos e conta corrente. Não foram criados Broker, conta corrente geral paralela, descontos em comissões ou compensações automáticas. Reaproveitamos Decimal, arredondamento monetário, transações serializáveis e auditoria. O storage público de anexos do Financeiro não foi usado para comprovantes sensíveis; usamos o storage privado já existente de Documentações, com namespace próprio e autorização de Marketing.

## B. Modelo incremental
- MarketingMoneyMovement: aporte ou ajuste, tenant, conta, OperationPerson opcional, origem PERSON/FLYIMOB/OTHER, valor Decimal(18,2), moeda, data econômica, PENDING/CONFIRMED/CANCELLED, tipo/motivo de ajuste, observação, efeito físico explícito, autor, versão, timestamps e chave idempotente.
- MarketingMoneyReceipt: comprovantes imutáveis, metadados privados, SHA-256, autor e FK composta tenant/movimento. PDF/imagens, até 15 MB, infraestrutura documental já existente. Downloads autenticados, sem URL pública e sem interpretação do conteúdo.
- MarketingBalanceSnapshot: observação imutável por conta/chave, valor disponível nullable, moeda, timestamp da consulta, estado, fonte/type/display_string, payload selecionado e códigos de erro seguros.
- MarketingReconciliationMark: marco imutável por conta, data/hora UTC mais data local, saldo físico conhecido, moeda, tolerância R$0,02 (ou equivalente na moeda), observação, autor e idempotência. O marco mais recente aplicável é usado; todos os anteriores permanecem armazenados.

Todas as relações financeiras usam FKs compostas por tenant; DELETE é RESTRICT. CHECKs, triggers append-only, proteção de valores e exigência de auditoria OWNER na mesma transação complementam a autorização da aplicação. NaN, moedas diferentes da conta e valores inválidos são rejeitados. Nenhuma tabela antiga teve dados reescritos.

## C. Consulta Meta
GET v26.0 /act_ID com id,currency,account_status,balance,amount_spent,spend_cap,funding_source,funding_source_details, através do MetaClient já existente, com timeout, appsecret_proof e Bearer fora da URL. Não existe mutation de anúncios/billing/PIX.

Disponível deriva exclusivamente do display_string validado de saldo disponível. Parsing conservador aceita os formatos monetários identificáveis de BRL, USD, EUR, GBP, CAD, AUD e CHF, com separadores/grupos validados, símbolo coerente, código de moeda igual à conta e Decimal. Moeda/formato não reconhecido, campo ausente, idioma/label diferente ou resposta inválida resultam em UNSUPPORTED/UNAVAILABLE, nunca balance como fallback nem saldo zero presumido. O SDK oficial identifica display_string como string e funding source type como int: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/fundingsourcedetails.py. A interpretação como fundos disponíveis depende do comportamento pré-pago confirmado pelo operador para as contas BRL; não é um campo numérico estável garantido pela Meta.

Payload preservado: somente campos solicitados relevantes e limitados; não há token, resposta de erro bruta, coupons ou objeto arbitrário. Snapshot indisponível não exclui observações anteriores. Expiração/revogação/perda de acesso preservam histórico; códigos seguros e estados são mostrados, sem secrets. Account_status obtido pela leitura atualiza a situação conhecida da conta sem alterar suas campanhas/histórico.

## D. Aportes, histórico e auditoria
Registrar a data efetiva separadamente da data de criação, pessoa/origem, conta/moeda, valor, observação e comprovante opcional. Confirmados compõem o razão; pendentes/cancelados não. É permitido confirmar pendente ou cancelar pendente/confirmado com motivo e versão otimista. Não há edição de valor, conta, pessoa, moeda ou data de movimento consolidado, nem hard delete.

Cancelamento corrige um registro indevido/duplicado e preserva auditoria. Retirada ou reembolso real deve ser um ajuste com a data efetiva correta, não um apagamento retroativo do aporte. Ajustes têm tipo, sinal, motivo obrigatório e indicação explícita se alteram caixa físico. Compensação econômica interna pode alterar posição sem inventar dinheiro Meta. Não há transferência automática; contrapartidas legítimas devem ser registradas e justificadas separadamente.

Autor/timestamp e antes/depois das transições ficam em MarketingAuditEvent. OWNER e DIRECTOR podem consultar auditoria e baixar comprovantes. Upload usa ID/checksum idempotente, objeto imutável e leitura autorizada. Falha de comprovante não impede salvar aporte; a tela identifica registro sem comprovante e permite anexar depois. Falha DB após upload pode deixar objeto privado órfão; retry com o mesmo ID/conteúdo recupera a gravação, sem substituir objetos.

## E. Razão econômico
Posição acumulada até o fim do período = aportes CONFIRMADOS + ajustes CONFIRMADOS − GASTO EFETIVO.

Gasto efetivo = Investimento Meta acrescido do percentual de custo vigente, incluindo o overlay de correções explicitamente auditadas da arquitetura anterior. Snapshots e métricas de ingestão permanecem intactos. A vigência de cada dia define o responsável; o responsável atual não recebe todo o passado. Gastos sem atribuição continuam em uma linha própria, sem serem imputados automaticamente à Flyimob ou a uma pessoa.

As colunas de aportes/consumo do período são separadas dos valores acumulados e da posição. Todos os propósitos de campanha consomem recursos; não herdamos o filtro CLIENTES da Visão geral. As moedas nunca são somadas/conversões nunca são presumidas. Posição depende de toda a cobertura histórica importada e de aportes/ajustes anteriores correspondentes: um marco físico zero NÃO zera posições econômicas, nem cria crédito de pessoa automaticamente. Para iniciar contabilidade econômica com histórico anterior incompleto, é necessário documentar créditos/ajustes de abertura legítimos ou completar aportes e importação; não inventar saldos.

Crédito utilizado = max(−posição da pessoa, 0). É um indicador de financiamento operacional, sem dívida manual, cobrança ou pausa automática.

## F. Conciliação física
Saldo esperado = saldo do marco + aportes confirmados desde o marco + ajustes que explicitamente afetam caixa físico − INVESTIMENTO META desde o marco.

Não usa gasto efetivo/acréscimo interno: isso não é caixa debitado da Meta. Diferença = observado − esperado. Tolerância de 0,02 na moeda da conta; não há autocorreção. A cobertura de MarketingSyncRun SUCCEEDED precisa abranger todos os dias desde o marco até a fotografia observada. Falhas/métricas faltantes, observações posteriores à fotografia, saldo sem suporte ou defasagem impedem uma declaração de conciliação.

A comparação física é atual, independente do filtro de período/responsável econômico. As métricas atuais e as datas necessárias para conciliação são carregadas junto ao histórico econômico, respeitando um limite de volume explícito (sem truncar somas). Leitura usa transação RepeatableRead.

Marco 00:00 no fuso da conta permite cálculo por dia. Data/hora intradiária também é preservada, mas esperado/diferença ficam indisponíveis, com aviso de necessidade de gasto horário: não rateamos artificialmente um total diário. Para marcos históricos com zero no meio do dia, obter/conferir saldo na fronteira diária ou incorporar importação horária em evolução futura. Diferença intradiária entre consulta de Insights e de saldo pode ocorrer e deve ser investigada junto dos horários, reembolsos e movimentos ausentes.

## G. Pulmão
Cards por moeda: caixa físico disponível (parcial quando necessário), média física diária, autonomia estimada, aportes confirmados no período, posição Flyimob, exposição potencial Flyimob, crédito operacional e responsáveis com campanhas ativas/gasto recente.

Autonomia = caixa disponível / média de Investimento Meta dos 7 dias COMPLETOS anteriores, por fuso. Cobertura insuficiente ou denominador zero tornam estimativa indisponível. Conta com caixa menor que 3 dias da média recebe atenção; é apenas alerta, sem regra de desempenho ou execução de budget. Snapshot com mais de 26h fica desatualizado e não compõe caixa fresco/autonomia. Contas sem suporte permanecem visíveis, sem saldo inventado.

Tabela: pessoa/origem e função atual, moeda, aportes e consumo no período/acumulados, ajustes, posição, gasto Meta recente, campanhas ativas, conversas e CPL efetivo, situação e crédito. Campanha operante exige status Meta ACTIVE e conta ativa. Não existe um orçamento fictício: mostramos gasto observado porque não havia orçamento diário persistido na arquitetura. Pessoas elegíveis ativas sem mídia aparecem com zero/histórico disponível; inativos com movimentos/métricas continuam visíveis.

Caixa Meta é fungível. Exposição potencial Flyimob = mínimo entre sua posição positiva e o total negativo das pessoas no recorte; isso é cobertura potencial, não atribuição física da utilização de recursos. Não somar exposição ao crédito para evitar dupla contagem. Créditos de outras pessoas/outras origens e consumo não atribuído são linhas separadas e investigáveis.

## H. Permissões e isolamento
Política Marketing regional mantida: OWNER/DIRECTOR leitura, tenant plataforma e demais perfis bloqueados. Novas mutações financeiras, marcos, anexos e sincronizações exclusivamente OWNER. Não ampliar a capacidade financeira do DIRECTOR implicitamente, embora o Financeiro geral permita acesso a esse perfil. Função de OperationPerson não concede acesso ao painel. CSRF usa o helper de origem existente; respostas privadas/no-store. FKs, escopo em todos os SELECTs e limites de corpo/arquivo reforçam isolamento.

## I. Migration e sincronização
20261005160000_marketing_finance: quatro tabelas, índices, FKs, constraints e triggers novos; nenhum backfill de dinheiro ou reset de histórico. Ensaio isolado clona somente estruturas, aplica SQL, testa violações e faz rollback obrigatório; comparação de contagem/somas confirma métricas reais preservadas.

Snapshots são lidos ao final da sincronização existente, de forma independente: indisponibilidade de saldo não transforma sucesso de campanhas/Insights em falha. Chaves de observação e unicidade impedem duplicação; gastos diários mantêm o UPSERT anterior, substituindo total do dia.

No serviço persistente iniciado por npm start / next start, instrumentation registra um único timer por processo, passa limitada a até 100 contas após 60s e depois a cada hora. Jobs têm chave diária por conta, seleção/autorização vigentes e leases existentes; réplicas não duplicam ingestão. Desenvolvimento/build/testes não iniciam timer. O processo script marketing-worker também executa a mesma passagem, podendo ser usado em um serviço cron Railway se futuramente houver escala/hibernação. O timer requer serviço web vivo: suspensão/escala a zero não executa tarefas durante inatividade. Não foram alteradas secrets ou configurações externas Railway nesta entrega. Não há polling agressivo nem mutações Meta. Manualmente: Atualizar Meta e saldo, atualizar somente saldos (chave de 10 min) e importar métricas do período selecionado.

## J. Validação
Resultados finais: Prisma validate/generate aprovados; TypeScript sem erros; lint dos arquivos alterados sem erros/warnings; build de produção aprovado; 403 testes aprovados (Marketing, Documentações, Financeiro e Academy); 28 verificações de migration/constraints em schema isolado com rollback e 11 verificações dos serviços no PostgreSQL com tenant sintético e rollback. Total PostgreSQL: 39. Migration aplicada e status confirmou 35 migrations, nenhuma pendente. Nenhum aporte real, arquivo S3 real, secret ou mutação Meta foi criado/alterado pelos testes. Testes usam dados sintéticos/transportes mockados e nunca tokens ou contas reais. O roteiro --service-rollback valida serviços e consultas no banco após migration, com tenant sintético e rollback, sem chamadas externas.

## K. Limites explícitos
Dependência da string de funding, idiomas/formatos/moedas suportados; histórico/atribuições incompletos; marco intradiário sem base horária; diferença temporal de Insights/caixa; serviço persistente necessário ao agendamento; limites de 100 contas/passagem e de volume de relatório; gasto observado em vez de budget ainda não armazenado; armazenamento documental privado precisa estar configurado. Nenhum valor pendente de PIX é importado. Nenhum pagamento, pausa, ativação, cobrança, transferência ou compensação de comissão é automatizado.

## L. Roteiro de produção
1. Como OWNER, abrir Marketing > Aportes. Verificar contas, moedas e pessoas operacionais existentes; não criar pessoas duplicadas por nome.
2. Registrar os 5–7 aportes reais com data efetiva, valor, pessoa/origem, conta e status creditado somente quando confirmado. Anexar comprovantes; conferir ausência/presença e downloads.
3. Filtrar pelas datas históricas para conferir registros. Validar um pendente sem contabilização e um ajuste justificado, distinguindo efeito físico de compensação interna. Cancelamentos não devem substituir retiradas reais.
4. Conferir campanhas/finalidades e vigências históricas de responsáveis antes de ler o razão. Importar métricas desde o período inicial necessário (pulmão > período selecionado > importar métricas).
5. Abrir Pulmão e registrar marco por conta, com saldo físico conhecido, data/hora e observação. Preferir fronteira diária confirmada para conciliação exata; não transformar zero do meio do dia em zero de meia-noite sem evidência.
6. Atualizar Meta e saldo. Comparar o snapshot com Fundos disponíveis da UI Meta e conferir horário/estado. Para contas compatíveis BRL, o número deve refletir display_string, sem PIX pendente.
7. Conferir posição por pessoa e gasto efetivo, inclusive troca de responsável, negativo natural e origem Flyimob. Verificar que períodos e moedas não se confundem com o caixa físico atual.
8. Comparar esperado/observado/diferença; completar importação, aportes, reembolsos ou ajustes legítimos para investigar diferença. Não registrar ajuste sem evidência só para zerar indicador.
9. Entrar como DIRECTOR e conferir leitura/auditoria, sem cadastros/cancelamentos/sync. Confirmar que outra operação não recebe movimentos/arquivos.
10. No dia seguinte, conferir timestamps e tarefas SUCCEEDED; a rotina automática roda no web service vivo. Retestar Visão geral/Campanhas/Configurações e os módulos existentes.
