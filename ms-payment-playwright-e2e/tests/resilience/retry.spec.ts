import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment } from '../../src/fixtures/payment.factory';

test.setTimeout(180_000);

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
  const response = await new MsPaymentClient(request).createPayment(creditPayment());
  expect([200, 201, 202]).toContain(response.status());
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.length, { timeout: 150_000 }).toBeGreaterThanOrEqual(2);
  expect((await malga.requests('POST', '/v1/customers')).requests).toHaveLength(1);
  expect((await malga.requests('POST', '/v1/cards')).requests).toHaveLength(1);
});
