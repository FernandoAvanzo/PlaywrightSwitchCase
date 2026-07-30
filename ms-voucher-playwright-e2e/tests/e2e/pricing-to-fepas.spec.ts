import { expect, test } from '@playwright/test';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { loadEnv } from '../../src/config/env.js';
import {
  inactivePricingRule,
  nextPricingRuleCode,
  pricingRule
} from '../../src/data/pricingRules.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';
import { applyAbsoluteDiscount, isSameMonetaryValue, toFepasAmount } from '../../src/utils/decimal.js';
import {
  FepasResponse,
  fepasPriceTableRequest,
  readAnnouncedVersion,
  readFirstTag404Amounts
} from '../../src/utils/fepas.js';
import {
  blockProdMutation,
  skipWhenFepasE2EDisabled,
  skipWhenMissing,
  skipWhenMutatingE2EDisabled,
  skipWhenMutationNotAllowed,
  skipWhenPricingDiscountContractUnsupported
} from '../../src/utils/guards.js';

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

async function sendFepas(
  client: MsVoucherClient,
  version: number | string,
  phase: 'discovery' | 'load'
) {
  return expectJsonResponse(
    await client.handleFepas(
      fepasPriceTableRequest(env.fepas.distributorDocument, version, phase)
    ),
    200
  ) as Promise<FepasResponse>;
}

async function discoverAndLoad(client: MsVoucherClient, terminalVersion: number | string) {
  const discovery = await sendFepas(client, terminalVersion, 'discovery');
  expect(discovery.BIT_39).toBe('00');
  expect(discovery.BIT_70).toBe('800');
  const version = readAnnouncedVersion(discovery);
  const load = await sendFepas(client, version, 'load');
  expect(load.BIT_39).toBe('00');
  return { discovery, load, version };
}

