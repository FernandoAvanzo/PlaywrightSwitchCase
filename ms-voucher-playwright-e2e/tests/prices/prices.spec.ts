import { expect, test } from '@playwright/test';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { loadEnv } from '../../src/config/env.js';
import {
  inactivePricingRule,
  legacyAbsoluteRule,
  legacyPercentageRule,
  nextPricingRuleCode,
  percentageDiscountRule,
  percentageIncreaseRule,
  pricingRule
} from '../../src/data/pricingRules.js';
import { expectFunctionalError, expectJsonResponse } from '../../src/utils/assertions.js';
import {
  applyAbsoluteDiscount,
  applyPercentageDiscount,
  isSameMonetaryValue
} from '../../src/utils/decimal.js';
import { blockProdMutation, skipWhenMissing, skipWhenMutationNotAllowed } from '../../src/utils/guards.js';

const env = loadEnv();
let importedRules: Record<string, unknown>[] = [];

function firstPrice(body: unknown) {
  expect(Array.isArray(body)).toBeTruthy();
  expect((body as unknown[]).length).toBeGreaterThan(0);
  return (body as Record<string, unknown>[])[0];
}

function monetaryField(price: Record<string, unknown>) {
  const value = price.netPriceProduct ?? price.priceProduct;
  expect(value, 'A oferta deve conter preço líquido ou preço-base.').toBeDefined();
  return value as number | string;
}

