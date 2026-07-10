# Relatório técnico — correção da suíte Playwright local do `ms-payment`

**Data:** 10/07/2026  
**Projeto de testes:** `ms-payment-playwright-e2e`  
**Projeto fonte analisado:** `/home/fernandoavanzo/Projects/ultragaz/ms-payment`  
**Ambiente:** local, com MySQL, LocalStack, WireMock, webhook mock e aplicação via Docker Compose.

## 1. Resumo executivo

A execução local inicial tinha 9 testes Playwright, com 4 aprovados e 5 falhando. Todas as falhas reportadas pelo Playwright ocorreram porque a API `POST /payment/v1/payments` retornou `400`, enquanto os testes esperavam `200`, `201` ou `202`.

A análise do relatório HTML servido em `http://localhost:9323/`, dos traces do Playwright, dos DTOs do `ms-payment` e dos logs da aplicação mostrou dois grupos de problemas:

1. **Problemas no projeto Playwright:** payloads e mocks estavam desatualizados em relação ao contrato atual da API do `ms-payment`.
2. **Problema real no projeto fonte `ms-payment`:** o fluxo assíncrono de submissão para a Malga usava transações longas em torno de chamadas externas e auditoria `REQUIRES_NEW`, causando lock no MySQL e comportamento inadequado no retry de charge.

Após as correções, a suíte local foi validada com sucesso:

```text
npm run test:local
9 passed (3.1m)
```

## 2. Observação sobre o relatório Playwright

O comando abaixo falhou porque o projeto não está configurado para gerar o HTML report em `reports/html/local`:

```bash
npx playwright show-report reports/html/local
```

O `playwright.config.ts` define:

```ts
['html', { outputFolder: 'playwright-report', open: 'never' }]
```

Portanto, o comando correto é:

```bash
npx playwright show-report
```

Esse comando serviu o relatório em:

```text
http://localhost:9323/
```

## 3. Falhas iniciais observadas

Os testes que falharam inicialmente foram:

| Teste | Sintoma inicial | Classificação |
| --- | --- | --- |
| `tests/e2e/credit-split.spec.ts` | `POST /payments` retornou `400` | Principalmente projeto Playwright; também dependia de setup de split receiver |
| `tests/e2e/credit-without-split.spec.ts` | `POST /payments` retornou `400` | Projeto Playwright |
| `tests/e2e/pix-regression.spec.ts` | `POST /payments` retornou `400` | Projeto Playwright |
| `tests/resilience/retry.spec.ts` | `POST /payments` retornou `400`; depois expôs bug real de retry | Playwright + projeto fonte |
| `tests/security/sensitive-data.spec.ts` | `POST /payments` retornou `400` | Projeto Playwright |

Os traces indicaram os mesmos motivos principais para os `400`:

- `merchant_payment_id` excedia o limite atual de 20 caracteres;
- `fraud_analysis` estava ausente ou incompleto;
- `fraud_analysis.customer.billing_address` usava campos antigos, como `street_number` e `zipcode`, enquanto o contrato atual exige `number` e `zip_code`;
- o payload PIX removia `fraud_analysis`, mas o contrato atual exige análise antifraude também nesse fluxo;
- o payload com split usava o campo antigo `split_rules`, enquanto a API atual recebe `split_receivers`.

## 4. Análise por teste

### 4.1 `credit-split.spec.ts`

**Causa da falha inicial:** o payload do teste não respeitava mais o contrato atual da API. Além disso, o cenário com split pressupunha um seller externo direto (`seller_id`) e enviava `split_rules`, mas o fluxo atual do `ms-payment` espera `split_receivers`, resolve o recebedor pela base local e só então monta `splitRules` para a Malga.

**Tipo de problema:** projeto Playwright.

**Correções aplicadas:**

- criação de payload válido com `merchant_payment_id` curto;
- preenchimento completo de `fraud_analysis`;
- troca de `split_rules` por `split_receivers`;
- criação prévia do split receiver via `PUT /split-receivers`;
- inclusão de mocks WireMock para `POST /v1/sellers` e `PATCH /v1/sellers/{id}`;
- aumento do timeout de polling para aguardar o processamento assíncrono.

### 4.2 `credit-without-split.spec.ts`

**Causa da falha inicial:** payload de cartão inválido pelo contrato atual: identificador acima do limite e antifraude incompleto.

**Tipo de problema:** projeto Playwright.

**Correções aplicadas:**

- factory de pagamento atualizada para gerar payload válido;
- ajuste do timeout de polling para aguardar a chamada assíncrona de charge no WireMock.

### 4.3 `pix-regression.spec.ts`

**Causa da falha inicial:** a factory removia `fraud_analysis` para pagamentos PIX. O contrato atual do `ms-payment` exige antifraude também para PIX.

**Tipo de problema:** projeto Playwright.

**Correções aplicadas:**

- o payload PIX passou a manter `fraud_analysis`;
- o teste continua validando o comportamento esperado: PIX cria charge, mas não cria customer nem card na Malga.

### 4.4 `retry.spec.ts`

**Causa da falha inicial:** o payload também estava inválido, gerando `400`.

Após corrigir o contrato do payload, o teste expôs um problema real do backend: na falha temporária da charge, o fluxo podia manter transações longas abertas ao redor de chamadas externas, auditoria e persistência. Isso gerava lock no MySQL, principalmente quando a auditoria `REQUIRES_NEW` tentava registrar evento outbound com FK para `payments` enquanto a transação externa ainda segurava o registro do pagamento.

