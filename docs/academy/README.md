# Academy — Etapa 1: fundação

Domínio interno da Flyimob, independente dos tenants imobiliários. Somente
`AcademyVisitor`, `AcademySession`, `AcademyEvent`, `AcademyWatchRange` e o enum
`AcademyEventType`. Route Handlers → `src/lib/academy` → Prisma compartilhado →
`DATABASE_URL` existente. Nenhum Pool, backend ou banco adicional.

## Identidade e sessão

- Cookie anônimo com 32 bytes aleatórios (base64url), `HttpOnly`, `SameSite=Lax`,
  caminho `/`, 180 dias. Em produção: `Secure`, nome `__Host-flyimob_academy_visitor`;
  em desenvolvimento: `flyimob_academy_visitor`. Somente SHA-256 é persistido.
- Não há fingerprint, IP, associação a usuário ou identidade pessoal. Apagar o
  cookie cria outra identidade. Cookie desconhecido é substituído, não adotado.
- A sessão possui outro token aleatório; somente seu hash é persistido. IDs
  retornados são referências, nunca credenciais. Coleta exige token **e** cookie
  correspondente. Token não deve aparecer em URL, metadata ou logs.
- Duração absoluta de 24 horas e expiração por 30 minutos de inatividade. Resume
  válido preserva origem e métricas; resume expirado cria nova sessão do mesmo
  visitante. Token inválido retorna 401, funil diferente retorna 409.
- Sem token de retomada, cria-se uma nova sessão. Para o futuro coletor, guardar
  token/contador por aba, por exemplo em `sessionStorage`, e serializar a
  inicialização. Não compartilhar um contador de sequência entre abas.
- Se a resposta da criação for perdida, não é possível recuperar o token pelo
  hash; criar outra sessão. Não há garantia de idempotência da primeira criação.
- Mudança de campanha/funil: iniciar nova sessão sem Authorization. A origem de
  uma sessão retomada não é sobrescrita pelo novo body.
- `vslKey` (até 80 caracteres) identifica a versão/variante da VSL e `videoId`
  (até 200) identifica o vídeo exibido. Ambos são opcionais, sem tabela/catálogo
  adicional: ausência significa desconhecido (`null`), nunca uma versão inventada.
  Na retomada, enviar os mesmos valores, inclusive a ausência. Mudança ou omissão
  de identificação antes conhecida retorna 409 `vsl_context_mismatch`; iniciar
  nova sessão sem Authorization para trocar VSL/vídeo. Esses campos são snapshots
  imutáveis declarados pelo coletor, não credenciais nem verificação do provedor.
  Ao substituir o conteúdo de um vídeo mantendo seu ID, mudar também `vslKey`.

## Configuração

Variáveis opcionais, sem alterar o `.env` nesta etapa:

```dotenv
ACADEMY_FUNNEL_KEYS=corretor-de-imoveis
ACADEMY_ALLOWED_ORIGINS=https://flyimob.com
```

Funis são uma lista separada por vírgula; padrão `corretor-de-imoveis`.
Origens devem ser exatas, sem caminho/barra final. Sem configuração usa-se a
origem da URL da requisição; atrás de proxy configure a origem pública.
`Origin` é obrigatório, inclusive em clientes de teste. Não há CORS permissivo.
Requisições com `Sec-Fetch-Site: cross-site` são rejeitadas.

## POST /api/academy/sessions

Content-Type: `application/json`. Para retomar, adicionar
`Authorization: Bearer <collectorToken>` e enviar o cookie existente.

```json
{
  "funnelKey": "corretor-de-imoveis",
  "vslKey": "corretor-v1",
  "videoId": "video-id-exemplo",
  "attribution": {
    "source": "meta",
    "utmSource": "facebook",
    "utmMedium": "paid_social",
    "utmCampaign": "curso",
    "campaignId": "123",
    "landingPage": "https://flyimob.com/academy/corretor-de-imoveis"
  }
}
```