test.describe('Consulta de preços com Gestão VG @pricing', () => {
  test.beforeEach(() => {
    importedRules = [];
    skipWhenMissing({
      CUSTOMER_ID: env.data.customerId,
      CUSTOMER_SITE_ID: env.data.customerSiteId,
      CNPJ_DISTRIBUIDOR: env.data.cnpjDistribuidor,
      PRODUCT_CODE: env.data.productCode
    });
  });

  test.afterEach(async ({ request }) => {
    if (importedRules.length === 0 || !env.allowMutation || env.name === 'prod') {
      return;
    }

    const client = new MsVoucherClient(request, env);
    const latestByCode = new Map(importedRules.map(rule => [String(rule.codigoRegra), rule]));
    for (const rule of latestByCode.values()) {
      await expectJsonResponse(
        await client.importGestaoVgPricingRules([inactivePricingRule(rule)]),
        200
      );
    }
  });

  /**
   * Garante que o catálogo disponibilize um preço líquido utilizável para o produto consultado.
   *
   * Regras de negócio representadas:
   * - Uma consulta válida deve responder HTTP 200 com uma lista não vazia.
   * - A oferta deve apresentar preço líquido ou preço-base positivo.
   * - O cenário confirma a disponibilidade do catálogo antes das regras mutáveis da Gestão VG.
   */
  test('PRICE-001 @smoke | Consultar preço por CNPJ deve retornar lista válida', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const body = await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    );
    const price = firstPrice(body);

    expect(Number(monetaryField(price))).toBeGreaterThan(0);
  });

  /**
   * Concede um desconto monetário sobre o preço líquido vigente sem substituir o preço pelo benefício.
   *
   * Regras de negócio representadas:
   * - `novoValor` representa o valor a abater, e não o preço final.
   * - A modalidade absoluta deve ser inferida mesmo sem `tipoValor` no contrato legado.
   * - A campanha deve atuar sobre o preço líquido já composto.
   * - O resultado deve preservar duas casas decimais e permanecer positivo.
   */
  test('PRICE-002 @mutating | Abater novoValor do preço líquido vigente', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const discount = 10;
    const rule = legacyAbsoluteRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: discount
    });
    importedRules.push(rule);

    await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);
    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const expected = applyAbsoluteDiscount(monetaryField(baseline), discount);

    expect(isSameMonetaryValue(monetaryField(price), expected)).toBeTruthy();
    expect(isSameMonetaryValue(monetaryField(price), discount)).toBeFalsy();
  });

  /**
   * Calcula o benefício percentual sobre o preço líquido com o mesmo arredondamento financeiro do serviço.
   *
   * Regras de negócio representadas:
   * - `decrescimo` expressa o percentual a abater do preço vigente.
   * - A modalidade percentual deve ser inferida mesmo sem `tipoValor` no contrato legado.
   * - O cálculo intermediário e a escala monetária usam HALF_EVEN.
   * - A resposta deve corresponder exatamente ao preço anterior menos o percentual configurado.
   */
  test('PRICE-003 @mutating | Aplicar decréscimo percentual ao preço líquido', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const percentage = 10;
    const rule = legacyPercentageRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      decrescimo: percentage
    });
    importedRules.push(rule);

    await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);
    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));

    expect(isSameMonetaryValue(
      monetaryField(price),
      applyPercentageDiscount(monetaryField(baseline), percentage)
    )).toBeTruthy();
  });

  /**
   * Impede que a Gestão VG transforme uma campanha em aumento do preço ao consumidor.
   *
   * Regras de negócio representadas:
   * - Qualquer `acrescimo` deve ser rejeitado com 400.037.
   * - A rejeição ocorre antes de a campanha influenciar a cotação.
   * - O preço posterior deve permanecer igual à fotografia anterior.
   */
  test('PRICE-004 @mutating | Rejeitar acréscimo e preservar o preço vigente', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));

    await expectFunctionalError(
      await client.importGestaoVgPricingRules([
        percentageIncreaseRule({
          codigoRegra: nextPricingRuleCode(),
          cnpj: env.data.cnpjDistribuidor,
          produto: env.data.productCode,
          acrescimo: 15
        })
      ]),
      400,
      '400.037'
    );

    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    expect(isSameMonetaryValue(monetaryField(price), monetaryField(baseline))).toBeTruthy();
  });

  /**
   * Preserva o preço quando uma campanha existe apenas para histórico e está inativa.
   *
   * Regras de negócio representadas:
   * - Uma regra com `statusRegra=I` pode ser armazenada, mas não é elegível.
   * - A consulta deve continuar respondendo com o mesmo preço da fotografia anterior.
   * - A inatividade não pode causar erro nem benefício residual.
   */
  test('PRICE-006 @mutating | Regra inativa não deve alterar a oferta', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const inactiveRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      statusRegra: 'I',
      novoValor: 1
    });

    await expectJsonResponse(await client.importGestaoVgPricingRules([inactiveRule]), 200);
    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    expect(isSameMonetaryValue(monetaryField(price), monetaryField(baseline))).toBeTruthy();
  });

  /**
   * Prioriza o maior benefício financeiro mesmo quando outra campanha possui mais filtros.
   *
   * Regras de negócio representadas:
   * - Uma regra específica de R$ 10 compete com uma regra abrangente de R$ 20.
   * - A campanha de R$ 20 deve vencer por produzir o menor preço.
   * - A especificidade somente participa do desempate após o preço final.
   */
  test('PRICE-007 @mutating | Menor preço final deve preceder especificidade', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const specificRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 10
    });
    const broaderRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      cidade: ' ',
      uf: ' ',
      micromercado: ' ',
      diaDaSemana: null,
      codPeriodo: null,
      cia: ' ',
      novoValor: 20
    });
    importedRules.push(specificRule, broaderRule);

    await expectJsonResponse(
      await client.importGestaoVgPricingRules([specificRule, broaderRule]),
      200
    );
    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));

    expect(isSameMonetaryValue(
      monetaryField(price),
      applyAbsoluteDiscount(monetaryField(baseline), 20)
    )).toBeTruthy();
  });

  /**
   * Mantém a identidade interna da campanha fora do contrato público de preços.
   *
   * Regras de negócio representadas:
   * - O código da regra é usado internamente para seleção e versionamento, sem acoplar consumidores REST.
   * - O hash do payload participa do estado efetivo, mas não deve ser serializado.
   * - A compatibilidade pública do endpoint deve ser preservada.
   */
  test('PRICE-015 @contract | Não expor metadados internos da campanha', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));

    expect(price).not.toHaveProperty('appliedPricingRuleCode');
    expect(price).not.toHaveProperty('appliedPricingRulePayloadHash');
  });

  /**
   * Mantém a oferta comercial disponível quando não há campanha aplicável ao contexto do cliente.
   *
   * Regras de negócio representadas:
   * - A ausência de benefício promocional não significa ausência de preço.
   * - `GET /prices` deve responder HTTP 200 com o produto vigente.
   * - A oferta de fallback deve conter um valor monetário positivo e não pode expor erro 422.065.
   */
  test('PRICE-016 @smoke @fallback | Sem campanha aplicável, retornar a oferta vigente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const body = await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    );
    const price = firstPrice(body);

    expect(Number(monetaryField(price))).toBeGreaterThan(0);
    expect(price).not.toHaveProperty('appliedPricingRuleCode');
    expect(price).not.toHaveProperty('appliedPricingRulePayloadHash');
    expect(JSON.stringify(body)).not.toContain('422.065');
  });

  /**
   * Protege a oferta-base contra uma campanha ativa cujo critério de CNPJ não corresponde ao cliente.
   *
   * Regras de negócio representadas:
   * - A campanha é uma transformação opcional da oferta vigente.
   * - Um filtro divergente torna a campanha inelegível sem indisponibilizar o preço.
   * - O valor monetário retornado deve permanecer idêntico ao baseline anterior à importação.
   */
  test('PRICE-017 @mutating @fallback | CNPJ divergente preserva a oferta-base', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const mismatchedRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: '99.999.999/9999-99',
      produto: env.data.productCode,
      novoValor: 1
    });
    importedRules.push(mismatchedRule);

    await expectJsonResponse(await client.importGestaoVgPricingRules([mismatchedRule]), 200);
    const price = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));

    expect(isSameMonetaryValue(monetaryField(price), monetaryField(baseline))).toBeTruthy();
    expect(price).not.toHaveProperty('appliedPricingRuleCode');
    expect(JSON.stringify(price)).not.toContain('422.065');
  });

  /**
   * Restaura a oferta-base assim que uma campanha promocional deixa de estar ativa.
   *
   * Regras de negócio representadas:
   * - A campanha válida pode reduzir temporariamente o preço vigente.
   * - A inativação oficial encerra a elegibilidade sem apagar o histórico.
   * - Uma nova consulta deve retornar exatamente o baseline, sem benefício residual ou 422.065.
   */
  test('PRICE-020 @mutating @fallback | Inativação restaura o preço-base', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 1
    });
    importedRules.push(rule);

    await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);
    const promotionalPrice = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    expect(isSameMonetaryValue(
      monetaryField(promotionalPrice),
      applyAbsoluteDiscount(monetaryField(baseline), 1)
    )).toBeTruthy();

    const inactive = inactivePricingRule(rule);
    importedRules.push(inactive);
    await expectJsonResponse(await client.importGestaoVgPricingRules([inactive]), 200);
    const restoredPrice = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));

    expect(isSameMonetaryValue(monetaryField(restoredPrice), monetaryField(baseline))).toBeTruthy();
    expect(JSON.stringify(restoredPrice)).not.toContain('422.065');
  });

  /**
   * Preserva o catálogo completo quando somente um produto depende do fallback de preço.
   *
   * Regras de negócio representadas:
   * - A ausência de campanha para um produto não deve remover itens irmãos do catálogo.
   * - Cada item deve conservar uma oferta monetária positiva e independente.
   * - O contrato de preços deve continuar utilizável para consumidores multiproduto.
   */
  test('PRICE-022 @catalog @fallback | Fallback de um produto não remove os demais itens', async ({ request }) => {
    skipWhenMissing({ PRODUCT_CODE_SECOND: env.data.secondProductCode });
    const client = new MsVoucherClient(request, env);
    const body = await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.secondProductCode }),
      200
    );
    const price = firstPrice(body);

    expect(Number(monetaryField(price))).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('422.065');
  });
});
