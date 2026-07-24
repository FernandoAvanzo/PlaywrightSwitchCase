import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment } from '../../src/fixtures/payment.factory';

/**
 * Protege dados de pagamento e identificadores internos no contrato devolvido ao consumidor.
 *
 * Objetivo do teste: assegurar que uma transação aceita não exponha credenciais, tokens,
 * identificadores de integração ou o número completo do cartão em sua resposta pública.
 *
 * Regras de negócio e cobertura:
 * - Campos como `card_token`, `tokenId`, `cardId`, chaves e IDs de cliente devem permanecer internos.
 * - O PAN completo usado na massa de teste não pode aparecer no corpo da resposta.
 * - A sanitização deve valer para respostas de pagamentos processados com sucesso.
 */
test('@P0 @local @security resposta pública não expõe token ou IDs internos', async ({ request }) => {
  await new WireMockClient(request).reset();
  const response = await new MsPaymentClient(request).createPayment(creditPayment());
  expect([200, 201, 202]).toContain(response.status());
  const text = await response.text();
  expect(text).not.toMatch(/card_token|tokenId|cardId|api[-_]?key|client[-_]?id/i);
  expect(text).not.toContain('1234567890123456');
});
