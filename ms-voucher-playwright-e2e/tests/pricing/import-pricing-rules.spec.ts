import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { pricingRule, percentageDiscountRule, nextPricingRuleCode } from '../../src/data/pricingRules.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMissing, skipWhenMutationNotAllowed } from '../../src/utils/guards.js';

const env = loadEnv();

test.describe('Importação Gestão VG | PRIC-001..PRIC-009 @pricing @contract', () => {
  test.beforeEach(() => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMissing({
      CNPJ_DISTRIBUIDOR: env.data.cnpjDistribuidor,
      PRODUCT_CODE: env.data.productCode
    });
  });

  test('PRIC-001 | Importar regra válida com normalizações', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      uf: 'ba'
    });

    const response = await client.importGestaoVgPricingRules([rule]);
    const body = await expectJsonResponse(response, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalCriado + body.totalAtualizado + body.totalIgnorado).toBeGreaterThanOrEqual(1);
  });

  test('PRIC-002 | Reimportar payload idêntico deve ser idempotente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode
    });

    const first = await client.importGestaoVgPricingRules([rule]);
    await expectJsonResponse(first, 200);

    const second = await client.importGestaoVgPricingRules([rule]);
    const body = await expectJsonResponse(second, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalIgnorado).toBeGreaterThanOrEqual(1);
  });

  test('PRIC-003 | Atualizar regra existente pelo mesmo codigoRegra', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const codigoRegra = nextPricingRuleCode();
    const original = pricingRule({
      codigoRegra,
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 80
    });

    await expectJsonResponse(await client.importGestaoVgPricingRules([original]), 200);

    const changed = { ...original, novoValor: 75 };
    const response = await client.importGestaoVgPricingRules([changed]);
    const body = await expectJsonResponse(response, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalAtualizado + body.totalCriado).toBeGreaterThanOrEqual(1);
  });

  test('PRIC-004 | Duplicidade de codigoRegra no lote deve falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const codigoRegra = nextPricingRuleCode();
    const ruleA = pricingRule({ codigoRegra, cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode });
    const ruleB = pricingRule({ codigoRegra, cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode, novoValor: 90 });

    const response = await client.importGestaoVgPricingRules([ruleA, ruleB]);
    expect(response.status(), await response.text()).toBe(400);
  });

  test('PRIC-005 | Lote vazio deve falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);

    const response = await client.importGestaoVgPricingRules([]);
    expect(response.status(), await response.text()).toBe(400);
  });

  test('PRIC-006 | Enums e formatos inválidos devem falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const invalidPayloads = [
      pricingRule({ statusRegra: 'X', cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode }),
      pricingRule({ codPeriodo: 'XYZ', cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode }),
      pricingRule({ diaDaSemana: 8, cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode }),
      pricingRule({ cnpj: '123', produto: env.data.productCode }),
      pricingRule({ uf: 'BAH', cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode })
    ];

    for (const payload of invalidPayloads) {
      const response = await client.importGestaoVgPricingRules([payload]);
      expect(response.status(), await response.text()).toBe(400);
    }
  });

  test('PRIC-007 | dataFim anterior a dataInicio deve falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const response = await client.importGestaoVgPricingRules([
      pricingRule({
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        dataInicio: '2026-12-17',
        dataFim: '2026-12-16'
      })
    ]);

    expect(response.status(), await response.text()).toBe(400);
  });

  test('PRIC-008 | tipoValor deve ser inferido quando payload tem decrescimo', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = percentageDiscountRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      decrescimo: 10
    });

    const response = await client.importGestaoVgPricingRules([rule]);
    const body = await expectJsonResponse(response, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalCriado + body.totalAtualizado + body.totalIgnorado).toBeGreaterThanOrEqual(1);
  });

  test('PRIC-009 | novoValor junto com decrescimo deve falhar por ambiguidade', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const ambiguous = {
      ...pricingRule({
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: 80
      }),
      decrescimo: 10
    };

    const response = await client.importGestaoVgPricingRules([ambiguous]);
    expect(response.status(), await response.text()).toBe(400);
  });
});
