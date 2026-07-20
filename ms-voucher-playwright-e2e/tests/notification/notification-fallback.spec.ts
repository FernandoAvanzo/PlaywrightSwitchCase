import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { WireMockClient } from '../../src/api/wiremockClient.js';
import { backofficeSellVoucherPayload, cancelVoucherPayload } from '../../src/data/payloadBuilders.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMissing, skipWhenMutatingE2EDisabled, skipWhenMutationNotAllowed, skipWhenSetupContractUnsupported } from '../../src/utils/guards.js';

const env = loadEnv();

test.describe('Notificação SMS, WhatsApp e fallback | NOTIF-001..NOTIF-010 @notification @mutating', () => {
  test.beforeEach(() => {
    skipWhenSetupContractUnsupported(env);
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
    skipWhenMissing({
      CUSTOMER_ID: env.data.customerId,
      CUSTOMER_SITE_ID: env.data.customerSiteId,
      PRODUCT_CODE: env.data.productCode,
      PHONE_DDD: env.data.phoneDdd,
      PHONE_NUMBER: env.data.phoneNumber,
      WIREMOCK_NOTIFICATION_ADMIN_URL: env.wiremockNotificationAdminUrl
    });
  });

  test.afterEach(async () => {
    if (env.wiremockNotificationAdminUrl) {
      await new WireMockClient(env.wiremockNotificationAdminUrl).dispose();
    }
  });

  test('NOTIF-001 | Venda com setup SMS deve chamar /sms e não /whatsapp', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await wiremock.resetAllToDefaultMappings();
    await wiremock.resetRequests();
    await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'SMS' }), 200);

    const response = await client.sellVoucherBackoffice(backofficeSellVoucherPayload(env));
    expect(response.ok(), await response.text()).toBeTruthy();

    expect(await wiremock.countPostRequests('/notification/v1/sms')).toBeGreaterThanOrEqual(1);
    expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBe(0);
  });

  test('NOTIF-002 | Venda com setup WHATSAPP deve chamar /whatsapp e não /sms', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await wiremock.resetAllToDefaultMappings();
    await wiremock.resetRequests();
    await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'WHATSAPP' }), 200);

    const response = await client.sellVoucherBackoffice(backofficeSellVoucherPayload(env));
    expect(response.ok(), await response.text()).toBeTruthy();

    expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBeGreaterThanOrEqual(1);
    expect(await wiremock.countPostRequests('/notification/v1/sms')).toBe(0);
  });

  test('NOTIF-003 | AMBOS com WhatsApp sucesso não envia SMS duplicado', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await wiremock.resetAllToDefaultMappings();
    await wiremock.resetRequests();
    await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'AMBOS' }), 200);

    const response = await client.sellVoucherBackoffice(backofficeSellVoucherPayload(env));
    expect(response.ok(), await response.text()).toBeTruthy();

    expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBeGreaterThanOrEqual(1);
    expect(await wiremock.countPostRequests('/notification/v1/sms')).toBe(0);
  });

  test('NOTIF-004 | AMBOS com falha no WhatsApp deve usar SMS fallback', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await wiremock.resetAllToDefaultMappings();
    await wiremock.resetRequests();
    await wiremock.setEndpointFailure('/notification/v1/whatsapp', 500);
    await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'AMBOS' }), 200);

    const response = await client.sellVoucherBackoffice(backofficeSellVoucherPayload(env));
    expect(response.ok(), await response.text()).toBeTruthy();

    expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBeGreaterThanOrEqual(1);
    expect(await wiremock.countPostRequests('/notification/v1/sms')).toBeGreaterThanOrEqual(1);
  });

  test('NOTIF-007 | Cancelamento com WhatsApp usa /whatsapp', async ({ request }) => {
    skipWhenMissing({ AUTH_CODE: env.data.authCode });

    const client = new MsVoucherClient(request, env);
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);

    await wiremock.resetAllToDefaultMappings();
    await wiremock.resetRequests();
    await expectJsonResponse(await client.updateSetup({ id: 'default', notificationChannel: 'WHATSAPP' }), 200);

    const response = await client.changeVoucherStatus(cancelVoucherPayload(env));
    expect(response.ok(), await response.text()).toBeTruthy();

    expect(await wiremock.countPostRequests('/notification/v1/whatsapp')).toBeGreaterThanOrEqual(1);
  });
});
