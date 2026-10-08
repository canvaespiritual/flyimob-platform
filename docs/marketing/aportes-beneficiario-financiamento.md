# Aportes: origem, beneficiário e financiamento recuperável

Implementação local em 08/10/2026. Sem cadastro real de teste, sem chamadas à Meta e sem publicação nesta rodada. A migration está pendente em produção.

## Auditoria e decisão de modelo

O livro existente `MarketingMoneyMovement` já concentra aportes/ajustes, comprovantes privados, idempotência, status, data efetiva e auditoria OWNER. O caixa físico usa apenas movimentos confirmados com `affectsPhysicalBalance=true`; o razão econômico usa consumo efetivo por vigência histórica de campanha. Esses mecanismos foram reutilizados.

Antes desta alteração, `personId` identificava exclusivamente o financiador de origem PERSON, e a constraint obrigava a deixá-lo nulo para FLYIMOB/OTHER. Não existia beneficiário independente nem vínculo que identificasse um principal recuperável. Usar personId para Sandra com origem Flyimob quebraria a constraint e confundiria dinheiro próprio com financiamento. Guardar essa informação somente na observação não permitiria validar isolamento ou calcular liquidações.

Foi adicionada a migration **20261008120000_marketing_funding_beneficiary**, com três campos no mesmo movimento:

| Campo | Função |
|---|---|
| personId existente | Pessoa financiadora de origem PERSON; não muda de significado |
| beneficiaryPersonId novo | Responsável comercial que recebe o crédito para mídia; opcional em aportes institucionais |
| fundingNature novo | STANDARD, RECOVERABLE, SETTLEMENT_META ou SETTLEMENT_EXTERNAL |
| fundingMovementId novo | Referência ao aporte recuperável original para liquidação parcial/total |

Nenhuma nova tabela financeira. Duas FKs compostas por tenant, dois índices, CHECK de classificação e constraint trigger de integridade. O diff Prisma confirmou que o modelo só requer esses campos/vínculos/índices. A migration não executa UPDATE de históricos, não remove constraints antigas e não altera aportes, campanhas, marcos ou snapshots.

O trigger de preservação existente protege os novos campos automaticamente: o payload permanece imutável; somente transições de status/version com auditoria OWNER na mesma transação são permitidas. A criação de movimentos/liquidações continua exigindo auditoria na mesma transação.

## Compatibilidade histórica

A auditoria somente leitura encontrou o aporte próprio confirmado de **Laura Moura, R$ 1.204,65, data efetiva 11/05/2026**, ID `cmuzcwv8o08kvmm0p4qjqlnv4`. Nada foi alterado. A verificação isolada comparou a assinatura de todos os movimentos reais antes/depois e confirmou igualdade.

Na migration, linhas antigas recebem natureza STANDARD e beneficiário nulo. O cálculo interpreta o financiador PERSON como beneficiário implícito nesses históricos, sem backfill nem mudança de IDs. O endpoint também aceita os payloads antigos e reconhece a mesma chave idempotente de aporte próprio já existente. Aporte próprio da Laura permanece contribuição própria, sem financiamento ou obrigação.

## Caso Sandra — verificações sintéticas

Origem Flyimob; beneficiário Sandra; conta sintética representando Goiás; BRL 279,32; RECOVERABLE. Não foi cadastrado esse movimento nas tabelas de produção.

| Item antes de consumo | Valor |
|---|---:|
| Entrada física única na Meta | R$ 279,32 |
| Aporte próprio da Sandra | R$ 0,00 |
| Crédito recebido para mídia pela Sandra | R$ 279,32 |
| Obrigação recuperável da Sandra | R$ 279,32 |
| Posição econômica líquida da Sandra | R$ 0,00 |
| Financiamento Flyimob a receber | R$ 279,32 |
| Crédito institucional Flyimob ainda livre para mídia | R$ 0,00 |
| Posição econômica Flyimob incluindo recebível | R$ 279,32 |
| Crédito operacional / obrigação explícita | R$ 279,32 |

A origem continua Flyimob. A empresa não fica com o mesmo crédito para mídia que já destinou à Sandra. A Sandra recebe capacidade para mídia e assume a dívida, sem um aporte próprio fictício. A soma das posições econômicas é 279,32, não 558,64. Recebível e obrigação são as duas faces do mesmo financiamento e não devem ser somados como exposições independentes.

STANDARD + Flyimob sem beneficiário mantém crédito institucional. STANDARD + beneficiário representa destinação sem obrigação de devolver; o relatório mostra crédito recebido, não aporte próprio. Origem PERSON admite financiador e beneficiário diferentes para destinação sem obrigação de devolver. RECOVERABLE nesta versão é específico para financiamento Flyimob a pessoa comercial.

