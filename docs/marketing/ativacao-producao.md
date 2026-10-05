# Revisão final e primeira ativação Meta — 05/10/2026

O responsável informou que as cinco variáveis Meta estão configuradas no Railway, serviço `flyimob-platform`, e que o Login para Empresas emite token de usuário com `ads_read`, `ads_management` e `business_management`. Não foram lidos/exportados valores de produção nem alteradas secrets. A compatibilidade foi conferida no código e em testes sintéticos; a validade efetiva das configurações será comprovada pelo primeiro OAuth real.

Callback: `https://flyimob.com/api/integrations/meta/callback`. A URL de autorização inclui `client_id`, `config_id`, `response_type=code`, `override_default_response_type=true`, callback exato e state aleatório. Não adiciona `scope` para substituir as permissões da configuração. A aplicação exige `ads_read`; as outras permissões não habilitam comandos de escrita. Dados publicitários usam exclusivamente GET e endpoints permitidos. POST externo existe somente para troca de credenciais OAuth.

State: hash no banco, tenant/ator/conexão/versão, validade de dez minutos, consumo único e cookie Secure/HttpOnly/SameSite=Lax. Callback depende da sessão OWNER original; abrir a autorização no mesmo navegador em que se entrou no Flyimob. Credencial AES-256-GCM vinculada ao tenant e conexão. Reconectar preserva dados e usa controle de versão. Não há token em resposta de Configurações, auditoria ou log do módulo.

A revisão corrigiu o caso de Insights históricos trazerem campanhas que não aparecem mais na edge `/campaigns`: a ingestão usa `campaign_id` e `campaign_name` devolvidos pela Meta, sem inventar nomes/status. Também foram adicionados testes da configuração com as três permissões, do cookie OAuth, do callback rejeitado e desse histórico.

## Verificações da versão publicada

- Prisma validate e generate aprovados; migrate status confirmou 30 migrations e banco atualizado.
- TypeScript e lint do módulo aprovados; AdminShell mantém apenas o aviso anterior sobre `<img>`.
- Build de produção aprovado; avisos anteriores de middleware, baseline-browser-mapping e Prisma package.json não foram alterados.
- 288 testes aprovados: 70 Marketing e 218 regressões de Documentações, Financeiro e Academy.
- `git diff --check` aprovado; arquivos de ambiente ficam ignorados pelo Git.
- `main` alinhada com `origin/main` antes da publicação. Não foi criada configuração de Railway, cron ou variável nova nesta rodada.

As migrations da fundação e da integração fazem parte do primeiro commit de Marketing:

- `20261003020000_marketing_foundation`
- `20261005010000_marketing_meta_v1`

Ambas já estavam aplicadas no PostgreSQL configurado. Nenhuma migration nova foi necessária na revisão final. `prisma migrate deploy` é idempotente e pode continuar no pre-deploy existente. O script `build` gera Prisma Client, mas não executa migrations; se o serviço apontar para outro banco, aplicar as duas migrations antes de servir a nova versão. Não executar reset/db push.

## Teste manual em flyimob.com após o Railway concluir

1. Conferir que o deploy ativo corresponde ao novo commit de `main` e que terminou sem erro. Entrar como OWNER de uma operação, não da plataforma master.
2. Marketing → Configurações: o aviso de OAuth pendente deve desaparecer. Conectar Meta → criar nome → Conectar Meta na conexão. Autorizar diretamente na Meta, no mesmo navegador. Não copiar tokens para o Flyimob/chat.
3. Verificar o retorno a Configurações com conexão autorizada e contas descobertas. Caso haja aviso de descoberta pendente, usar Descobrir contas. Todas as contas novas devem estar **desmarcadas**; conferir nome, moeda, timezone e status. Selecionar explicitamente apenas uma conta ativa para o primeiro teste.
4. Visão geral → ↻ Atualizar. Esperar sucesso/horário de atualização. Primeiro sync importa o mês anterior e o atual, com dias locais da conta. Selecionar **Todas as finalidades** para conferir os dados iniciais: campanhas novas começam **Não classificada**, enquanto o filtro padrão mostra **Clientes**.
5. Campanhas: conferir nomes/IDs/status. Classificar as campanhas de aquisição como Clientes e atribuir corretor com uma data que cubra o histórico a conferir. Uma atribuição iniciada hoje não transfere retroativamente o mês anterior para o corretor.
6. Conferir hoje, ontem, mês anterior e período personalizado contra Ads Manager usando a mesma conta, moeda, timezone e condições de atribuição. Conversas = `onsite_conversion.messaging_conversation_started_7d`. CPL Meta = gasto Meta/conversas; CPL efetivo usa gasto com acréscimo. Zero no denominador aparece como `—`.
7. Atualizar novamente e conferir que o total de hoje é substituído, não duplicado. Mudar filtros e colunas sem clicar Atualizar: essas operações não devem criar nova sincronização nem consultar Meta.
8. Exercitar Gestão diária, Aquisição, Financeiro, Completa, seleção/ordem e Restaurar padrão; recarregar para conferir preferência do usuário. Com mais contas selecionadas, verificar consolidação do corretor e moedas separadas.
9. Usar Reconectar Meta para confirmar que seleção, campanhas, métricas e atribuições permanecem. DIRECTOR deve visualizar/classificar/atribuir, sem configurações ou botão de sincronização; BROKER/CORRESPONDENTE não acessam esta área.
10. Fazer uma navegação básica por Documentações, Financeiro e Academy. Não testar pausa, ativação, orçamento ou qualquer escrita publicitária: a V1 não implementa essas ações.

Limites mantidos: worker agendado não foi ativado; retentativas elegíveis podem ser retomadas com novo clique. Contas volumosas podem exceder limites da leitura síncrona. Creative ID é observado no anúncio no momento da consulta, não comprova sua vigência em dias passados. Validação com dados reais depende desses testes após deploy; não foi antecipada nesta revisão.
