import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment } from '../../src/fixtures/payment.factory';
import { parseBodies } from '../../src/helpers/json';

test('@P0 @local @e2e crédito sem split não envia splitRules', async ({ request }) => {
  const malga = new WireMockClient(request); await malga.reset();
  const response = await new MsPaymentClient(request).createPayment(creditPayment());
  expect([200, 201, 202]).toContain(response.status());
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.length, { timeout: 40_000 }).toBe(1);
  const bodies = parseBodies((await malga.requests('POST', '/v1/charges')).requests) as any[];
  expect(bodies[0].splitRules).toBeUndefined();
});
