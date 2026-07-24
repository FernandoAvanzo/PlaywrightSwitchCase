import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPayment } from '../../src/fixtures/payment.factory';
import { parseBodies } from '../../src/helpers/json';

/**
 * Preserva a cobrança integral do estabelecimento quando o pagamento não possui recebedores de split.
 *
 * Objetivo do teste: confirmar que o fluxo de crédito convencional cria a cobrança sem incluir
 * instruções de divisão financeira não solicitadas pelo consumidor da API.
 *
 * Regras de negócio e cobertura:
 * - Um pagamento de crédito válido deve ser aceito e gerar uma cobrança no provedor.
 * - A ausência de `split_receivers` na entrada deve resultar na ausência de `splitRules` na cobrança.
 * - O teste cobre a transformação do contrato público para o payload externo sem split implícito.
 */
test('@P0 @local @e2e crédito sem split não envia splitRules', async ({ request }) => {
  const malga = new WireMockClient(request); await malga.reset();
  const response = await new MsPaymentClient(request).createPayment(creditPayment());
  expect([200, 201, 202]).toContain(response.status());
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.length, { timeout: 40_000 }).toBe(1);
  const bodies = parseBodies((await malga.requests('POST', '/v1/charges')).requests) as any[];
  expect(bodies[0].splitRules).toBeUndefined();
});
