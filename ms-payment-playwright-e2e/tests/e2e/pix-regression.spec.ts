import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { pixPayment } from '../../src/fixtures/payment.factory';

test('@P1 @local @e2e @regression PIX não cria customer/card', async ({ request }) => {
  const malga = new WireMockClient(request); await malga.reset();
  const response = await new MsPaymentClient(request).createPayment(pixPayment());
  expect([200, 201, 202]).toContain(response.status());
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.length, { timeout: 40_000 }).toBe(1);
  expect((await malga.requests('POST', '/v1/customers')).requests).toHaveLength(0);
  expect((await malga.requests('POST', '/v1/cards')).requests).toHaveLength(0);
});
