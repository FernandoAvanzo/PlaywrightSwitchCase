import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { creditPayment } from '../../src/fixtures/payment.factory';

test('@P0 @local @security resposta pública não expõe token ou IDs internos', async ({ request }) => {
  const response = await new MsPaymentClient(request).createPayment(creditPayment());
  expect([200, 201, 202]).toContain(response.status());
  const text = await response.text();
  expect(text).not.toMatch(/card_token|tokenId|cardId|api[-_]?key|client[-_]?id/i);
  expect(text).not.toContain('1234567890123456');
});
