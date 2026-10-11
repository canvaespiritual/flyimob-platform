# Escritório do corretor

## Decisão final do produto

O responsável autorizou commit, push e deploy do escritório, aceitando temporariamente a privacidade preexistente dos comprovantes financeiros públicos. Nenhuma política, bucket, objeto, URL antiga, permissão ou regra financeira será alterada nesta entrega. O Financeiro reutiliza URLs gravadas somente para comprovantes vinculados aos lançamentos selecionados do participante autenticado. Marketing mantém seus downloads privados autorizados. A pendência de storage continua aberta e não é considerada resolvida.

Validação final: 550 testes aprovados, incluindo escritório e regressão de Treinamentos; TypeScript e lint sem erros. Leitura real somente de consulta confirmou funcionamento de Dashboard, Marketing e Financeiro para a Adriana; seu vínculo operacional existe, mas não há participante financeiro explicitamente associado. A tela informa esse estado vazio até revisão administrativa do vínculo, sem associar históricos por nome ou executar concessões.

## Consolidação para publicação

O checkout foi avançado por fast-forward para `25df3cb1464f1cc06f1283dcc6dfc2c1de05ae61`. Os arquivos de Treinamentos estão idênticos ao commit publicado. Arquivos locais anteriores do player que colidiam com essa atualização foram preservados no stash `preserve pre-publication player working files before 25df3cb consolidation`, sem reaplicar uma versão antiga sobre o player publicado. Outros diagnósticos e scripts ficaram fora do escopo do escritório.

Arquivos desta entrega: `src/app/admin/AdminShell.tsx`, `src/app/admin/dashboard/page.tsx`, `src/app/admin/corretor/[section]/page.tsx`, as duas rotas sob `src/app/api/broker-office`, `src/components/broker-office/Office.tsx`, os oito módulos sob `src/lib/broker-office`, `tests/broker-office/office.test.ts` e este documento. A prévia sintética em scripts é ferramenta local e não deve entrar no commit de publicação.

Após consolidação: suíte de 550 testes aprovada, TypeScript aprovado e lint sem erros. Railway confirma Flyimob `25df3cb` e Horizonte `bba17f9` com status SUCCESS; login Flyimob e health Horizonte respondem 200. A API de Treinamentos sem sessão responde 401, como esperado. Nenhum novo deployment foi feito.

Build consolidado aprovado. Prévia local das três áreas repetida, incluindo financeiro em 390×844, navegação ao vale e expansão de sua compensação, sem rolagem horizontal. Nenhuma migration ou regra financeira foi alterada. Na consolidação inicial a publicação foi suspensa; posteriormente o responsável autorizou publicar sem alterar storage, políticas ou links antigos, aceitando temporariamente a condição preexistente.

**Pendência preexistente de privacidade (aceita temporariamente pelo responsável pelo produto):** a inspeção somente leitura confirmou HTTP 200 anônimo em um comprovante financeiro antigo. A configuração de bloqueio de acesso público do bucket está desativada; a credencial disponível não possui autorização para consultar sua política (AccessDenied). Nenhuma URL, credencial ou conteúdo financeiro foi registrado. As telas administrativas ainda usam URLs diretas, inclusive FinancialAttachmentsManager e demonstrativo de remessa. Proteger apenas o BFF não revoga URLs antigas.

Alternativa controlada, sem apagar históricos: preparar download administrativo autenticado com os mesmos papéis/tenant existentes; substituir os links diretos e validar a geração do demonstrativo; sob autorização específica e acesso do responsável pelo storage, retirar GetObject anônimo exclusivamente de `public/financeiro/*`, mantendo leitura autenticada do backend e deixando os demais prefixos intactos. Verificar URL antiga anônima bloqueada e comprovante autorizado funcionando antes de ativar o escritório. Isso requer mudança no storage e pode interromper links antigos; não foi executado automaticamente. Objetos e vínculos podem permanecer no lugar, mas a política efetiva e seus consumidores precisam ser validados antes de garantir que dispensa migração. Cópias já baixadas/cacheadas publicamente não podem ser recolhidas por essa alteração.

A publicação desta entrega está autorizada. Não inclui migrations, concessões, mudanças financeiras ou alterações na Horizonte/storage.

## Arquitetura escolhida

Mantidas as três áreas propostas: Dashboard, Marketing e Financeiro. São projeções de leitura dos módulos existentes, sem novas tabelas, lançamentos, contas ou regras de comissão. Rotas próprias `/admin/corretor/dashboard`, `/admin/corretor/marketing` e `/admin/corretor/financeiro` evitam abrir os endpoints administrativos ao BROKER. O menu administrativo mantém suas permissões; o menu do corretor mantém clientes, documentação, treinamentos e demais funções existentes.

