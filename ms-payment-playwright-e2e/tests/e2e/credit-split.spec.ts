import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { WireMockClient } from '../../src/clients/wiremock.client';
import { creditPaymentWithSplit, splitReceiverPayload } from '../../src/fixtures/payment.factory';
import { parseBodies } from '../../src/helpers/json';

/**
 * Garante a divisão financeira de uma venda de crédito entre o estabelecimento e o recebedor cadastrado.
 *
 * Objetivo do teste: validar ponta a ponta o cadastro do recebedor e a orquestração sequencial de
 * cliente, cartão e cobrança, incluindo a regra de split enviada ao provedor.
 *
 * Regras de negócio e cobertura:
 * - O recebedor do split deve ser criado ou atualizado antes da transação.
 * - Uma venda válida deve criar exatamente um cliente, um cartão e uma cobrança.
 * - A cobrança deve referenciar cliente e cartão persistidos, sem reutilizar o token bruto.
 * - `splitRules` deve repassar 1.000 unidades ao vendedor configurado, sem responsabilidade ou taxa.
 */
test('@P0 @local @e2e @credit @split customer -> card -> charge com split', async ({ request }) => {
  const malga = new WireMockClient(request);
  await malga.reset();
  const msPayment = new MsPaymentClient(request);

  const splitReceiver = await msPayment.upsertSplitReceiver(splitReceiverPayload());
  expect([200, 201]).toContain(splitReceiver.status());

  const payload = creditPaymentWithSplit();
  const response = await msPayment.createPayment(payload);
  expect([200, 201, 202]).toContain(response.status());
  const created = await response.json();
  expect(created.id).toBeTruthy();

  const forPayment = (body: string | undefined) => body?.includes(payload.customer.email) ?? false;
  await expect.poll(async () => (await malga.requests('POST', '/v1/customers')).requests.filter(request => forPayment(request.body)).length, { timeout: 40_000 }).toBe(1);
  await expect.poll(async () => (await malga.requests('POST', '/v1/cards')).requests.filter(request => request.body?.includes(payload.card_details?.card_token ?? '')).length, { timeout: 40_000 }).toBe(1);
  await expect.poll(async () => (await malga.requests('POST', '/v1/charges')).requests.filter(request => request.body?.includes(payload.merchant_order_id)).length, { timeout: 40_000 }).toBe(1);

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
