import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPaymentWithSplit } from '../../src/fixtures/payment.factory';
import { parseBodies } from '../../src/helpers/json';

test('@P0 @local @e2e @credit @split customer -> card -> charge com split', async ({ request }) => {
  const malga = new WireMockClient(request);
  await malga.reset();
  const response = await new MsPaymentClient(request).createPayment(creditPaymentWithSplit());
  expect([200, 201, 202]).toContain(response.status());
  const created = await response.json();
  expect(created.id).toBeTruthy();

  await expect.poll(async () => (await malga.requests('POST', '/v1/customers')).requests.length).toBe(1);
  await expect.poll(async () => (await malga.requests('POST', '/v1/cards')).requests.length).toBe(1);
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.length).toBe(1);

  const chargeBodies = parseBodies((await malga.requests('POST', '/v1/charges')).requests) as any[];
  const charge = chargeBodies[0];
  expect(charge.customerId).toBe('customer-local-001');
  expect(charge.billing).toBeTruthy();
  expect(charge.paymentSource).toMatchObject({ sourceType: 'card', cardId: 'card-local-001' });
  expect(charge.paymentSource.tokenId).toBeUndefined();
  expect(charge.splitRules).toEqual([
    expect.objectContaining({ sellerId: 'seller-001', amount: 1000, liable: false, processingFee: false })
  ]);
});