## Fórmulas e ausência de duplicação

Tudo é calculado pelo mesmo `economicLedger`, em Decimal, por identidade operacional canônica, moeda e contas selecionadas, através da data final do relatório:

```
crédito para mídia = aportes da origem + ajustes comuns
                  - crédito destinado a beneficiários + crédito recebido
                  + transferências por compensação - consumo efetivo

posição econômica = crédito para mídia + principal a receber - obrigação recuperável

crédito operacional = obrigação recuperável + max(-crédito para mídia, 0)

exposição Flyimob = principal recuperável dos responsáveis filtrados
                 + min(crédito institucional positivo disponível,
                       consumo sem cobertura dos responsáveis filtrados)
```

O aporte físico é contado somente no movimento CONTRIBUTION original. A destinação e a obrigação são projeções desse mesmo registro. Liquidações são ajustes vinculados com `affectsPhysicalBalance=false`: não geram outra entrada física, não entram como aporte e não alteram o consumo.

A parcela explícita da exposição decorre do principal contratado; a parcela potencial continua uma estimativa para consumo sem financiamento explícito. O crédito operacional inclui o principal ainda devido, inclusive quando há crédito de mídia ainda não consumido; o rótulo não apresenta todo esse principal como gasto já realizado. A posição Flyimob já inclui recebíveis; não somar o card de recebíveis novamente à posição.

Os cards de obrigações/recuperação/exposição acompanham o filtro de responsável/função. Aportes do período são contados uma vez pela origem física, mas considerados pelo beneficiário ao filtrar pessoa. A posição Flyimob é o consolidado das contas selecionadas, com rótulo explícito. Caixa físico continua fotografia atual das contas, sem filtro de pessoa. As moedas permanecem segregadas.

Na lista de Aportes, o período seleciona a data do lançamento original; o principal restante/disponível para liquidar considera o estado atual de todas as liquidações vinculadas. Para consultar a obrigação histórica até uma data final, usar o Pulmão, que exclui liquidações posteriores àquela data.

## Liquidação futura

O botão **Liquidar financiamento** aparece no aporte recuperável confirmado. Cada recuperação é um novo ADJUSTMENT/COMPENSATION, de valor positivo, com data efetiva, motivo, status, auditoria e referência ao aporte original.

- **SETTLEMENT_META:** compensa crédito econômico disponível na mesma conta/currency. Reduz a obrigação e transfere o crédito econômico do beneficiário à Flyimob, sem nova entrada de dinheiro. Para usar um novo aporte próprio, cadastrar primeiro a entrada e depois a compensação desejada. Também é possível devolver à empresa crédito de mídia não consumido. Não é PIX, saque ou comando financeiro à Meta.
- **SETTLEMENT_EXTERNAL:** registra recuperação efetivamente recebida fora da Meta. Reduz obrigação/recebível e informa recuperado externo acumulado, sem aumentar crédito de mídia ou saldo Meta. O valor é histórico de recuperações, não uma conta bancária com saldo atual; não substitui o Financeiro geral.

Um novo aporte próprio **não quita a dívida automaticamente**: a decisão precisa ser explícita e auditada. Não há juros, parcelamento automático, desconto em comissão ou automação de cobrança nesta versão.

Exemplo sintético com consumo efetivo igual ao investimento Meta, para mostrar a mecânica sem sobretaxa:

| Etapa | Caixa Meta calculado | Crédito mídia Sandra | Dívida Sandra | Crédito mídia Flyimob | Recebível Flyimob |
|---|---:|---:|---:|---:|---:|
| Financiamento 279,32 | 279,32 | 279,32 | 279,32 | 0,00 | 279,32 |
| Consumo 279,32 | 0,00 | 0,00 | 279,32 | 0,00 | 279,32 |
| Aporte próprio 100 + compensação 100 | 100,00 | 0,00 | 179,32 | 100,00 | 179,32 |
| Recuperação externa 179,32 | 100,00 | 0,00 | 0,00 | 100,00 | 0,00 |

As regras de custo efetivo e suas correções auditadas continuam aplicadas no cenário real, preservando a diferença entre consumo físico Meta e consumo econômico.

## Proteções

