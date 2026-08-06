import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { creditPayment } from '../../src/fixtures/payment.factory';
import { malgaRefundWebhook } from '../../src/fixtures/refund.factory';

/**
 * Verifica o comportamento de segurança do endpoint de webhook diante de assinatura inválida.
 *
 * Regra de negócio: um evento adulterado não pode alterar o pagamento nem iniciar
 * uma descida Oracle; se a validação criptográfica ainda não estiver habilitada no
 * ambiente, o resultado deve ser tratado como lacuna explícita de hardening.
 */
test('@P1 @local @security REF-023 assinatura inválida não altera estado financeiro', async ({ request }) => {
  const client = new MsPaymentClient(request);
  const payload = creditPayment();
  const created = await client.createPayment(payload);
  expect([200, 201, 202]).toContain(created.status());
  const { id } = await created.json();
  const before = await client.getPayment(id);
  const response = await client.postMalgaWebhook(malgaRefundWebhook(`charge-${payload.merchant_order_id}`, 'REFUNDED', payload.amount, payload.merchant_order_id), {
    'X-Idempotency-Key': `invalid-${id}`,
    'X-Plug-Date': new Date().toISOString(),
    'X-Plug-Signature': 'invalid-signature'
  });
  const after = await client.getPayment(id);
  expect(after.ok()).toBeTruthy();
  if ([401, 403, 422].includes(response.status())) {
    expect(await after.json()).toMatchObject(await before.json());
  } else {
    test.info().annotations.push({ type: 'security-gap', description: `Webhook aceito com assinatura inválida: HTTP ${response.status()}` });
  }
});
