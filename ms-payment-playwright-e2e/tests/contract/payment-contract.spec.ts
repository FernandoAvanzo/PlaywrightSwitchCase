import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { creditPayment, pixPayment } from '../../src/fixtures/payment.factory';

test.describe('@contract contrato público', () => {
  test('@local crédito sem billing deve ser rejeitado', async ({ request }) => {
    const payload = creditPayment();
    delete payload.fraud_analysis;
    const response = await new MsPaymentClient(request).createPayment(payload);
    expect(response.status()).toBe(400);
  });
  test('@local PIX não deve aceitar card_details', async ({ request }) => {
    const payload = pixPayment();
    payload.card_details = { card_token: 'nao-permitido' };
    const response = await new MsPaymentClient(request).createPayment(payload);
    expect(response.status()).toBe(400);
  });
  test('@local valor zero deve ser rejeitado', async ({ request }) => {
    const response = await new MsPaymentClient(request).createPayment(creditPayment({ amount: 0 }));
    expect(response.status()).toBe(400);
  });
});