O BFF `/api/broker-office/{dashboard,marketing,finance}` recebe somente filtros de período. Identidade e tenant vêm da sessão. Cada relatório usa uma transação PostgreSQL `RepeatableRead`, explicitamente somente leitura, para evitar misturar uma atualização administrativa com registros anteriores na mesma resposta. Não há cache de relatório no navegador ou service worker.

## Auditoria e reaproveitamento

| Área existente | Reaproveitado | Adaptação individual |
| --- | --- | --- |
| Usuários / Equipe | User, OperationPerson, aliases de pessoas mescladas e FinancialParticipant | Relações explícitas, sem associação por nome/e-mail; login, pessoa operacional e participante continuam distintos |
| Financeiro / participantes | FinancialEntitlement, FinancialStage, FinancialSale, FinancialPayment e alocações | Apenas participantes do login; valores oficiais `finalAmount`, etapas ATO/BANCO/PREMIO/COMPLEMENTO e datas originais |
| Ajustes e vales | FinancialAdjustment e suas alocações; `calculateAdjustmentBalance`, `calculateEntitlementSettlement` | Original, compensações parciais, restante, crédito/débito e cancelamentos; nenhuma nova regra de vale |
| Marketing | Campanhas, atribuições datadas, métricas diárias, regras/correções de custo e sincronizações | Responsável válido no dia da métrica; contas/BMs compartilhadas não liberam campanhas de colegas |
| Recursos de marketing | MarketingMoneyMovement e `economicLedger` | Aporte próprio, incentivo, bonificação, empréstimo, recuperação e posição econômica separados; pais globais usados somente no cálculo existente |
| Resultados de marketing | `summarize`, `performanceSeries`, cobertura de importação | Consumo Meta e consumo efetivo distintos, CPL por moeda, evolução diária e cobertura parcial explícita |
| CRM | CRMLead do proprietário autenticado | Cadastros do período e situação atual; não inventar evento de atendimento ou recebimento de lead |
| Documentações | Escopo comercial/documental existente, pastas e arquivos ativos | Apenas pastas próprias; vínculo operacional prevalece sobre identificação legada |
| Comprovantes | Armazenamento privado documental usado no Marketing; S3 financeiro existente | Marketing: downloads autenticados por beneficiário. Financeiro: reutilização das URLs existentes somente após selecionar os lançamentos do participante autenticado; sem criar links públicos |
| PWA | Shell, manifest e service worker existentes | Navegação responsiva, cartões/listas, datas, históricos expansíveis; APIs e documentos privados continuam fora do cache offline |

O dashboard anterior era uma tela em construção. Foram adicionados indicadores clicáveis de cadastros CRM, documentos ativos, pastas em análise, aprovações, condicionadas, vendas com direitos registrados, direitos gerados, pagamentos efetivos, consumo/CPL e projeções registradas. Onde não há fonte confiável, o nome do indicador explica o que efetivamente é medido.

## Financeiro: significado dos valores

- Direitos registrados: soma dos direitos oficiais ativos, incluindo categorias do participante além de BROKER. Por isso o total não recebe o nome genérico de comissão.
- Pago por alocação: somente alocações em pagamentos PAID. Um pagamento pendente ou uma compensação não é dinheiro recebido.
- A liquidar: cálculo existente de liquidação, com pagamento, débito e crédito separados. Um vale pode ter alocações em diversas vendas; elas não criam novos vales ou novos pagamentos.
- Pendente com recebimento da empresa: direito restante em etapa com recebimento CONFIRMED.
- Projetado sem recebimento da empresa: direito restante já registrado em etapa sem esse recebimento. Não estima comissão futura para vendas sem direito lançado.
- Vales, descontos, outros débitos e créditos a compensar: saldos dos ajustes existentes, separados por natureza/efeito. Não é produzido um saldo líquido misturando projeção e obrigações.
- Histórico financeiro: filtro usa a data original da venda/direito, ocorrência do ajuste e pagamento/agendamento. Os detalhes preservam todas as alocações do registro selecionado para explicar sua liquidação, mesmo quando feitas fora do período.
- Posição financeira no topo: posição atual de todos os registros, não um balanço histórico na data final do filtro. Marketing, por sua regra existente, acumula a posição de mídia até a data final.
- Datas previstas nas etapas: previsão de recebimento da empresa; não uma promessa de pagamento ao corretor.
- Bonificação de mídia aparece no Marketing e, como referência, no Financeiro. Não é somada às comissões nem aos pagamentos. Moedas diferentes permanecem separadas.

