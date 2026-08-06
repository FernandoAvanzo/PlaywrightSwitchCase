# Relatório técnico — testes Playwright de estorno para Oracle EBS

**Data:** 06/08/2026  
**Projeto:** `ms-payment-playwright-e2e`  
**Referências:** [guia técnico de estorno](./guia-tecnico-testes-bdd-e2e-estorno-oracle-ebs.md) e [tarefa no Notion](https://app.notion.com/p/3b4b3def3e7c80d0a662f7e68497d115)

## Objetivo

Foi ampliada a suíte para verificar as regras de descida de estorno do `ms-payment` ao Oracle EBS. O foco não é apenas o HTTP de `void`: os testes representam o comportamento financeiro esperado, a publicação idempotente e o contrato legado que será transformado em XML.

O critério central é: um estorno total confirmado de PIX ou cartão do merchant `HUB` deve terminar em `REFUNDED` e gerar um único efeito de cancelamento. Estorno parcial, pendente, cancelamento pré-captura, replay e assinatura inválida não podem produzir um segundo efeito contábil.

## Estrutura adotada

```text
src/
  clients/ms-payment.client.ts       # void e recebimento de webhook
  clients/localstack-sqs.client.ts   # leitura read-only opcional da fila
  fixtures/refund.factory.ts         # eventos e headers de Malga
  helpers/reconciliation.assertions.ts # contrato Oracle e hardening
tests/
  contract/refund-oracle-contract.spec.ts
  e2e/refund-oracle.spec.ts
  resilience/refund-idempotency.spec.ts
  security/refund-webhook-security.spec.ts
```

A separação mantém o padrão existente: `MsPaymentClient` concentra chamadas HTTP, factories geram massa isolada por teste, assertions nomeiam o contrato de negócio e os specs ficam organizados por risco.

## Implementações

### Cliente da API

Foram adicionados `void(id, amount, key?)` e `postMalgaWebhook(payload, headers)`. O valor é enviado em unidades menores, como exige o contrato financeiro, e a chave de idempotência é opcional para permitir os testes de replay.

### Fixture de webhook

`refund.factory.ts` cria eventos com status `REFUNDED`, `PARTIALLY_REFUNDED`, `REFUND_PENDING` e `CANCELLED`, incluindo `refundedAmount`, pedido e `transactionRequests`. Cada evento recebe ID único; a idempotência é exercitada separadamente pela chave de negócio.

### Contrato Oracle

`expectRefundContract` verifica:

- envelope `json.row.order_paid`;
- `type=order.paid`;
- `order_status=C` e `order_status_descr=Cancelado`;
- presença de `order_cancel_date`;
- ausência de `order_delivery_date`, `order_refunded` e `order.refunded`;
- ausência de PAN, CVV e número completo de cartão;
- presença do valor e da semântica de refund/cancelamento.

O teste de contrato é determinístico e não depende do Oracle real. A validação XML/EBS continua pertencendo à campanha HML, conforme o guia, porque o Compose local não contém o ERP.

### Cobertura funcional e de resiliência

`refund-oracle.spec.ts` cobre estorno total de PIX e crédito após criação/captura e webhook terminal. `refund-idempotency.spec.ts` envia dois webhooks concorrentes para o mesmo pagamento e total, com o mesmo valor e IDs externos distintos, verificando um único estado terminal. O cliente SQS foi preparado para evidência read-only quando a URL da fila estiver configurada.

### Segurança

`refund-webhook-security.spec.ts` tenta um webhook com assinatura inválida. Se o ambiente rejeitar com `401`, `403` ou `422`, o teste confirma que o estado permaneceu inalterado. Se a validação ainda não estiver ativa, o teste registra uma anotação explícita de lacuna; isso evita mascarar um risco de segurança como falha funcional de Oracle.

## Execução

```bash
cd ms-payment-playwright-e2e
npm install
npm run typecheck
npm run infra:up:app
npm run doctor:env

TEST_ENV=local npx playwright test tests/contract/refund-oracle-contract.spec.ts
TEST_ENV=local npx playwright test tests/e2e/refund-oracle.spec.ts
TEST_ENV=local npx playwright test tests/resilience/refund-idempotency.spec.ts
TEST_ENV=local npx playwright test tests/security/refund-webhook-security.spec.ts
npm run test:local
npm run infra:down
```

Para HML, preencher as credenciais fora do repositório e executar a campanha serializada com `ORACLE_EVIDENCE_MODE=true` e `--workers=1`. Não usar `ALLOW_DESTRUCTIVE_TESTS=true` em produção.

## Limitações e decisões

O repositório compartilhado não contém o código-fonte do `ms-payment` nem uma instância Oracle. Por isso, a implementação valida API, webhook, estado e contrato localmente, mantendo a evidência de XML, Lambda, SQS real e EBS como etapa HML manual/integrada. Os nomes dos campos da fixture seguem o guia técnico e devem ser alinhados ao payload real do serviço caso o contrato do webhook seja alterado.

Não foi adicionado acesso direto ao banco de produção. A observação de fila é read-only e opcional, preservando segurança e reprodutibilidade.

## Análise da execução de 06/08/2026

A execução apresentou três grupos de evidência:

1. **Corrida de inicialização:** `infra:up:app` retornou o container como `Started`, mas o Spring ainda executava Flyway/JPA. O `doctor:env` consultava uma única vez e recebia `UND_ERR_SOCKET`; os testes seguintes falhavam com `socket hang up`/`ECONNRESET`. O doctor foi alterado para aguardar readiness por até 30 segundos.
2. **Defeitos da suíte/stub:** o fluxo tentava capturar PIX, não aguardava a submissão assíncrona do charge, usava um charge fixo (`charge-local-001`) entre testes e anunciava callback `localhost:8090` para uma aplicação dentro do Compose. Foram corrigidos: preparação por status, IDs de charge derivados do pedido, mapping de void e `WEBHOOK_CALLBACK_URL=http://webhook-mock:8080`.
3. **Limitação/erro do alvo:** após essas correções, houve execução em que o pagamento permaneceu `CREATED` sem `orchestrator_payment_id`, apesar da criação HTTP aceita. Nessa situação o webhook não consegue ser correlacionado. O diagnóstico requer correção/observabilidade no `ms-payment`/consumidor SQS e não foi alterado neste projeto, conforme escopo solicitado.

O `NonUniqueResultException` observado no `ms-payment` foi consequência direta da massa anterior reutilizar o mesmo ID de charge para vários pagamentos; o stub Playwright agora gera o ID a partir de `merchant_order_id`, reduzindo essa interferência. Se o erro reaparecer com IDs únicos, passa a ser defeito do alvo.

Na execução mais recente, readiness e contratos passaram, a regressão geral ficou em 11/15 testes e o `credit-split` falhou porque sua contagem global do request journal encontrou dois customers. Esse teste foi ajustado para contar somente requests que contêm o e-mail/token/order do pagamento corrente. Os três cenários de refund continuaram aceitando o webhook, mas não observaram `PAID` dentro do polling; como `authorized` é mapeado para `PAID` no contrato do alvo, a pendência está no processamento assíncrono do webhook/outbox/SQS do `ms-payment`, não na expectativa Playwright.

O aviso de uma vulnerabilidade alta no `npm install` é independente da falha funcional. Deve ser investigado com `npm audit` e atualização controlada do lockfile; não foi executado `npm audit fix` automaticamente para evitar alteração de versões fora do escopo.

## Rastreabilidade

| Regra | Cobertura |
|---|---|
| REF-001/002 | `tests/e2e/refund-oracle.spec.ts` |
| REF-003/004/007/008/009 | `tests/contract/refund-oracle-contract.spec.ts` |
| REF-011/012/013 | `tests/resilience/refund-idempotency.spec.ts` |
| REF-023 | `tests/security/refund-webhook-security.spec.ts` |

O relatório deixa explícita a fronteira entre o que foi automatizado no projeto Playwright e o que requer ambiente integrado com Oracle EBS, evitando considerar um `204` isolado como aceite da entrega.
