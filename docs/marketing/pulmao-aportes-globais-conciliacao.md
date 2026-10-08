# Marketing / Pulmão — segunda rodada financeira

Implementação local em 08/10/2026. **Sem commit, push, migration em produção ou deploy.** A primeira rodada permanece incorporada, com sua migration original intacta. Nenhum lançamento financeiro real, campanha, orçamento, conta Meta ou lançamento do Financeiro geral foi modificado.

## Auditoria e arquitetura

O relatório `aportes-beneficiario-financiamento.md` foi lido antes da implementação. A primeira rodada já entregava separação de financiador/beneficiário, aportes próprios e institucionais, financiamento recuperável, liquidações Meta/externa, comprovantes, auditoria, permissões e projeções históricas. Esses mecanismos foram reutilizados.

A extensão continua no **mesmo `MarketingMoneyMovement`**, sem outra tabela de saldos ou livro financeiro. A conta Meta, moeda, operação, data efetiva, autor, status, versão e idempotência continuam nos movimentos existentes.

| Informação | Representação |
|---|---|
| Entrada física | CONTRIBUTION confirmado, `affectsPhysicalBalance=true` |
| Distribuição econômica | ADJUSTMENT/COMPENSATION não físico, vinculado pela nova `distributionMovementId` |
| Financiador | `origin` e `personId`, preservados em cada distribuição conforme a entrada original |
| Beneficiário | `beneficiaryPersonId`; origem econômica não muda |
| Principal recuperável | RECOVERABLE individual ou ALLOCATION_LOAN/RECOMPOSE_LOAN vinculado ao aporte |
| Liquidação/baixa | Novo movimento vinculado ao principal pela `fundingMovementId` existente |
| Fato/acerto externo | Nova `externalReference`, sem criar lançamento no Financeiro geral |
| Forma recebida | Nova `recoveryMethod`: pagamento, comissão já descontada ou outro acerto |
| Decisão administrativa | Motivo, data efetiva e autor OWNER na auditoria imutável |

`economicLedger` continua como cálculo canônico. Serviços de disponibilidade, listagens, Pulmão, posição inicial e conciliação por conta utilizam esse cálculo e o overlay histórico de correções de custo. Identidades operacionais continuam sendo resolvidas sem alterar os vínculos históricos.

## Aporte global

Uma entrada física tem um financiador e até 100 linhas de distribuição. O formulário permite adicionar, editar e remover linhas antes do registro. A entrada e suas linhas iniciais são confirmadas em uma única transação: uma linha inválida desfaz toda essa tentativa.

- GLOBAL mantém o valor não distribuído com a origem financiadora.
- ALLOCATION destina crédito sem dívida ou reserva uma finalidade institucional da própria origem.
- ALLOCATION_LOAN destina crédito com principal recuperável perante a Flyimob.
- ALLOCATION_BONUS registra bonificação antecipada sem dívida.
- RECOMPOSE_LOAN/RECOMPOSE_BONUS cobrem consumo anterior ainda sem cobertura, mediante decisão explícita.
- Distribuições posteriores são movimentos novos, com motivo e data, vinculados à mesma entrada física.
- Pendências reservam o limite de distribuição, mas não entram no caixa nem nas posições confirmadas.

A soma das linhas pendentes e confirmadas não ultrapassa a entrada. Uma distribuição a outra pessoa também verifica se o crédito da origem já foi consumido ou reservado na mesma conta/moeda. O limite de principal não distribuído, por si só, não garante crédito econômico livre nem saldo físico Meta.

Uma reserva institucional explícita ocupa seu limite de distribuição, mas mantém o crédito com a origem. Alterar essa destinação posteriormente exige cancelar o movimento indevido com motivo e registrar nova decisão, preservando ambos no histórico.

**Limitação assumida:** um financiador por entrada física. Recursos de financiadores diferentes exigem entradas identificadas separadamente, correspondentes aos fatos reais; a aplicação não divide arbitrariamente um PIX entre terceiros. Origem Outro continua usando a identificação descritiva no registro, sem inventar uma pessoa operacional financiadora.