Foi identificada diferença de apresentação entre telas financeiras antigas: a listagem de participantes considera recebimento confirmado e pagamento PAID, enquanto o detalhe tem agrupamentos distintos. A nova leitura segue os valores/alocações oficiais e explicita o critério; nenhuma tela ou regra administrativa foi alterada para reconciliar essa diferença.

## Segurança

BROKER ativo, tenant da sessão e tenant não plataforma são obrigatórios. Aliases de pessoas mescladas só são aceitos quando a raiz não pertence a outro login. Participantes vinculados explicitamente a outro login/pessoa não entram por coincidência de cadastro. Não se habilitam logins nem se reparam vínculos automaticamente.

Atribuições sobrepostas de campanhas são ambíguas: suas métricas ficam fora da projeção, em vez de dividir ou escolher um corretor. As consultas são restritas por tenant; métricas são filtradas por titularidade datada antes de resumir ou aplicar regras. Pais de financiamento global não são serializados. Alocações financeiras de outros participantes não expõem clientes no histórico.

Marketing valida individualmente recibo e operação antes de acessar armazenamento e mantém verificação de checksum. Os históricos financeiros selecionam os comprovantes pelo tenant e pelos lançamentos do participante autenticado e reutilizam as URLs gravadas anteriormente. Não há emissão de novos links públicos nem alteração de permissões de storage. A rota interna financeira também preserva validação individual, mas a interface usa os links existentes conforme decisão do produto.

**Limitação existente importante:** comprovantes financeiros antigos foram gravados em `public/financeiro/...` com URLs públicas. A seleção individual protege a listagem no escritório, mas não revoga essas URLs já existentes. Resolver a exposição antiga requer projeto separado de armazenamento privado, atualização dos consumidores e migração controlada dos objetos. Não foi executado nesta entrega.

## Pendências reais e dados insuficientes

1. “Leads recebidos” e “clientes atendidos” exigem eventos confiáveis de entrega/atendimento. O CRM atual permite medir cadastros e estado atual, sem reconstruir a evolução histórica do funil. Leads da Meta não equivalem automaticamente aos clientes entregues no CRM.
2. Vendas sem direito financeiro registrado não são inferidas no indicador de vendas; contratos/vendas não criam projeções novas nesta leitura.
3. Saldo físico individual da Meta não pode ser calculado de uma conta compartilhada. É mostrada a posição econômica existente, com alerta para lacunas; não é anunciada como saldo disponível.
4. Login sem pessoa ou participante explícito precisa de revisão administrativa dos vínculos existentes. A interface mostra a ausência; não associa históricos por nome.
5. Históricos muito grandes exigirão paginação de relatório: acima de 10 mil registros por classe financeira, 20 mil movimentos ou 100 mil métricas, a consulta falha claramente, sem apresentar totais truncados.
6. Homologação com corretor real, dados reais, bucket de produção e PWA instalado em aparelho físico permanece posterior à autorização de publicação. A inspeção visual local usa fixtures sintéticas, sem banco ou contas de produção.

## Validação e reprodução local

Testes em `tests/broker-office/office.test.ts` cobrem papéis, tenant, IDs manipulados, datas, troca de corretor/atribuição ambígua, aliases, vales parciais, pagamento pendente, cancelamentos, projeções, bonificação sem dupla contagem, dados globais não expostos, autorização de comprovantes e snapshot somente leitura.

Resultado local: regressão completa de 546 testes aprovada; os 11 testes específicos também passaram após o reforço final que exclui aliases com outro login explícito. TypeScript aprovado e lint sem erros (há um aviso preexistente de imagem no AdminShell). Inspeção visual do componente real em 1280×800 e 390×844, históricos expansíveis, consulta repetida, datas personalizadas, preservação do filtro na navegação e download sintético de comprovante. Nenhuma validação visual utilizou dados reais.

Build final aprovado, com 183 páginas estáticas geradas. No servidor local do build: APIs do escritório/comprovantes, Treinamentos e Equipe retornaram 401 sem sessão; as três páginas do escritório redirecionaram ao login; manifest, service worker e página offline retornaram 200. Estes checks não consultam históricos de produção nem validam um login real.

A prévia visual de homologação local usou o componente real com fixtures exclusivamente em memória e banner identificando dados sintéticos. O script descartável da prévia ficou fora do commit; não foi um teste autenticado contra o banco real.

Para homologação autorizada: corretor com vínculos explícitos existentes; comparar uma venda ATO/BANCO, vale parcialmente compensado, pagamento PAID, bonus de mídia e campanha transferida com registros administrativos; repetir com outro corretor e outro tenant; testar comprovantes, filtros, menus existentes e Treinamentos no desktop e PWA. Nenhum lançamento é necessário para a leitura.