Também aceita `utmContent`, `utmTerm`, `utmId`, `fbclid`, `fbp`, `fbc`, `adsetId`,
`adId`, `gclid`, `wbraid`, `gbraid` e `referrer`. Os três identificadores Google
são strings opacas opcionais de até 500 caracteres (limite interno desta etapa),
sem conversão de caixa ou interpretação. São capturados uma vez na criação;
retomar não os substitui nem preenche retroativamente valores ausentes.
Todos são opcionais, limitados e não verificados; não se deduzem
IDs de anúncio a partir de fbclid. URLs armazenadas perdem query e fragmento.

Resposta 201 ao criar, 200 ao retomar: `ok`, `sessionId`, `collectorToken`,
`expiresAt`, `resumed`, `nextSequence`, mais Set-Cookie. `nextSequence` é o
próximo número após o maior persistido; o cliente deve preservar eventos ainda
na fila e não renumerar retries. `expiresAt` é o limite absoluto, não o de idle.

## POST /api/academy/events

Exige Authorization Bearer e cookie do visitante. Sem `visitorId`/`sessionId`
no body. Exemplo (substituir as datas por observações atuais em UTC):

```json
{
  "events": [{
    "eventKey": "evt-001",
    "sequence": 0,
    "type": "PROGRESS",
    "clientAt": "2026-09-15T12:00:30.000Z",
    "positionSecond": 30,
    "metadata": { "player": "vturb" },
    "ranges": [{
      "rangeKey": "range-001",
      "startMs": 0,
      "endMs": 30000,
      "observedStartAt": "2026-09-15T12:00:00.000Z",
      "observedEndAt": "2026-09-15T12:00:30.000Z"
    }]
  }]
}
```

Tipos: `PLAYER_READY`, `PLAY`, `PAUSE`, `PROGRESS`, `SEEK`, `ENDED`,
`PITCH_REACHED`, `CHECKOUT_OPEN`, `CHECKOUT_CLICK`. `positionSecond` é obrigatória,
exceto em `PLAYER_READY`, `CHECKOUT_OPEN` e `CHECKOUT_CLICK`.
Não há evento Purchase nem status de pagamento.
Ranges só são aceitos em `PROGRESS`, `PAUSE` e `ENDED`.

Resposta 200: `ok`, `accepted`, `duplicates` e `metrics`. O lote é atômico:
qualquer conflito/erro impede gravação parcial. Respostas usam `no-store`.

Erros: 400 payload/funil inválido; 401 credenciais; 403 origem; 409 conflito de
chave, sequência, range ou concorrência; 410 sessão expirada; 413 body;
415 tipo/encoding; 429 capacidade da sessão; 500 falha interna.

## Métricas e contrato do futuro coletor

- `currentSecond`: posição do evento com maior sequência posicional aceita.
- `maxReachedSecond`: máximo das posições e finais de ranges, nunca diminui.
- `watchedSeconds`: união dos intervalos de relógio observados em reprodução.
  Repetir conteúdo em outro instante aumenta esse valor; relatos sobrepostos
  do mesmo instante não o duplicam.
- `uniqueWatchedSeconds`: união dos intervalos do conteúdo `[startMs,endMs)`.
  Repetir o mesmo conteúdo não aumenta novamente a cobertura.
- Em velocidade 2x, 30 segundos de relógio podem cobrir 60 segundos do vídeo.
- Play/pitch/abertura/clique guardam a primeira data de cliente aceita para o respectivo
  evento. São declarações de telemetria, não comprovação independente do player.
  `CHECKOUT_OPEN` atualiza `checkoutOpenedAt`: pré-checkout efetivamente exibido.
  `CHECKOUT_CLICK` atualiza `checkoutClickedAt`: envio válido do formulário e ação
  de saída para o checkout externo, não o simples clique que abre o formulário.
  A futura integração deve emitir CLICK após o sucesso do envio. O backend desta
  etapa recebe somente telemetria; não comprova carregamento externo nem compra.
  São agregados independentes; não se infere OPEN a partir de CLICK, nem se impõe
  ordem de chegada entre eles. Nenhum Checkout ou formulário existe nesta etapa.