## Bonificações, recuperações e perdas

| Natureza | Crédito para mídia | Obrigação / recebível | Novo caixa Meta | Recuperação recebida |
|---|---|---|---|---|
| BONUS individual | Transfere da Flyimob ao beneficiário | Não cria | Somente o aporte físico original | Não |
| ALLOCATION_BONUS | Transfere recurso já aportado | Não cria | Não | Não |
| SETTLEMENT_META | Transfere crédito disponível de volta à Flyimob | Reduz | Não | Compensação econômica, separada do recebimento externo |
| SETTLEMENT_EXTERNAL | Não muda | Reduz | Não | Sim, fora da Meta |
| SETTLEMENT_BONUS | Não muda | Reduz | Não | Não; bonificação posterior |
| SETTLEMENT_LOSS | Não muda | Reduz | Não | Não; perda reconhecida |

Baixas por bonificação e perda podem ser parciais ou totais e compartilham o limite do principal com todas as outras liquidações, inclusive pendentes. Exigem motivo e decisão auditada. Inativar ou promover uma pessoa não baixa sua obrigação automaticamente. A pessoa histórica pode continuar tendo sua obrigação liquidada/baixada sem voltar a ser ativa ou mudar de cargo.

Desconto em comissão já realizado usa recuperação externa, forma COMMISSION e referência ao acerto original. Não cria vale, desconto, recebimento ou comissão no Financeiro. Essa referência prepara a conciliação futura; a aplicação ainda não consulta nem autentica automaticamente o lançamento financeiro externo. O administrador deve conferir o fato recebido e informar a referência correta.

Novos aportes próprios **não quitam automaticamente** obrigações anteriores.

## Consumo cruzado e recomposição: decisão explícita

A escolha do usuário foi incorporada: financiamento recuperável, cobertura por bonificação ou recomposição exclusivamente física com credor pendente.

O consumo atribuído sem cobertura gera `unfundedCredit`, uma **pendência de conciliação**, não um recebível automático da Flyimob ou de outra pessoa. A aplicação não tenta rastrear de qual aportante saiu cada real físico fungível.

RECOMPOSE_CASH registra apenas a entrada física da Flyimob e reserva esse recurso para a decisão pendente. Não altera o direito de quem não consumiu, não cria principal recuperável e não permite usar essa reserva em uma distribuição institucional não relacionada. Uma decisão posterior usa RECOMPOSE_LOAN ou RECOMPOSE_BONUS vinculada à mesma entrada.

A campanha é escolhida pelo nome no formulário. A referência persistida identifica seu ID, enquanto o motivo e a data documentam a decisão. A API valida operação, conta, moeda, consumo efetivo confirmado, vigências e beneficiário. Usa o histórico importado até a data efetiva; o valor assumido/bonificado não pode exceder o consumo ainda sem cobertura. Coberturas pendentes também reservam esse consumo. Uma segunda decisão sobre valor já coberto é recusada.

A recomposição física pode existir antes de qualquer decisão econômica. Nenhuma decisão decorre automaticamente de um depósito ou do saldo físico.

## Cálculos e invariantes

Por operação, conta e moeda, considerando confirmados até a data final:

```
crédito para mídia = aportes da origem + ajustes comuns
                  - crédito destinado + crédito recebido
                  + compensações líquidas - consumo efetivo

posição econômica = crédito para mídia + recebível - obrigação
consumo sem cobertura = max(-crédito para mídia, 0)
crédito operacional = obrigação explícita + consumo sem cobertura
```

Bonificação antecipada transfere crédito; não se deduz seu valor outra vez como despesa da mesma projeção. Bonificação posterior e perda reduzem recebível e obrigação, sem incrementar recuperações recebidas nem crédito para mídia.

Verificações por conta:

1. Soma dos créditos líquidos para mídia = entradas econômicas e ajustes comuns − consumo efetivo.
2. Soma das posições econômicas = soma dos créditos líquidos: recebível e obrigação são faces opostas do mesmo principal.
3. Somente entradas físicas confirmadas e ajustes físicos alteram a conciliação Meta; distribuições, baixas e liquidações são não físicas.
4. Distribuições ativas ≤ principal da entrada; liquidações/baixas ativas ≤ principal recuperável.
5. Recurso pendente de recomposição não constitui disponibilidade livre para outra destinação.
6. Consumo sem cobertura e exposição potencial são apurados por conta antes de consolidar a moeda: crédito de uma conta não mascara insuficiência em outra.
7. Valores de moedas diferentes não são somados nem convertidos.

O Pulmão mostra direitos positivos dos beneficiários, posição institucional, reserva de recomposição pendente, consumo sem cobertura, recebível, bonificações, recebimentos e perdas, além da diferença do razão. A conciliação física anterior e seus marcos permanecem intactos. Saldo Meta zerado não extingue direitos individuais; direito positivo não garante dinheiro físico disponível.

Posições acumuladas, movimentos do período e caixa atual continuam separados. Entradas físicas globais são exibidas para as contas selecionadas, independentemente do filtro individual; distribuições aos responsáveis têm seu próprio indicador. Um financiador global não é apresentado como beneficiário de toda a entrada.

## Preparação mensal

As projeções geral e por conta expõem posição anterior ao início do período, variação do período e posição final. O razão inclui componentes monetários do período: aportes, ajustes, crédito destinado/recebido, distribuições, criação/liberação de dívida/recebível, compensações, consumo, bonificações, baixas e recuperações.

A identidade é `posição inicial + variação do período = posição final`. Datas efetivas e referências permitem recuperar os movimentos que explicam a variação. Nenhum mês foi bloqueado e nenhum fechamento contábil definitivo ou snapshot congelado foi implementado. Isso exige regras específicas de correção/reabertura em rodada futura.

## Exemplos numéricos sintéticos

### Laura e Gilberto, mesma conta

O exemplo de R$ 500 da Laura é sintético e não altera seu aporte histórico real de R$ 1.204,65.

| Etapa | Caixa Meta calculado | Direito Laura | Mídia Gilberto | Dívida Gilberto com Flyimob | Recebível Flyimob |
|---|---:|---:|---:|---:|---:|
| Laura aporta 500; Gilberto consome 500 | 0 | 500 | -500 | 0; credor pendente | 0 |
| Flyimob recompõe apenas o caixa em 500 | 500 | 500 | -500 | 0; credor pendente | 0 |
| Decisão: assumir 500 como recuperável | 500 | 500 | 0 | 500 | 500 |
| Alternativa: cobrir 500 por bonificação | 500 | 500 | 0 | 0 | 0 |

As últimas duas linhas são alternativas, não duas destinações do mesmo valor. A decisão integral já registrada impede cobrir o mesmo consumo novamente.

### Sandra

Financiamento 279,32: uma entrada física, crédito de mídia 279,32, dívida 279,32 e aporte próprio zero. Consumir 100 deixa crédito de mídia 179,32 e mantém dívida 279,32; não se soma a mesma dívida ao gasto novamente. Bonificar posteriormente 79,32 da obrigação deixa dívida 200,00, mantendo consumo 100 e crédito 179,32. Recuperação recebida continua zero nessa bonificação.

### Vitor

Financiamento 600 e consumo 600: mídia líquida zero, obrigação 600. Recuperação histórica por comissão de 400 deixa obrigação 200, recuperação externa acumulada 400 e nenhuma entrada Meta. Bonificar os 200 restantes encerra a obrigação; o recebido continua 400 e a bonificação posterior é registrada separadamente em 200.

### Aporte global 2.000

500 para recompor consumo anterior, 500 para outro financiamento, 300 para bonificação e 700 institucionais: caixa entra uma vez em 2.000. A primeira parcela exige decisão/referência própria; se recuperável, cria recebível 500 contra consumo previamente descoberto, sem duplicar o direito de quem não consumiu. O financiamento novo gera outro principal 500, o bônus não cria dívida e o institucional fica com a Flyimob. Uma distribuição inicial menor mantém o restante não distribuído para decisão posterior.

## Segurança e migração

