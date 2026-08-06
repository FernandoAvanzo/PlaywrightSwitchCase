# Guia técnico de testes BDD e E2E — descida de estornos do `ms-payment` ao Oracle EBS

**Data:** 06/08/2026  
**Projetos:** `ms-payment` e `ms-payment-playwright-e2e`  
**Escopo funcional:** estorno total de pagamentos `PIX` e `CREDIT_CARD` do merchant `HUB`  
**Objetivo:** comprovar que um estorno total confirmado pela Malga é persistido pelo `ms-payment`, gera uma única mensagem de conciliação com o contrato legado aprovado e chega ao Oracle EBS sem duplicidade.

## 1. Resumo executivo

O aceite da mudança não pode se limitar à resposta `204` do endpoint `POST /payments/{paymentId}/void`. Esse retorno comprova apenas que o pedido de estorno foi aceito/processado pelo `ms-payment`. A entrega só estará validada quando houver evidência encadeada de que:

1. o pagamento do merchant `HUB` chegou ao estado terminal `REFUNDED`;
2. o valor estornado corresponde ao valor total elegível;
3. o `ms-payment` criou um único evento de conciliação;
4. o JSON preservou o envelope legado `json.row.order_paid`, `type=order.paid`, `order_status=C`, `order_status_descr=Cancelado`, incluiu `order_cancel_date` e omitiu `order_delivery_date`;
5. a transação de PIX ou cartão foi representada como refund/cancelamento financeiro;
6. a Lambda transformou a mensagem em XML e o Oracle EBS processou o cancelamento do pedido correto;
7. reenvio do webhook e retentativas não criaram um segundo lançamento.

O código Java atual já implementa os builders de estorno de PIX e cartão, restringe a publicação a `REFUNDED` total do `HUB` e usa uma chave determinística baseada no pagamento e no valor estornado. O projeto Playwright atual, entretanto, cobre criação, split, contrato e resiliência de charge; ainda precisa de cliente de `void`, fixture de webhook, consulta a LocalStack/outbox e novos specs de estorno.

## 2. Fontes, método e precedência

### 2.1 Fontes corporativas

