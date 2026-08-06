import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment } from '../../src/fixtures/payment.factory';

test.setTimeout(180_000);

/**
 * Evita duplicidade de entidades financeiras quando a criação da cobrança exige retentativa.
 *
 * Objetivo do teste: validar que uma falha transitória na primeira chamada de charge seja
 * recuperada sem recriar cliente ou cartão já confirmados no provedor.
 *
 * Regras de negócio e cobertura:
 * - A primeira tentativa de cobrança pode falhar com HTTP 500 e a seguinte concluir com HTTP 201.
 * - O mecanismo de retry deve realizar ao menos duas chamadas de charge.
 * - Cliente e cartão devem ser criados exatamente uma vez durante toda a operação.
 * - A resposta pública do pagamento deve permanecer aceita após a recuperação.
 */
test('@P0 @local @resilience retry de charge não duplica customer/card', async ({ request }) => {
  const malga = new WireMockClient(request); await malga.reset();
  await malga.setScenario({
    scenarioName: 'charge-retry', requiredScenarioState: 'Started', newScenarioState: 'failed-once',
    request: { method: 'POST', urlPath: '/v1/charges' },
    response: { status: 500, jsonBody: { message: 'temporary failure' }, headers: { 'Content-Type': 'application/json' } },
    priority: 1
  });
  await malga.setScenario({
    scenarioName: 'charge-retry', requiredScenarioState: 'failed-once',
    request: { method: 'POST', urlPath: '/v1/charges' },
    response: { status: 201, jsonBody: { id: 'charge-retried', status: 'pre_authorized', amount: 2000 }, headers: { 'Content-Type': 'application/json' } },
    priority: 1
  });
  const payload = creditPayment();
  const response = await new MsPaymentClient(request).createPayment(payload);
  expect([200, 201, 202]).toContain(response.status());
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.length, { timeout: 150_000 }).toBeGreaterThanOrEqual(2);
  const customerRequests = (await malga.requests('POST', '/v1/customers')).requests
    .filter(request => request.body?.includes(payload.customer.email));
  const cardRequests = (await malga.requests('POST', '/v1/cards')).requests
    .filter(request => request.body?.includes(payload.card_details?.card_token ?? ''));
  expect(customerRequests).toHaveLength(1);
  expect(cardRequests).toHaveLength(1);
});