OWNER continua escrevendo e DIRECTOR consultando. Hierarquia operacional não dá permissão de usuário. Beneficiários novos usam a policy comercial canônica, ativos, elegíveis e na operação; não precisam de login.

A entrada global usa transação SERIALIZABLE. O plano inicial normalizado tem assinatura auditada, e as linhas usam chaves derivadas da entrada. Repetições equivalentes não duplicam depósitos; trocar linhas com a mesma chave é conflito. Conflitos P2034/P2002 repetem a transação inteira, preservando atomicidade.

Constraints no PostgreSQL bloqueiam os principais para validar distribuições/liquidações concorrentes, conta, operação, moeda, financiador, datas, status e limites, inclusive com SQL direto. Payload e exclusões continuam protegidos pelos triggers originais; cancelamento só ocorre com motivo e auditoria na mesma transação.

Nova migration: **20261008160000_marketing_global_allocations**. Adiciona três campos nullable, FK composta, índice e amplia constraints/triggers do mesmo livro. Não atualiza históricos nem cria outra tabela financeira. O diff Prisma confirmou exatamente os três campos, FK e índice; as regras adicionais foram executadas em PostgreSQL isolado.

Publicação futura, somente após autorização:

1. Conferir o estado e checksums das migrations reais e registrar assinatura financeira antes da mudança.
2. Aplicar primeiro `20261008120000_marketing_funding_beneficiary`, intacta, depois `20261008160000_marketing_global_allocations`.
3. Conferir preservação das colunas financeiras originais e do aporte da Laura. O hash de linha inteira muda legitimamente quando novas colunas são adicionadas; não confundir isso com alteração de valor histórico.
4. Publicar código apenas depois de ambas as migrations. O build padrão não aplica migrations.
5. Verificar formulários, listagens e Pulmão sem cadastrar movimentos financeiros fictícios em produção.

A migration exige locks de tabela para adicionar constraints e deve ser aplicada no fluxo controlado da publicação. A proteção contra distribuição utiliza histórico importado; métricas indisponíveis impedem a operação, e lacunas não importadas precisam de conferência/importação. Não há rastreamento bancário real por campanha nem integração automática com o Financeiro.

## Validações

- **477 testes aprovados**, mantendo os 449 anteriores e adicionando 28 regressões da segunda rodada: global/parcial/excesso, bonificações, perda, cruzamento, três modalidades de recomposição, comissão, reservas pendentes, períodos, moedas, permissões, isolamento e retries de concorrência/idempotência.
- **55 verificações PostgreSQL isoladas aprovadas**, mantendo as verificações anteriores, aplicando as duas migrations em schema temporário dentro de transação com rollback. Incluem serviços reais, Laura/Sandra, distribuições posteriores, baixas, comissão, recomposição, SQL direto, constraints e preservação do histórico público. Não persistiram registros sintéticos nem migrations de produção.
- Prisma validate/generate: aprovados. Diff de modelos: três campos, uma FK e um índice da segunda rodada.
- TypeScript e build final de produção: aprovados. Compilação, checagem de tipos e geração de 177 páginas concluídas. Avisos preexistentes de middleware, baseline-browser-mapping e configuração Prisma não impediram o build.
- ESLint dos arquivos envolvidos e git diff --check: aprovados.
- Leitura real final: Laura Moura, PERSON/CONTRIBUTION/CONFIRMED, BRL 1.204,65, data 11/05/2026, ID `cmuzcwv8o08kvmm0p4qjqlnv4`. Assinatura do livro real igual à rodada anterior: `b8d56ffd5417b8f0277cd22f4ede2311ba654c197645d8fc4c50e37ea4a08c96`.

Arquivos centrais: `finance-calculations.ts`, `finance.server.ts`, `funding.server.ts`, `funding-policy.ts`, `finance-queries.server.ts`, `finance-ui.tsx`, `finance-global-form.tsx`, `finance-position-table.tsx`, endpoint `/api/marketing/finance/global`, testes e verificador PostgreSQL.

O relatório da primeira rodada permanece como registro daquela entrega. Nenhum arquivo de trabalho paralelo foi incluído em commit, pois não houve commit nesta etapa.