O log observado no diagnóstico incluía erro compatível com:

```text
Lock wait timeout exceeded
```

Também havia uma fragilidade importante: ao remover a transação longa, a marcação de mensagem processada precisava ocorrer somente após o sucesso do handler. Caso contrário, uma falha no handler poderia ser marcada como processada e impedir retry.

**Tipo de problema:** projeto fonte `ms-payment`, além do payload desatualizado no Playwright.

**Correções aplicadas no projeto fonte:**

- remoção de `@Transactional` de `ProcessMainQueueMessageService.execute`;
- remoção de `@Transactional` de `MalgaPaymentSubmissionService.submit`;
- alteração de `BaseProcessMessageService` para salvar `ProcessedMessage` somente depois de `handler.handle(envelope)` concluir com sucesso.

Com isso:

- cada persistência relevante do pagamento passa a concluir antes da próxima chamada externa;
- customer/card criados antes da falha da charge não são perdidos por rollback de uma transação externa longa;
- a mensagem só é marcada como processada após o fluxo concluir;
- o retry da charge não duplica customer/card.

O timeout do teste foi ampliado porque o retry depende do ciclo real de visibilidade/polling do SQS no LocalStack.

### 4.5 `sensitive-data.spec.ts`

**Causa da falha inicial:** payload inválido, como nos demais testes de criação de pagamento.

Depois da correção do payload, havia risco de vazamento de estado do cenário WireMock configurado pelo teste de retry anterior, pois a suíte roda com 1 worker, mas o WireMock mantém cenários entre testes.

**Tipo de problema:** projeto Playwright.

**Correções aplicadas:**

- reset do WireMock no início do teste de segurança;
- payload válido pela factory atualizada.

## 5. Correções no projeto Playwright

Arquivos alterados no `ms-payment-playwright-e2e`:

- `src/types/payment.ts`
  - atualização dos tipos de `Address`, `fraud_analysis` e split;
  - inclusão de `UpsertSplitReceiverPayload`.
- `src/fixtures/payment.factory.ts`
  - geração de `merchant_payment_id` com até 20 caracteres;
  - payload antifraude completo;
  - PIX mantendo `fraud_analysis`;
  - troca de `split_rules` por `split_receivers`;
  - factory para criação de split receiver.
- `src/clients/ms-payment.client.ts`
  - inclusão de `upsertSplitReceiver`.
- `docker/wiremock/mappings/02-card.json`
  - ajuste do campo mockado de `last4` para `last4digits`.
- `docker/wiremock/mappings/07-create-seller.json`
  - novo mock para criação de seller na Malga.
- `docker/wiremock/mappings/08-update-seller.json`
  - novo mock para atualização de seller na Malga.
- `tests/e2e/credit-split.spec.ts`
  - criação do split receiver antes do pagamento;
  - polling com timeout explícito.
- `tests/e2e/credit-without-split.spec.ts`
  - polling com timeout explícito.
- `tests/e2e/pix-regression.spec.ts`
  - polling com timeout explícito.
- `tests/resilience/retry.spec.ts`
  - timeout do teste ampliado para 180s;
  - polling do segundo envio de charge ampliado para 150s.
- `tests/security/sensitive-data.spec.ts`
  - reset do WireMock no início do teste.

## 6. Correções no projeto fonte `ms-payment`

Arquivos alterados no `ms-payment`:

- `src/main/java/br/com/ultragaz/messaging/application/service/BaseProcessMessageService.java`
  - `ProcessedMessage` passou a ser salvo depois da execução bem-sucedida do handler;
  - colisão por processamento concorrente é ignorada após o sucesso do handler.
- `src/main/java/br/com/ultragaz/messaging/application/service/ProcessMainQueueMessageService.java`
  - removida transação externa do processamento da main queue.
- `src/main/java/br/com/ultragaz/payment/orchestration/malga/application/MalgaPaymentSubmissionService.java`
  - removida transação longa ao redor da submissão para a Malga.

## 7. Validações executadas

### Backend `ms-payment`

```bash
mvn -q package
```

Resultado: sucesso.

### Projeto Playwright

```bash
npm run typecheck
```

Resultado: sucesso.

```bash
npm run infra:down
npm run infra:up
npm run infra:up:app
npm run doctor:env
```

Resultado do `doctor:env`:

```text
Ambiente: local
OK ms-payment: 200 http://localhost:8001/payment/v1/actuator/health
OK WireMock: 200 http://localhost:8089/__admin/mappings
OK Webhook mock: 200 http://localhost:8090/health
```

```bash
npm run test:local
```

Resultado:

```text
Running 9 tests using 1 worker
9 passed (3.1m)
```

## 8. Conclusão

As cinco falhas iniciais não tinham a mesma causa raiz.

A maior parte era causada pelo projeto Playwright, que estava gerando payloads e mocks incompatíveis com o contrato atual do `ms-payment`. Esses problemas foram corrigidos nas factories, tipos, mocks WireMock e setup dos testes.

O teste de retry, depois de receber um payload válido, revelou um problema real no projeto fonte: fronteira transacional inadequada no fluxo assíncrono de submissão para a Malga. A correção removeu transações longas ao redor de chamadas externas e passou a registrar mensagem processada somente após sucesso do handler.

Estado final validado:

- backend compila;
- ambiente local sobe saudável;
- suíte Playwright local passa com 9/9 testes;
- retry de charge não duplica customer/card;
- relatório HTML continua disponível no diretório configurado `playwright-report`.
