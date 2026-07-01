import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env';
import { MsVoucherClient } from '../../src/api/msVoucherClient';
import { pricingRule, percentageDiscountRule, percentageIncreaseRule } from '../../src/data/pricingRules';
import { expectJsonResponse } from '../../src/utils/assertions';
import { blockProdMutation, skipWhenMissing, skipWhenMutationNotAllowed } from '../../src/utils/guards';

const env = loadEnv();

function firstPrice(body: unknown) {
  expect(Array.isArray(body)).toBeTruthy();
  expect((body as unknown[]).length).toBeGreaterThan(0);
  return (body as Record<string, unknown>[])[0];
}

test.describe('Consulta de preços com Gestão VG | PRICE-001..PRICE-008 @pricing', () => {
  test.beforeEach(() => {
    skipWhenMissing({
      CUSTOMER_ID: env.data.customerId,
      CUSTOMER_SITE_ID: env.data.customerSiteId,
      CNPJ_DISTRIBUIDOR: env.data.cnpjDistribuidor,
      PRODUCT_CODE: env.data.productCode
    });
  });

  test('PRICE-001 @smoke | Consultar preço por CNPJ deve retornar lista válida', async ({ request }) => {
    const client = new MsVoucherClient(request, env);

    const response = await client.getPrices({ 'code-product': env.data.productCode });
    const body = await expectJsonResponse(response, 200);

    const price = firstPrice(body);
    expect(price).toHaveProperty('netPriceProduct');
  });

  test('PRICE-002 @mutating | Aplicar novoValor absoluto', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    const expectedPrice = 80;
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      pricingRule({
        codigoRegra: Number(Date.now().toString().slice(-8)),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: expectedPrice
      })
    ]), 200);

    const response = await client.getPrices({ 'code-product': env.data.productCode });
    const body = await expectJsonResponse(response, 200);
    const price = firstPrice(body);

    expect(Number(price.netPriceProduct)).toBeCloseTo(expectedPrice, 2);
  });

  test('PRICE-003 @mutating | Aplicar decrescimo percentual sem quebrar contrato de preço', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      percentageDiscountRule({
        codigoRegra: Number(Date.now().toString().slice(-8)),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        decrescimo: 10
      })
    ]), 200);

    const response = await client.getPrices({ 'code-product': env.data.productCode });
    const body = await expectJsonResponse(response, 200);
    const price = firstPrice(body);

    expect(Number(price.netPriceProduct)).toBeGreaterThan(0);
  });

  test('PRICE-004 @mutating | Aplicar acrescimo percentual sem quebrar contrato de preço', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      percentageIncreaseRule({
        codigoRegra: Number(Date.now().toString().slice(-8)),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        acrescimo: 15
      })
    ]), 200);

    const response = await client.getPrices({ 'code-product': env.data.productCode });
    const body = await expectJsonResponse(response, 200);
    const price = firstPrice(body);

    expect(Number(price.netPriceProduct)).toBeGreaterThan(0);
  });

  test('PRICE-006 @mutating | Regra inativa não deve derrubar consulta de preço', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      pricingRule({
        codigoRegra: Number(Date.now().toString().slice(-8)),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        statusRegra: 'I',
        novoValor: 1
      })
    ]), 200);

    const response = await client.getPrices({ 'code-product': env.data.productCode });
    const body = await expectJsonResponse(response, 200);
    const price = firstPrice(body);

    expect(Number(price.netPriceProduct)).toBeGreaterThan(0);
  });
});