**Assistir 30s e pular a 1200s resulta em máximo 1200s e tempo/cobertura 30s.**
SEEK nunca carrega range. Não se cria range subtraindo duas posições quaisquer.
O futuro adaptador deve fechar o trecho anterior ao seek/pausa/buffering e
iniciar outro após reprodução confirmada. Deve dividir trechos longos, tratar
velocidade, autoplay e relógio do dispositivo. Timestamps precisam ser UTC ISO
com milissegundos. O backend não prova que o usuário assistiu: ele valida e
agrega intervalos declarados; cliente malicioso ainda pode falsificar telemetria.

## Idempotência, limites e integridade

- Uniques: `(sessionId,eventKey)`, `(sessionId,sequence)`, `(sessionId,rangeKey)`.
- Evento reentregue com conteúdo canônico igual é ignorado. Alterar conteúdo
  mantendo a chave retorna 409. Hash inclui ranges e ignora ordem de chaves JSON
  e de ranges. Para retries, reenviar o evento completo e imutável.
- Um range pertence a um evento da mesma sessão por FK composta. A mesma chave
  em outro evento é conflito, não nova visualização.
- Transação serializable, escrita na sessão e até três tentativas em conflitos
  Prisma P2034/P2002. Nenhum envio externo ou processamento em background.
- 32 KiB por body, até 20 eventos e 20 ranges no total do lote; metadata objeto
  de até 1 KiB UTF-8, profundidade 3, 100 nós, strings de até 256 caracteres.
- Posições até 6h; observação contínua até 30s; avanço até 2x o tempo observado
  mais 250ms de tolerância. Margem de relógio de 5 minutos; observações não podem
  preceder a sessão além dessa margem. Chaves têm até 80 caracteres.
- Até 10.000 eventos/ranges por sessão. Cobertura é recalculada sobre os ranges
  dessa sessão, sem criar tabelas adicionais. Capacidade limita esse trabalho.
- Checks SQL reforçam intervalos, métricas e metadata. Alterar limites exige
  revisar `limits.ts` e esses checks em uma nova migration.
- Visitante com sessões não pode ser excluído diretamente (`Restrict`). Excluir
  sessão remove somente seus eventos/ranges (`Cascade`). Não há endpoint de exclusão.
- Não incluir dados pessoais/segredos na origem ou metadata. Não coletamos
  fingerprint, IP, consentimento ou dados de contato.
- Não há rate limiting distribuído: limites por requisição/sessão não bloqueiam
  criação abusiva de novas identidades. O guard de entrada está separado para
  acrescentar proteção de borda/compartilhada antes de liberar tráfego amplo.

## Migration e validação

`20260915000000_add_academy_foundation/migration.sql` foi gerada comparando
dois schemas locais e complementada com checks. Não foi aplicada. Não usar
`db push`, seed ou migrate contra banco remoto/produção sem aprovação explícita.
Prisma Client foi gerado apenas em `node_modules`; endpoints só poderão gravar
quando a migration for aplicada no ambiente autorizado.

Testes locais sem banco: `node node_modules/tsx/dist/cli.mjs --test tests/academy/foundation.test.ts`.
Validar: `prisma validate`; lint dos diretórios Academy; TypeScript sem emissão.
Concorrência real e FKs ainda precisam de teste em banco autorizado após migration.

## Fora desta etapa

Nova página/integração VTurb, coletor de navegador, Lead, Checkout, Sale,
WebhookEvent, Hotmart, Meta CAPI, GA4, consentimento, ConversionDelivery e admin.
VSLs de recrutamento, autenticação atual e domínios imobiliários não foram alterados.
Etapa 2 sugerida: adaptador do player/coletor, validação ponta a ponta de retomada,
pausa/seek/replay e falhas de rede, depois de autorizar a migration.
