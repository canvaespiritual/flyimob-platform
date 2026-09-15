# Academy — Etapa 2

## Corretor Academy

`funnelKey=corretor-academy`, `vslKey=corretor-academy-v1`, `videoId=6aa950430492aa379514a80b`, `pitchSecond=2034`.

Produto `C13699064X`, oferta `a2itt7gi`, cupom `PONTE`. O script VTurb está centralizado em `src/lib/academy/config.ts`; a página/player ainda não foi alterada.

## Pré-checkout

`POST /api/academy/precheckout` exige o cookie anônimo e Bearer token da sessão. Aceita somente `name`, `email` e `phone`. O servidor normaliza, localiza a sessão pelos tokens e cria um `AcademyLead` com snapshot da atribuição. O navegador não fornece nem sobrescreve UTMs ou IDs.

Idempotência: `(sessionId, email normalizado, phone normalizado)`. Não há unicidade global de email; o mesmo contato em sessões diferentes preserva atribuições históricas.

## Checkout

`hotmartCheckoutUrl(false)` usa `off=a2itt7gi`; com desconto acrescenta `offDiscount=PONTE`. Não foram adicionados parâmetros de pré-preenchimento: a documentação oficial consultada não confirmou parâmetros atuais para nome, email ou telefone.

## Webhook bloqueado até confirmação do contrato

`POST /api/academy/webhooks/hotmart` existe, mas falha fechado e não persiste payload enquanto não forem confirmados para a conta: header/token/assinatura, versão, payload, IDs únicos do evento/transação, nomes de eventos e campos oficiais de comprador/valores.

A documentação oficial informa a configuração em Ferramentas → Webhook (API e notificações), eventos de compra (aguardando pagamento, aprovada, completa, cancelada, reembolsada, chargeback, expirada, pedido de reembolso, atrasada) e reenvio automático de posts com erro até cinco vezes. Ela não foi suficiente para inventar autenticação ou correlação.

Fontes: [Webhook/Postback](https://help.hotmart.com/pt-br/article/360001491352/como-configurar-a-api-do-meu-produto-usando-o-webhook-postback-), [Integrações](https://help.hotmart.com/pt-br/article/115001757372/como-conecto-as-ferramentas-e-provedores-de-integracao-na-minha-conta-hotmart-) e [Developers](https://developers.hotmart.com/docs/pt-BR/).

Variáveis reservadas, sem valores no repositório:

```dotenv
HOTMART_WEBHOOK_TOKEN=<segredo confirmado>
HOTMART_WEBHOOK_AUTH_HEADER=<header confirmado>
```

Enquanto o contrato não for confirmado, o endpoint não cria `AcademyWebhookEvent` nem `AcademySale`.

`AcademyLead`, `AcademySale` e `AcademyWebhookEvent` são separados de CRMLead e FinancialSale. Sale usa Decimal; status suportam pending, approved, completed, cancelled, expired, refunded e chargeback. O processamento idempotente será liberado após confirmação do contrato.
