import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { WireMockClient } from '../../src/api/wiremockClient.js';
import { pricingRule, nextPricingRuleCode } from '../../src/data/pricingRules.js';
import { backofficeSellVoucherPayload } from '../../src/data/payloadBuilders.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMissing, skipWhenMutatingE2EDisabled, skipWhenMutationNotAllowed, skipWhenSetupContractUnsupported } from '../../src/utils/guards.js';

const env = loadEnv();

test.describe('Fluxos E2E críticos | E2E-001..E2E-003 @e2e @mutating', () => {
  test.beforeEach(() => {
    skipWhenSetupContractUnsupported(env);
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
    skipWhenMissing({
      CUSTOMER_ID: env.data.customerId,
      CUSTOMER_SITE_ID: env.data.customerSiteId,
      CNPJ_DISTRIBUIDOR: env.data.cnpjDistribuidor,
      PRODUCT_CODE: env.data.productCode,
      PHONE_DDD: env.data.phoneDdd,
      PHONE_NUMBER: env.data.phoneNumber,
      WIREMOCK_NOTIFICATION_ADMIN_URL: env.wiremockNotificationAdminUrl
    });
  });

  /**
   * Garante a continuidade da jornada crítica de venda com preço gerenciado e canais redundantes.
   *
   * Objetivo do teste: validar ponta a ponta a configuração `AMBOS`, a importação de uma regra
   * absoluta da Gestão VG, a consulta de preço e a venda com contingência por SMS.
   *
   * Regras de negócio e cobertura:
   * - A regra importada deve manter a consulta de preço disponível para o produto.
   * - A venda deve ser concluída mesmo quando o endpoint de WhatsApp retorna falha.
   * - O WhatsApp deve ser tentado primeiro e o SMS deve ser acionado como fallback.
   * - O cenário cobre a integração entre setup, pricing, venda e notificação.
   */
  test('E2E-001 | Setup AMBOS + pricing rule + venda com fallback SMS', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await test.step('Dado setup AMBOS e WhatsApp falhando', async () => {
      await wiremock.resetAllToDefaultMappings();
      await wiremock.resetRequests();
      await wiremock.setEndpointFailure('/notification/v1/whatsapp', 500);
      await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'AMBOS' }), 200);
    });

    await test.step('E regra Gestão VG absoluta importada', async () => {
      await expectJsonResponse(await client.importGestaoVgPricingRules([
        pricingRule({
          codigoRegra: nextPricingRuleCode(),
          cnpj: env.data.cnpjDistribuidor,
          produto: env.data.productCode,
          novoValor: 80
        })
      ]), 200);
    });

    await test.step('Quando consultar preço', async () => {
      const prices = await expectJsonResponse(await client.getPrices({ 'code-product': env.data.productCode }), 200);
      expect(Array.isArray(prices)).toBeTruthy();
      expect(prices.length).toBeGreaterThan(0);
    });

    await test.step('E vender voucher', async () => {
      const sell = await client.sellVoucherBackoffice(backofficeSellVoucherPayload(env));
      expect(sell.ok(), await sell.text()).toBeTruthy();
    });

    await test.step('Então WhatsApp foi tentado e SMS fallback foi usado', async () => {
      expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBeGreaterThanOrEqual(1);
      expect(await wiremock.countPostRequests('/notification/v1/sms')).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * Preserva o comportamento legado de clientes configurados exclusivamente para SMS.
   *
   * Objetivo do teste: evitar regressão que introduza tentativa de WhatsApp em uma venda cujo
   * setup determina o SMS como único canal de comunicação.
   *
   * Regras de negócio e cobertura:
   * - A configuração `SMS` deve permitir a conclusão da venda.
   * - O serviço de notificação por SMS deve ser acionado ao menos uma vez.
   * - Nenhuma requisição deve ser enviada ao endpoint de WhatsApp.
   */
  test('E2E-003 | Regressão SMS legado: setup SMS não deve chamar WhatsApp', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await wiremock.resetAllToDefaultMappings();
    await wiremock.resetRequests();
    await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'SMS' }), 200);

    const sell = await client.sellVoucherBackoffice(backofficeSellVoucherPayload(env));
    expect(sell.ok(), await sell.text()).toBeTruthy();

    expect(await wiremock.countPostRequests('/notification/v1/sms')).toBeGreaterThanOrEqual(1);
    expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBe(0);
  });
});
