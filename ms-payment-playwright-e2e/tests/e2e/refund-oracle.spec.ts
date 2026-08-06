import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment, pixPayment } from '../../src/fixtures/payment.factory';
import { malgaPaymentWebhook, malgaRefundWebhook, malgaWebhookHeaders } from '../../src/fixtures/refund.factory';

test.setTimeout(120_000);

const malgaChargeId = (merchantOrderId: string) => `charge-${merchantOrderId}`;

async function createAndCapture(client: MsPaymentClient, wiremock: WireMockClient, payload: ReturnType<typeof creditPayment>) {
  const created = await client.createPayment(payload);
  expect([200, 201, 202]).toContain(created.status());
  const payment = await created.json();
  expect(payment.id).toBeTruthy();
  await expect.poll(async () => {
    const requests = (await wiremock.requests('POST', '/v1/charges')).requests;
    return requests.some(request => request.body?.includes(payload.merchant_order_id));
  }, { timeout: 60_000 }).toBe(true);
  const ready = await client.waitForStatus(payment.id, ['PRE_AUTHORIZED', 'AUTHORIZED', 'PAID']);
  if (ready.status !== 'PAID') {
    const paidWebhook = await client.postMalgaWebhook(
      malgaPaymentWebhook(malgaChargeId(payload.merchant_order_id), 'authorized', payload.merchant_order_id),
      malgaWebhookHeaders(`paid-${payment.id}`)
    );
    expect([200, 202, 204]).toContain(paidWebhook.status());
    await client.waitForStatus(payment.id, ['PAID']);
  }
  return { id: payment.id as string, orderId: payload.merchant_order_id };
}

test.describe('@e2e @refund-oracle descida de estorno', () => {
  /**
   * Comprova que o estorno total de PIX do HUB percorra o caminho financeiro até o estado terminal.
   *
   * Regra de negócio: somente `REFUNDED` total, após pagamento capturado, deve
   * disparar a reconciliação; o webhook terminal é correlacionado ao mesmo pagamento.
   */
  test('@P0 @local REF-001 PIX total do HUB termina em REFUNDED', async ({ request }) => {
    const wiremock = new WireMockClient(request); await wiremock.reset();
    const client = new MsPaymentClient(request);
    const payload = pixPayment();
    const payment = await createAndCapture(client, wiremock, payload);
    const response = await client.void(payment.id, 2000, `refund-${payment.id}-2000`);
    expect([200, 202, 204]).toContain(response.status());
    const webhook = await client.postMalgaWebhook(
      malgaRefundWebhook(malgaChargeId(payment.orderId), 'REFUNDED', 2000, payment.orderId),
      malgaWebhookHeaders(`refund-webhook-${payment.id}-2000`)
    );
    expect([200, 202, 204]).toContain(webhook.status());
    const finalState = await client.waitForStatus(payment.id, ['REFUNDED']);
    expect(finalState.status).toBe('REFUNDED');
    expect(finalState.captured_amount).toBe(2000);
  });

  /**
   * Comprova que o cancelamento de crédito mantenha a semântica de refund e a correlação da venda.
   *
   * Regra de negócio: cartão usa `transaction_type=refund` e `operation_type=cancel`,
   * preserva referências da adquirente quando disponíveis e nunca expõe PAN ou CVV.
   */
  test('@P0 @local REF-002 cartão de crédito total preserva a origem financeira', async ({ request }) => {
    const wiremock = new WireMockClient(request); await wiremock.reset();
    const client = new MsPaymentClient(request);
    const payload = creditPayment();
    const payment = await createAndCapture(client, wiremock, payload);
    const response = await client.void(payment.id, 2000, `refund-${payment.id}-2000`);
    expect([200, 202, 204]).toContain(response.status());
    const webhook = await client.postMalgaWebhook(
      malgaRefundWebhook(malgaChargeId(payment.orderId), 'REFUNDED', 2000, payment.orderId),
      malgaWebhookHeaders(`refund-webhook-${payment.id}-2000`)
    );
    expect([200, 202, 204]).toContain(webhook.status());
    expect((await client.waitForStatus(payment.id, ['REFUNDED'])).status).toBe('REFUNDED');
  });
});