- OWNER escreve; DIRECTOR consulta. Hierarquia operacional não substitui autorização de usuário.
- Financiador/beneficiário de novos aportes devem ser ativos e elegíveis pela policy comercial canônica, sem exigir login. Corretores, gerentes, diretores e direção/owner operacionais são aceitos.
- Liquidação de financiamento histórico permite beneficiário posteriormente inativo/promovido, sem alterar cargo, pessoa ou campanha.
- API valida principal confirmado, mesmo tenant/beneficiário/conta/moeda e data não anterior ao aporte. Valor liquidado mais recuperações pendentes/confirmadas não ultrapassa o principal.
- Pendentes reservam principal mas não alteram caixa, dívida confirmada ou posição econômica até confirmação. Confirmar recuperação Meta revalida o crédito disponível.
- Compensação Meta reutiliza o razão econômico e o overlay histórico de custos, reservando também compensações pendentes. Crédito insuficiente ou métricas indisponíveis impedem a compensação. O cálculo depende da cobertura histórica importada; atualizar/importar dados antes de liquidar.
- Transações SERIALIZABLE com retry existente; trigger no banco bloqueia o principal para serializar liquidações concorrentes e valida o estado final da transação, inclusive ao cancelar.
- Não é permitido cancelar o financiamento original enquanto houver recuperação pendente/confirmada vinculada. Cancelar corrige lançamento indevido; recuperar dinheiro deve usar liquidação, preservando o aporte válido.
- Cancelar uma liquidação indevida restitui a obrigação nas projeções; original, auditoria, valores e datas permanecem no histórico.
- Comprovantes continuam privados, anexáveis às novas liquidações pela lista existente, com escopo e checksum. Nenhuma infraestrutura paralela de anexos.

## Arquivos e validação

Principais arquivos: `prisma/schema.prisma`, migration `20261008120000_marketing_funding_beneficiary`, `finance.server.ts`, `finance-calculations.ts`, `finance-queries.server.ts`, `funding.server.ts`, `funding-policy.ts`, `finance-ui.tsx`, `finance-position-table.tsx` e `tests/marketing/funding.test.ts`.

- 449 testes Marketing/Documentações/Financeiro/Academy aprovados, incluindo 33 novos testes de financiamento e as regressões temporais da rodada anterior. A compensação também foi testada contra o overlay de correção histórica do custo efetivo.
- Verificação PostgreSQL isolada: 30 checagens aprovadas, incluindo preservação de payload antigo, caso Sandra, compensação após consumo/aporte próprio, recuperação externa, pendência/confirmação, inativação/promoção, filtros de Laura/Sandra, cancelamento e mensagens específicas das constraints. O schema foi revertido na mesma transação; nenhum registro sintético foi persistido nas tabelas reais. Assinatura do histórico financeiro real idêntica antes/depois.
- Prisma validate/generate e diff de modelos: aprovados.
- TypeScript e ESLint dos arquivos envolvidos: aprovados.
- Build de produção da árvore final: aprovado, incluindo compilação, TypeScript e geração das páginas. Avisos existentes de middleware/baseline-browser-mapping/configuração Prisma não impediram o build.

Scripts reproduzíveis: `scripts/marketing-funding-verify.ts` (PostgreSQL isolado com rollback) e `scripts/marketing-funding-history.mjs` (leitura/hash do histórico real). Nunca imprimir URL do banco nem secrets.

## Publicação e verificação manual posterior

A migration **não foi aplicada em produção**. Não publicar o código sem aplicá-la primeiro: as novas consultas dependem desses campos. O build padrão não executa migrations. Não executar o antigo verificador financeiro `--service-rollback` contra a produção enquanto essa migration estiver pendente, pois o Prisma local já conhece o modelo novo.

Após publicação autorizada:

1. Conferir o aporte próprio de Laura com origem Pessoa, beneficiário Laura, valor/data/status antigos e sem dívida nova.
2. Selecionar origem Flyimob e verificar o campo Responsável beneficiado. Escolher Sandra/Goiás/natureza recuperável somente ao registrar um aporte real confirmado, sem criar novo teste financeiro real.
3. Confirmar origem Flyimob, aporte próprio Sandra zero, crédito recebido e obrigação correspondentes. Os efeitos no caixa devem corresponder a uma única contribuição.
4. Verificar aportes institucionais sem beneficiário e destinação sem recuperação como naturezas diferentes.
5. Conferir filtros por pessoa/conta/moeda/data e períodos anteriores ao financiamento/liquidação.
6. Quando ocorrer aporte próprio ou recuperação real, registrar a forma correta de liquidação, parcial ou total, e anexar comprovante pela lista. Não cancelar o aporte válido para simular pagamento.
7. Conferir histórico e permissão DIRECTOR somente leitura. Não existe alteração automática de orçamento/campanha nem envio de cobrança.
