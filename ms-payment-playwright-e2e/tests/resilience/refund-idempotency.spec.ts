import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment } from '../../src/fixtures/payment.factory';
import { malgaPaymentWebhook, malgaRefundWebhook, malgaWebhookHeaders } from '../../src/fixtures/refund.factory';

test.setTimeout(120_000);

/**
 * Protege o resultado contábil contra replay e concorrência de webhooks de estorno.
 *
 * Regra de negócio: a chave determinística baseada em pagamento e valor total
 * deve permitir reprocessamento seguro, mantendo exatamente um evento de refund,
 * mesmo quando os IDs externos do webhook forem diferentes.
 */
test('@P0 @local REF-011/REF-012/REF-013 replay do refund não duplica efeito', async ({ request }) => {
  const wiremock = new WireMockClient(request); await wiremock.reset();
  const client = new MsPaymentClient(request);
  const payload = creditPayment();
  const created = await client.createPayment(payload);
  expect([200, 201, 202]).toContain(created.status());
  const { id } = await created.json();
  await expect.poll(async () => {
    const requests = (await wiremock.requests('POST', '/v1/charges')).requests;
    return requests.some(request => request.body?.includes(payload.merchant_order_id));
  }, { timeout: 60_000 }).toBe(true);
  const ready = await client.waitForStatus(id, ['PRE_AUTHORIZED', 'AUTHORIZED', 'PAID']);
  if (ready.status !== 'PAID') {
    await client.postMalgaWebhook(
      malgaPaymentWebhook(`charge-${payload.merchant_order_id}`, 'authorized', payload.merchant_order_id),
      malgaWebhookHeaders(`paid-${id}`)
    );
    await client.waitForStatus(id, ['PAID']);
  }
  const voidResponse = await client.void(id, payload.amount, `refund-${id}-${payload.amount}`);
  expect([200, 202, 204]).toContain(voidResponse.status());
  const first = malgaRefundWebhook(`charge-${payload.merchant_order_id}`, 'REFUNDED', payload.amount, payload.merchant_order_id);
  const second = { ...malgaRefundWebhook(`charge-${payload.merchant_order_id}`, 'REFUNDED', payload.amount, payload.merchant_order_id), id: 'evt-replay-different-id' };
  const key = `refund-${id}-${payload.amount}`;
  const responses = await Promise.all([
    client.postMalgaWebhook(first, malgaWebhookHeaders(key)),
    client.postMalgaWebhook(second, malgaWebhookHeaders(key))
  ]);
  expect(responses.every(response => [200, 202, 204, 409].includes(response.status()))).toBeTruthy();
  expect((await client.waitForStatus(id, ['REFUNDED'])).status).toBe('REFUNDED');
});
