import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { pricingRule, percentageDiscountRule, percentageIncreaseRule, nextPricingRuleCode } from '../../src/data/pricingRules.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMissing, skipWhenMutationNotAllowed } from '../../src/utils/guards.js';

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

  /**
   * Garante que o catálogo disponibilize um preço líquido utilizável para o produto consultado.
   *
   * Objetivo do teste: executar uma verificação smoke da consulta de preços com o contexto
   * configurado de cliente, distribuidor e produto.
   *
   * Regras de negócio e cobertura:
   * - Uma consulta válida deve responder HTTP 200 com uma lista não vazia.
   * - O primeiro resultado deve expor `netPriceProduct` no contrato público.
   * - O cenário confirma a disponibilidade do preço base antes das regras mutáveis da Gestão VG.
   */
  test('PRICE-001 @smoke | Consultar preço por CNPJ deve retornar lista válida', async ({ request }) => {
    const client = new MsVoucherClient(request, env);

    const response = await client.getPrices({ 'code-product': env.data.productCode });
    const body = await expectJsonResponse(response, 200);

    const price = firstPrice(body);
    expect(price).toHaveProperty('netPriceProduct');
  });

  /**
   * Permite que uma regra da Gestão VG substitua o preço líquido por um valor absoluto.
   *
   * Objetivo do teste: validar que a importação de `novoValor=80` afeta a consulta subsequente
   * do produto e entrega o preço comercial esperado.
   *
   * Regras de negócio e cobertura:
   * - A regra ativa vinculada ao CNPJ e ao produto deve ser aceita pela importação.
   * - A consulta deve continuar respondendo com contrato válido.
   * - `netPriceProduct` deve corresponder ao valor absoluto definido, com precisão monetária.
   */
  test('PRICE-002 @mutating | Aplicar novoValor absoluto', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    const expectedPrice = 80;
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      pricingRule({
        codigoRegra: nextPricingRuleCode(),
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

  /**
   * Mantém a consulta de preço válida após a aplicação de uma regra percentual de redução.
   *
   * Objetivo do teste: confirmar que uma regra de decréscimo de 10% é aceita e não produz
   * preço nulo, negativo ou resposta incompatível com o catálogo.
   *
   * Regras de negócio e cobertura:
   * - A redução deve ser importada para o CNPJ e produto configurados.
   * - A consulta posterior deve responder HTTP 200 com uma lista válida.
   * - O preço líquido resultante deve permanecer maior que zero.
   */
  test('PRICE-003 @mutating | Aplicar decrescimo percentual sem quebrar contrato de preço', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      percentageDiscountRule({
        codigoRegra: nextPricingRuleCode(),
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

  /**
   * Mantém a consulta de preço válida após a aplicação de uma regra percentual de aumento.
   *
   * Objetivo do teste: confirmar que uma regra de acréscimo de 15% é aceita sem comprometer
   * a disponibilidade ou a estrutura do preço comercial.
   *
   * Regras de negócio e cobertura:
   * - O acréscimo deve ser importado para o CNPJ e produto configurados.
   * - A consulta posterior deve responder HTTP 200 com uma lista válida.
   * - O preço líquido resultante deve permanecer maior que zero.
   */
  test('PRICE-004 @mutating | Aplicar acrescimo percentual sem quebrar contrato de preço', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      percentageIncreaseRule({
        codigoRegra: nextPricingRuleCode(),
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

  /**
   * Preserva a disponibilidade do preço quando existe uma regra inativa para o produto.
   *
   * Objetivo do teste: assegurar que uma regra com `statusRegra=I` seja armazenada sem causar
   * falha ou valor comercial inválido na consulta.
   *
   * Regras de negócio e cobertura:
   * - A importação de uma regra inativa deve ser aceita pelo contrato.
   * - A consulta de preço deve continuar respondendo HTTP 200.
   * - O preço líquido apresentado ao consumidor deve permanecer positivo.
   */
  test('PRICE-006 @mutating | Regra inativa não deve derrubar consulta de preço', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);
    await expectJsonResponse(await client.importGestaoVgPricingRules([
      pricingRule({
        codigoRegra: nextPricingRuleCode(),
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