- [Tarefa de implementação do estorno no Oracle EBS](https://app.notion.com/p/39fb3def3e7c80ca8cf0d9d4d1c0217d).
- [Tarefa do caso Playwright](https://app.notion.com/p/3b4b3def3e7c80d0a662f7e68497d115).
- [Refinamento do fluxo de estorno](https://app.notion.com/p/3abb3def3e7c80e79f18d46f922e55e0).
- [Alinhamento de estorno no Oracle EBS](https://app.notion.com/p/39cb3def3e7c80138dcdd6d8dda6ee19).
- [Pasta `ms-payment`](https://drive.google.com/drive/folders/1wtmV7HWboGM_6XerDMJOKI2CObTMX-Y6), incluindo README, Swagger, manuais, relatórios e árvore `src`.
- [Pasta `ms-payment-playwright-e2e`](https://drive.google.com/drive/folders/1yIiUi-J9vwMw7YBnHAYEFM6-DzNZbK9Z), incluindo README, configuração, clientes, fixtures e testes.
- Discussão “Daily Squad Meios de Pagamento” no Teams, de 16/07/2026, que registra a lacuna de envio contábil e a necessidade de validar valor, parcialidade e estados de estorno.
- Anexo `Playright-Github-Repository.txt`, que aponta para o repositório `FernandoAvanzo/PlaywrightSwitchCase`.

### 2.2 Referências públicas primárias

- O Playwright suporta teste direto de APIs REST por `APIRequestContext`, adequado para preparar estado e verificar pós-condições no servidor: [Playwright — API testing](https://playwright.dev/docs/api-testing).
- A Malga documenta estorno total e parcial de cobranças aprovadas e o valor de refund: [Malga — Estornar cobrança](https://docs.malga.io/sdks/api-sdks/docs/charges/refund-charge).
- A assinatura do webhook usa os dados do evento e os headers de assinatura/data: [Malga — Verificar assinatura do evento](https://docs.malga.io/sdks/api-sdks/docs/webhooks/verify-event).
- A deduplicação nativa da fila SQS FIFO tem janela de cinco minutos; por isso o teste deve verificar também a idempotência persistida da aplicação: [AWS — MessageDeduplicationId](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html).
- `Scenario Outline` deve ser usado para repetir a mesma regra com dados diferentes, preservando exemplos curtos e expressivos: [Cucumber — Gherkin Reference](https://cucumber.io/docs/gherkin/reference/).

### 2.3 Precedência adotada

Quando documentos históricos divergem do código, este guia adota:

1. decisão funcional mais recente registrada no refinamento e nas conversas corporativas;
2. código-fonte mais recente no Google Drive, modificado em 05–06/08/2026;
3. Swagger e manual público para os contratos HTTP;
4. relatórios antigos apenas como histórico.

Isso evita repetir uma conclusão já superada: os builders de estorno não são mais placeholders.

## 3. Estado atual comprovado no código

| Componente | Comportamento atual relevante | Implicação para os testes |
|---|---|---|
| `RefundPixReconciliationStartPayloadBuilder` | Reutiliza o payload da venda, cria transação `refund`, status `refunded`, `success=true` e valor estornado. | Validar campos do PIX e preservação da correlação original. |
| `RefundCreditCardReconciliationStartPayloadBuilder` | Reutiliza a venda, usa `transaction_type=refund`, `operation_type=cancel`, status `refunded` e dados da adquirente/cartão original. | Validar cancelamento sem vazar PAN/CVV e sem perder NSU/TID/autorização. |
| `StartReconciliationQueuePayload` | Mantém o envelope `json.row.order_paid`; `Account` contém `order_cancel_date`. | Um teste que espera `order_refunded` está incorreto para esta entrega. |
| `ReconciliationStartPayloadFactory` | Mapeia somente `REFUNDED` para `REFUND`; `PAID/AUTHORIZED` continuam como pagamento. | `PARTIALLY_REFUNDED` não deve montar evento Oracle. |
| `ReconciliationStartService.shouldStart` | Exige merchant `HUB`; aceita `PAID`, `AUTHORIZED` e `REFUNDED`; para refund exige igualdade entre `refundedAmount` e valor capturado/total. | Cobrir HUB, não-HUB, total, parcial, pendente e cancelamento pré-captura. |
| `ReconciliationStartService.buildMessageKey` | Para refund usa `RECONCILIATION_REQUESTED:{paymentId}:REFUND:{refundedAmount}`. | Repetição do mesmo estorno deve resultar em um único outbox. |
| `MalgaWebhookProcessingService` | Persiste o estado mapeado e chama `startIfNeeded`; depois solicita notificação ao cliente. | O webhook terminal é o gatilho observável para a descida. |
| Endpoint público | `POST /payment/v1/payments/{paymentId}/void`, body `{ "amount": <minorUnits> }`, sucesso `204`. | Validar valores em centavos e estados permitidos. |
| Endpoint de webhook | `POST /payment/v1/webhooks/malga`, com `X-Idempotency-Key`, `X-Plug-Date` e `X-Plug-Signature`. | Fixtures devem variar ID, status e `transactionRequests`. |
| Suíte Java | A tarefa registra `mvn test`: 282 testes, sem falhas ou erros. | É baseline; não substitui E2E integrado. |

## 4. Regras de negócio testáveis

| ID | Regra | Evidência de aprovação |
|---|---|---|
| RN-01 | Somente pagamentos do merchant `HUB` descem ao Oracle por este fluxo. | Evento ausente para outro merchant. |
| RN-02 | Nesta entrega, somente estorno total confirmado gera lançamento Oracle. | `REFUNDED` total gera uma mensagem; parcial e pendente geram zero. |
| RN-03 | PIX e cartão de crédito são os meios suportados. | Um payload válido por meio; outro meio é rejeitado/não roteado. |
| RN-04 | O contrato de estorno reutiliza `order_paid` e `order.paid`. | JSON e XML mantêm esses nomes. |
| RN-05 | Cancelamento contábil usa `C`, `Cancelado` e `order_cancel_date`. | Campos presentes e data coerente com a atualização terminal. |
| RN-06 | `order_delivery_date` não deve constar no payload de estorno. | Campo ausente no JSON serializado e no XML. |
| RN-07 | A mensagem de refund é idempotente por pagamento e valor total estornado. | Um único outbox/lote Oracle após replay e concorrência. |
| RN-08 | Cancelamento pré-captura (`CANCELLED`) não é refund pós-captura. | Nenhum lançamento contábil de estorno. |
| RN-09 | O valor estornado nunca supera o capturado/disponível. | Erro sem alteração de estado/outbox. |
| RN-10 | A venda original continua descendo normalmente. | Pagamento e estorno formam dois eventos distintos, nessa ordem. |

## 5. Estratégia e pirâmide de testes

### 5.1 Camada A — componente/local

Executar `ms-payment`, MySQL, LocalStack, WireMock e receptor de webhook via Docker Compose. Malga e dependências externas ficam mockadas. A suíte deve:

- chamar a API pública de pagamento, captura e void;
- publicar webhooks Malga controlados;
- consultar o pagamento até o estado esperado;
- inspecionar o outbox no MySQL e/ou a mensagem na fila `payment-events.fifo` do LocalStack;
- validar o corpo JSON antes da transformação para XML;
- executar casos negativos e de concorrência de modo repetível.

Essa camada é o principal gate de regressão em pull request.

### 5.2 Camada B — HML integrada

Usar Malga/Pagar.me de homologação, SQS real, `lmb-payment-reconciliation-out`, endpoint Oracle de conciliação e consulta read-only ao EBS/tabela intermediária. Essa camada deve comprovar:

- ordem venda → estorno;
- transformação JSON → XML;
- aceitação e processamento no Oracle;
- ausência de lançamento duplicado;
- retorno/callback da conciliação;
- rastreabilidade por `paymentId`, `merchant_order_id`, chave de mensagem e identificador Oracle.

### 5.3 Fora do escopo desta entrega

- Estorno parcial contabilizado no Oracle: deve ser testado como **não publicação**.
- Cartão de débito, chargeback, `revert_void` e sumarização diária: manter como cenários futuros até aprovação funcional.
- Testes destrutivos em produção: bloqueados; apenas `@prod-safe` para saúde e contrato não mutável.

## 6. Preparação do `ms-payment-playwright-e2e`

### 6.1 Extensões propostas

```text
src/
  clients/
    ms-payment.client.ts        # adicionar void() e postMalgaWebhook()
    outbox.client.ts            # consulta read-only ao MySQL ou endpoint de teste
    sqs.client.ts               # leitura controlada do LocalStack
  fixtures/
    refund.factory.ts           # webhooks voided/refund_pending/canceled
  helpers/
    reconciliation.assertions.ts
tests/
  contract/refund-oracle-contract.spec.ts
  e2e/refund-oracle-pix.spec.ts
  e2e/refund-oracle-credit.spec.ts
  resilience/refund-idempotency.spec.ts
  security/refund-webhook-security.spec.ts
```

Métodos mínimos do cliente:

```ts
async void(paymentId: string, amount: number, key?: string) {
  return this.request.post(`payments/${paymentId}/void`, {
    data: { amount },
    headers: { ...env.authHeaders, ...(key ? { 'X-Idempotency-Key': key } : {}) }
  });
}

async postMalgaWebhook(payload: unknown, headers: Record<string, string>) {
  return this.request.post('webhooks/malga', { data: payload, headers });
}
```

Não colocar senhas do banco, tokens Malga ou chaves Oracle em fixtures ou commits. Usar variáveis de ambiente e massa anonimizada.

### 6.2 Variáveis adicionais sugeridas

```dotenv
PAYMENT_EVENTS_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/payment-events.fifo
MYSQL_READONLY_URL=mysql://readonly:***@localhost:3306/ms_payment
MALGA_WEBHOOK_PUBLIC_KEY=
ORACLE_EVIDENCE_MODE=false
ALLOW_DESTRUCTIVE_TESTS=false
```

Em HML, `ORACLE_EVIDENCE_MODE=true` deve habilitar somente os specs integrados explicitamente marcados. Em produção, nunca habilitar `ALLOW_DESTRUCTIVE_TESTS`.

## 7. Matriz de cobertura BDD/E2E

| ID | Cenário | Camada | Prioridade | Resultado esperado |
|---|---|---|---|---|
| REF-001 | Estorno total PIX do HUB | Local + HML | P0 | `REFUNDED`, uma mensagem e cancelamento no EBS. |
| REF-002 | Estorno total crédito do HUB | Local + HML | P0 | Mesmo fluxo, preservando dados de adquirente permitidos. |
| REF-003 | Contrato JSON PIX | Local | P0 | `order_paid/order.paid`, `C/Cancelado`, cancel date, sem delivery date. |
| REF-004 | Contrato JSON crédito | Local | P0 | Campos comuns e `transaction_type=refund`, `operation_type=cancel`. |
| REF-005 | Transformação XML PIX | HML/integração | P0 | XML equivalente ao JSON aprovado e bem-formado. |
| REF-006 | Transformação XML crédito | HML/integração | P0 | XML aceito pelo Oracle, sem dados proibidos. |
| REF-007 | Estorno parcial | Local + HML | P0 | `PARTIALLY_REFUNDED`, zero evento Oracle. |
| REF-008 | `refund_pending` | Local | P0 | Estado intermediário, zero evento Oracle. |
| REF-009 | Cancelamento pré-captura | Local | P0 | `CANCELLED`, zero refund Oracle. |
| REF-010 | Merchant diferente de HUB | Local | P0 | Estorno no provedor permitido conforme regra, zero descida Oracle. |
| REF-011 | Replay do mesmo webhook | Local + HML | P0 | Um outbox e um efeito Oracle. |
| REF-012 | Webhooks duplicados com IDs diferentes para o mesmo total | Local | P0 | Chave de negócio impede segundo outbox. |
| REF-013 | Concorrência de dois webhooks terminais | Local | P0 | Um evento; nenhuma falha não tratada. |
| REF-014 | Venda antes do estorno | Local + HML | P0 | Ordem preservada no mesmo agregado/grupo. |
| REF-015 | Valor maior que saldo | Local | P0 | `400/422`, estado e outbox inalterados. |
| REF-016 | Valor zero/negativo | Local | P1 | Rejeição sem chamada Malga nem evento. |
| REF-017 | Pagamento inexistente | Local | P1 | `404`, sem side effects. |
| REF-018 | Método não suportado | Local | P1 | Rejeição/não roteamento e erro rastreável. |
| REF-019 | Falha transitória ao salvar/publicar | Local | P0 | Rollback ou retry controlado; sem perda/duplicidade. |
| REF-020 | Indisponibilidade Oracle | HML/integração | P0 | Retentativa/DLQ conforme política e contabilização única. |
| REF-021 | Callback Oracle de sucesso | HML | P0 | Conciliação correlacionada ao pagamento correto. |
| REF-022 | Callback Oracle de erro | HML | P1 | Estado `ERROR`, mensagem rastreável e reprocessável. |
| REF-023 | Assinatura de webhook inválida | Local/HML | P1 — hardening | Rejeição se a validação estiver habilitada; caso contrário, lacuna de segurança formalmente registrada. |
| REF-024 | Replay temporal/assinatura expirada | Local/HML | P2 — hardening | Rejeição conforme política de segurança aprovada ou registro explícito da ausência dessa proteção. |
| REF-025 | Segurança de dados | Local | P0 | Sem PAN, CVV, credenciais ou payload sensível em logs/relatórios. |
| REF-026 | Regressão da venda normal | Local | P0 | `PAID/AUTHORIZED` continua gerando `order_paid` não cancelado. |

## 8. Especificação BDD em Gherkin

### 8.1 Estorno total por meio de pagamento

```gherkin
# language: pt
Funcionalidade: Descida de estorno total ao Oracle EBS
  Como área financeira
  Quero que estornos totais confirmados sejam enviados ao Oracle
  Para manter a venda e o cancelamento contabilmente consistentes

  Esquema do Cenário: Estorno total confirmado do HUB
    Dado um pagamento do merchant "HUB" no método "<metodo>" em estado "PAID"
    E o valor capturado é <valor> centavos
    Quando a Malga confirmar o estorno total de <valor> centavos
    Então o pagamento deve ficar em "REFUNDED"
    E deve existir exatamente uma mensagem de conciliação de estorno
    E o contrato deve identificar o pedido como "C" e "Cancelado"
    E o Oracle EBS deve processar um único cancelamento para o pedido

    Exemplos:
      | metodo      | valor |
      | PIX         | 2000  |
      | CREDIT_CARD | 2000  |
```

### 8.2 Contrato legado do Oracle

```gherkin
Funcionalidade: Contrato de cancelamento enviado ao Oracle

  Cenário: Payload de estorno mantém o envelope homologado
    Dado um estorno total confirmado
    Quando o evento de conciliação for serializado
    Então deve existir "json.row.order_paid"
    E o campo "type" deve ser "order.paid"
    E "order_status" deve ser "C"
    E "order_status_descr" deve ser "Cancelado"
    E "order_cancel_date" deve estar preenchido
    E "order_delivery_date" não deve existir
```

### 8.3 Estornos não terminais ou não elegíveis

```gherkin
Funcionalidade: Bloqueio de descida indevida

  Esquema do Cenário: Estado não elegível não gera lançamento Oracle
    Dado um pagamento do HUB com valor capturado de 2000 centavos
    Quando o pagamento chegar ao estado "<status>" com valor estornado <estornado>
    Então nenhuma mensagem de estorno deve ser criada para o Oracle

    Exemplos:
      | status               | estornado |
      | REFUND_PENDING       | 0         |
      | PARTIALLY_REFUNDED   | 500       |
      | CANCELLED            | 0         |
```

### 8.4 Restrição por origem

```gherkin
Funcionalidade: Elegibilidade por merchant

  Cenário: Estorno total fora do HUB não desce por este fluxo
    Dado um pagamento do merchant "B2B" em estado "PAID"
    Quando a Malga confirmar seu estorno total
    Então o estado financeiro deve refletir a resposta do provedor
    Mas nenhuma mensagem de estorno deve ser criada para o Oracle
```

### 8.5 Idempotência

```gherkin
Funcionalidade: Idempotência da descida de estorno

  Cenário: Repetição do webhook terminal
    Dado que o estorno total já gerou a chave de conciliação do pagamento
    Quando o mesmo webhook for recebido novamente
    Então a API deve responder de forma idempotente
    E deve continuar existindo um único evento no outbox
    E o Oracle deve manter um único lançamento de cancelamento

  Cenário: Dois eventos terminais concorrentes para o mesmo total
    Dado um pagamento totalmente estornado
    Quando dois webhooks com IDs diferentes forem processados simultaneamente
    Então a chave de negócio do refund deve ser a mesma
    E apenas uma gravação de outbox deve vencer
```

### 8.6 Validação econômica

```gherkin
Funcionalidade: Limites do estorno

  Esquema do Cenário: Valor inválido é rejeitado sem efeito colateral
    Dado um pagamento capturado em 2000 centavos
    Quando for solicitado estorno de <valor> centavos
    Então a API deve rejeitar a operação
    E o valor estornado deve permanecer inalterado
    E nenhuma mensagem Oracle deve ser criada

    Exemplos:
      | valor |
      | 0     |
      | -1    |
      | 2001  |
```

### 8.7 Ordem e resiliência

```gherkin
Funcionalidade: Ordem entre venda e estorno

  Cenário: Estorno não ultrapassa a venda na fila
    Dado que a mensagem de venda foi criada antes do estorno
    Quando a entrega da venda falhar temporariamente
    Então o consumidor não deve efetivar o estorno antes da venda
    E ambas as mensagens devem ser reprocessadas na ordem correta
```

### 8.8 Segurança do webhook

```gherkin
Funcionalidade: Autenticidade do webhook Malga

  Esquema do Cenário: Webhook não confiável é rejeitado
    Dado um payload terminal de estorno
    Quando ele for enviado com "<condicao>"
    Então a requisição deve ser rejeitada
    E o pagamento não deve ser alterado
    E nenhum evento Oracle deve ser criado

    Exemplos:
      | condicao             |
      | assinatura inválida  |
      | data expirada        |
      | corpo adulterado     |
```

Os headers aparecem no contrato atual, mas a inspeção realizada não comprovou uma validação criptográfica ativa no fluxo desta entrega. Portanto, REF-023/024 são testes de hardening: uma falha deve abrir risco de segurança, porém não deve ser confundida com regressão específica da descida de estorno sem que essa proteção esteja definida no critério funcional.

## 9. Casos manuais prioritários

### CT-P0-01 — Estorno total PIX ponta a ponta

**Pré-condições:** ambiente HML saudável; webhook Malga de void habilitado; merchant HUB; acesso a logs, fila, Lambda e evidência Oracle; massa sem dados pessoais reais.

1. Criar um PIX de 2.000 centavos com `reconciliation_data` válida.
2. Aguardar `PAID` por webhook e confirmar por `GET /payments/{id}`.
3. Registrar `paymentId`, `merchant_order_id`, charge Malga e mensagem/XML da venda.
4. Executar `POST /payments/{paymentId}/void` com `{ "amount": 2000 }`.
5. Confirmar HTTP `204`.
6. Aguardar o webhook terminal Malga e o estado `REFUNDED`.
7. Localizar a mensagem `RECONCILIATION_REQUESTED:{paymentId}:REFUND:2000`.
8. Validar o JSON conforme RN-04 a RN-06 e a transação PIX como refund.
9. Capturar o XML gerado pela Lambda e confirmar que é bem-formado.
10. Consultar o Oracle/tabela intermediária e confirmar um único cancelamento do pedido.
11. Reenviar o mesmo webhook e repetir a consulta.

**Aprovação:** uma venda e um cancelamento, na ordem, sem segunda mensagem ou lançamento após replay.

### CT-P0-02 — Estorno total de cartão de crédito

1. Criar crédito de 2.000 centavos, aguardar `PRE_AUTHORIZED` e capturar integralmente.
2. Confirmar `PAID` e a primeira descida Oracle.
3. Solicitar void total de 2.000 centavos.
4. Confirmar `REFUNDED`, uma única mensagem de refund e XML cancelado.
5. Validar `transaction_type=refund`, `operation_type=cancel`, NSU/TID/autorização quando disponíveis e ausência de PAN/CVV.
6. Confirmar cancelamento único no EBS.

**Aprovação:** o cancelamento referencia a venda original e não expõe dados sensíveis.

### CT-P0-03 — Estorno parcial não desce

1. Preparar pagamento HUB `PAID` de 2.000 centavos.
2. Solicitar void de 500 centavos.
3. Aguardar `PARTIALLY_REFUNDED` ou `REFUND_PENDING` seguido de parcial.
4. Consultar outbox/fila e Oracle durante janela superior ao polling/retry normal.

**Aprovação:** valor/status financeiro atualizados, mas nenhuma mensagem/lançamento Oracle de estorno.

### CT-P0-04 — Idempotência e concorrência

1. Obter o webhook terminal usado em CT-P0-01 ou CT-P0-02.
2. Enviá-lo duas vezes sequencialmente com o mesmo `X-Idempotency-Key`.
3. Repetir com IDs externos distintos, mantendo pagamento e total estornado.
4. Disparar duas requisições simultâneas para a última variante.
5. Contar registros de outbox pela chave determinística e lançamentos Oracle pelo pedido.

**Aprovação:** exatamente um evento e um efeito contábil; duplicidade tratada sem erro 5xx persistente.

### CT-P0-05 — Falha do Oracle e reprocessamento

1. Interromper/mockar o endpoint Oracle antes de consumir a mensagem de refund.
2. Executar estorno total.
3. Confirmar que a mensagem permanece reprocessável ou segue à DLQ conforme a política.
4. Restaurar o endpoint e reprocessar.
5. Consultar EBS e callback.

**Aprovação:** contabilização única após recuperação, com rastreabilidade do erro e sem estorno antes da venda.

## 10. Execução automatizada e manual

### 10.1 Baseline do Java

Na raiz de `ms-payment`:

```bash
mvn test
```

Critério: nenhuma regressão em relação ao baseline registrado de 282 testes; revisar a contagem se novos testes forem adicionados.

### 10.2 Ambiente local Playwright

Na raiz de `ms-payment-playwright-e2e`:

```bash
npm install
npx playwright install --with-deps
cp .env.local.example .env.local
npm run infra:up:app
npm run doctor:env
npm run typecheck
```

Executar somente o pacote de estorno:

```bash
TEST_ENV=local npx playwright test tests/contract/refund-oracle-contract.spec.ts
TEST_ENV=local npx playwright test tests/e2e/refund-oracle-pix.spec.ts
TEST_ENV=local npx playwright test tests/e2e/refund-oracle-credit.spec.ts
TEST_ENV=local npx playwright test tests/resilience/refund-idempotency.spec.ts
TEST_ENV=local npx playwright test tests/security/refund-webhook-security.spec.ts
```

Executar toda a regressão e abrir o relatório:

```bash
npm run test:local
npm run report
npm run infra:down
```

### 10.3 HML

```bash
cp .env.hml.example .env.hml
# preencher apenas por canal seguro
TEST_ENV=hml npm run doctor:env
TEST_ENV=hml ORACLE_EVIDENCE_MODE=true npx playwright test --grep "@hml.*@refund-oracle"
```

Não executar em paralelo cenários que compartilham pedido, charge, fila ou massa Oracle. Usar identificadores únicos por teste e execução serial para a campanha EBS:

```bash
TEST_ENV=hml ORACLE_EVIDENCE_MODE=true npx playwright test --grep "@refund-oracle" --workers=1
```

## 11. Oráculos e evidências obrigatórias

| Ponto | Evidência mínima | Regra de correlação |
|---|---|---|
| API | request/response de criação, captura e void | `paymentId` e `merchant_order_id`. |
| Estado canônico | snapshots do `GET` antes/depois | mesmo `paymentId`; valor capturado e estornado. |
| Webhook Malga | ID, evento, data e charge | sem segredo/assinatura integral no relatório. |
| Outbox | `messageKey`, tipo, status e timestamp | `paymentId` + `REFUND` + valor total. |
| SQS | message group/dedup ID e body | mesmo agregado, ordem venda → estorno. |
| Lambda | request ID, resultado e XML anonimizado | ID da mensagem e pedido. |
| Oracle/EBS | registro/tela/query read-only | pedido e status cancelado; contagem igual a 1. |
| Callback | sucesso/erro e timestamp | pagamento/conciliação correta. |

Anexar ao ticket:

- relatório HTML do Playwright;
- JSON e XML sanitizados;
- consulta de contagem do outbox e do Oracle;
- timeline com timestamps de venda, webhook, outbox, Lambda e EBS;
- logs filtrados pelos IDs de correlação, sem credenciais e dados pessoais.

## 12. Critérios de aceite e decisão de go/no-go

### Go

- REF-001 a REF-016, REF-019 a REF-021, REF-025 e REF-026 aprovados.
- PIX e cartão de crédito homologados separadamente.
- Contrato JSON/XML aprovado pelo Oracle sem divergência de envelope ou datas.
- Uma única contabilização após replay, concorrência e recuperação de falha.
- Venda sempre observada antes do cancelamento.
- Nenhuma evidência contém credencial, PAN, CVV ou dado pessoal não anonimizado.

### No-go

- `PARTIALLY_REFUNDED`, `REFUND_PENDING` ou `CANCELLED` geram estorno Oracle.
- O payload usa `order_refunded`, `order.refunded` ou mantém `order_delivery_date` sem nova aprovação formal.
- O valor enviado é parcial/acumulado incorreto ou supera o capturado.
- Mais de um outbox/lançamento é criado para o mesmo estorno total.
- O Oracle recebe cancelamento antes da venda.
- HTTP `204` é a única evidência disponível, sem confirmação de fila, XML e EBS.

## 13. Riscos e lacunas remanescentes

| Risco | Severidade | Mitigação no teste |
|---|---|---|
| Chave de refund baseada no total, não em ID próprio da operação | Alta | Replay com IDs diferentes e concorrência; manter parcial fora do Oracle. |
| Um único `ReconciliationResult` no agregado | Alta | Validar que refund não sobrescreve evidência necessária da venda/callback. |
| Fila FIFO deduplica apenas por janela limitada | Alta | Provar unicidade no outbox e no Oracle, não apenas no SQS. |
| Dependência de `updatedAt` como `order_cancel_date` | Média | Comparar com timestamp do webhook terminal e obter aceite EBS. |
| `transactionRequests` pode conter autorização, captura e void | Alta | Fixture com múltiplos itens e assertiva de seleção da transação de refund. |
| Ambiente local não contém Oracle real | Esperada | Usar local como gate determinístico e HML como aceite final. |

## 14. Glossário

| Termo | Significado | Explicação |
|---|---|---|
| BDD | Behavior-Driven Development | Especifica regras por exemplos legíveis em Dado/Quando/Então. |
| E2E | End-to-End | Validação do fluxo completo entre API, mensageria, Lambda e Oracle. |
| EBS | Oracle E-Business Suite | ERP que recebe e processa venda e cancelamento. |
| HML | Homologação | Ambiente integrado usado para comprovar o contrato real. |
| Outbox | Transactional Outbox | Registro persistido que permite publicar eventos de forma recuperável. |
| FIFO | First In, First Out | Fila com ordenação por grupo; necessária para venda antes do estorno. |
| DLQ | Dead-Letter Queue | Fila que retém mensagens após falhas repetidas. |
| Idempotência | Repetição sem novo efeito | Impede duplicar o estorno quando há replay ou retry. |
| Void | Cancelamento/estorno no provedor | Pode representar cancelamento pré-captura ou refund pós-captura. |
| PAN | Primary Account Number | Número completo do cartão, que não deve aparecer em respostas ou evidências. |

## 15. Conclusão

A cobertura adequada exige provar o comportamento em quatro fronteiras: domínio financeiro, contrato do evento, mensageria idempotente e efeito no Oracle. A recomendação é implementar primeiro os specs locais REF-001 a REF-019 e REF-023 a REF-026, executá-los como gate de pull request, e usar a campanha HML serializada para fechar REF-005, REF-006 e REF-020 a REF-022.

O critério central é objetivo: **um estorno total confirmado de PIX ou cartão do HUB deve gerar exatamente um cancelamento no Oracle, com o contrato legado aprovado; qualquer estado parcial, pendente, pré-captura ou origem não-HUB deve gerar zero lançamentos de estorno.**