test.describe('Precificação até a carga FEPAS | FEP-001..FEP-008 @pricing @fepas @e2e @mutating', () => {
  test.beforeEach(() => {
    importedRules = [];
    skipWhenPricingDiscountContractUnsupported(env);
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
    skipWhenFepasE2EDisabled(env);
    skipWhenMissing({
      CUSTOMER_ID: env.data.customerId,
      CUSTOMER_SITE_ID: env.data.customerSiteId,
      CNPJ_DISTRIBUIDOR: env.data.cnpjDistribuidor,
      PRODUCT_CODE: env.data.productCode,
      FEPAS_DISTRIBUTOR_DOCUMENT: env.fepas.distributorDocument
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
   * Entrega ao PDV exatamente o preço promocional aprovado pelo catálogo de vouchers.
   *
   * Regras de negócio representadas:
   * - O desconto absoluto deve ser refletido primeiro em `GET /prices`.
   * - Os três campos monetários da tag 404 devem repetir o mesmo preço final em centavos.
   * - O terminal não pode recalcular o benefício nem receber o preço-base por engano.
   */
  test('FEP-001 FEP-002 | Propagar o preço final nos três campos monetários da tag 404', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const discount = 10;
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: discount
    });
    importedRules.push(rule);
    await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);

    const effectivePrice = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const expectedPrice = applyAbsoluteDiscount(monetaryField(baseline), discount);
    expect(isSameMonetaryValue(monetaryField(effectivePrice), expectedPrice)).toBeTruthy();

    const { load } = await discoverAndLoad(client, '00000000');
    expect(readFirstTag404Amounts(load)).toEqual([
      toFepasAmount(expectedPrice),
      toFepasAmount(expectedPrice),
      toFepasAmount(expectedPrice)
    ]);
    expect(load.BIT_60).toMatch(/^[a-f0-9]{1,40}$/);
  });

  /**
   * Reutiliza a versão vigente quando produto, preço e campanha permanecem semanticamente idênticos.
   *
   * Regras de negócio representadas:
   * - A primeira sincronização deve anunciar e carregar uma versão coerente.
   * - Um novo logon com a mesma versão e a mesma oferta deve responder que não há carga pendente.
   * - Repetições sem mudança não podem inflar o histórico de versões.
   */
  test('FEP-004 | Não anunciar nova versão para estado efetivo idêntico', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 9
    });
    importedRules.push(rule);
    await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);

    const { version } = await discoverAndLoad(client, '00000000');
    const repeatedDiscovery = await sendFepas(client, version, 'discovery');

    expect(repeatedDiscovery.BIT_39).toBe('00');
    expect(repeatedDiscovery.BIT_70).toBe('001');
    expect(repeatedDiscovery.BIT_47).toBe(fepasPriceTableRequest(
      env.fepas.distributorDocument,
      version,
      'discovery'
    ).BIT_47);
  });

  /**
   * Cria uma nova versão comercial quando a campanha muda sem trocar o vínculo do produto.
   *
   * Regras de negócio representadas:
   * - O mesmo `codigoRegra` pode evoluir de R$ 10 para R$ 11 de desconto.
   * - A mudança do preço e do payload deve anunciar versão superior mesmo com os mesmos priceIds.
   * - A nova tag 404 deve transportar o novo preço final, mantendo o hash SHA-1 protocolar.
   */
  test('FEP-005 | Versionar mudança de campanha com os mesmos identificadores de preço', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const codigoRegra = nextPricingRuleCode();
    const original = pricingRule({
      codigoRegra,
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 10
    });
    importedRules.push(original);
    await expectJsonResponse(await client.importGestaoVgPricingRules([original]), 200);
    const firstLoad = await discoverAndLoad(client, '00000000');

    const changed = { ...original, novoValor: 11 };
    importedRules.push(changed);
    await expectJsonResponse(await client.importGestaoVgPricingRules([changed]), 200);
    const discovery = await sendFepas(client, firstLoad.version, 'discovery');
    expect(discovery.BIT_70).toBe('800');
    const nextVersion = readAnnouncedVersion(discovery);
    expect(Number(nextVersion)).toBeGreaterThan(Number(firstLoad.version));

    const secondLoad = await sendFepas(client, nextVersion, 'load');
    expect(secondLoad.BIT_39).toBe('00');
    const expectedPrice = applyAbsoluteDiscount(monetaryField(baseline), 11);
    expect(readFirstTag404Amounts(secondLoad)).toEqual([
      toFepasAmount(expectedPrice),
      toFepasAmount(expectedPrice),
      toFepasAmount(expectedPrice)
    ]);
    expect(secondLoad.BIT_60).toBe(firstLoad.load.BIT_60);
  });

  /**
   * Retira o benefício do terminal quando a campanha deixa de ser elegível.
   *
   * Regras de negócio representadas:
   * - Inativar a regra deve restaurar a oferta anterior na consulta de preços.
   * - A retirada do benefício constitui mudança efetiva e deve anunciar nova versão.
   * - A carga seguinte deve substituir o valor promocional pelo preço vigente sem campanha.
   */
  test('FEP-008 | Atualizar a tabela quando a campanha é inativada', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const baseline = firstPrice(await expectJsonResponse(
      await client.getPrices({ 'code-product': env.data.productCode }),
      200
    ));
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 8
    });
    importedRules.push(rule);
    await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);
    const promotionalLoad = await discoverAndLoad(client, '00000000');

    const inactive = inactivePricingRule(rule);
    importedRules.push(inactive);
    await expectJsonResponse(await client.importGestaoVgPricingRules([inactive]), 200);
    const discovery = await sendFepas(client, promotionalLoad.version, 'discovery');
    expect(discovery.BIT_70).toBe('800');
    const nextVersion = readAnnouncedVersion(discovery);
    const baseLoad = await sendFepas(client, nextVersion, 'load');
    const expectedBaseAmount = toFepasAmount(monetaryField(baseline));

    expect(readFirstTag404Amounts(baseLoad)).toEqual([
      expectedBaseAmount,
      expectedBaseAmount,
      expectedBaseAmount
    ]);
  });
});
