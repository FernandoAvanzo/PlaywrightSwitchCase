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

  /**
   * Direciona a comunicação da venda exclusivamente para SMS quando esse é o canal contratado.
   *
   * Objetivo do teste: confirmar que a configuração do setup governa o roteamento da notificação
   * e impede chamadas desnecessárias ao WhatsApp.
   *
   * Regras de negócio e cobertura:
   * - Uma venda válida deve concluir com o setup `SMS`.
   * - O endpoint `/sms` deve ser acionado ao menos uma vez.
   * - O endpoint `/whatsapp` não pode receber requisições nesse modo.
   */
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

  /**
   * Direciona a comunicação da venda exclusivamente para WhatsApp quando esse é o canal contratado.
   *
   * Objetivo do teste: validar que o setup `WHATSAPP` produz uma única estratégia de entrega e
   * não usa o SMS sem uma regra de contingência configurada.
   *
   * Regras de negócio e cobertura:
   * - Uma venda válida deve concluir com a configuração de WhatsApp.
   * - O endpoint `/whatsapp` deve ser acionado ao menos uma vez.
   * - O endpoint `/sms` deve permanecer sem chamadas.
   */
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

  /**
   * Evita comunicação duplicada quando o WhatsApp conclui com sucesso na estratégia de dois canais.
   *
   * Objetivo do teste: comprovar que `AMBOS` representa prioridade com contingência, e não envio
   * simultâneo da mesma informação por WhatsApp e SMS.
   *
   * Regras de negócio e cobertura:
   * - O WhatsApp deve ser o primeiro canal acionado para a venda.
   * - Com sucesso no canal primário, nenhuma chamada de SMS deve ocorrer.
   * - A venda deve permanecer bem-sucedida usando apenas uma comunicação.
   */
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

  /**
   * Mantém a comunicação da venda quando o canal prioritário está indisponível.
   *
   * Objetivo do teste: validar que o setup `AMBOS` aciona o SMS após uma falha do WhatsApp,
   * permitindo que o cliente ainda receba as informações do Vale Gás.
   *
   * Regras de negócio e cobertura:
   * - O WhatsApp deve ser tentado antes do fallback.
   * - Uma falha HTTP 500 no canal primário deve provocar ao menos uma chamada de SMS.
   * - A indisponibilidade da notificação principal não deve impedir a conclusão da venda.
   */
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

  /**
   * Aplica a preferência de WhatsApp também às comunicações de cancelamento de Vale.
   *
   * Objetivo do teste: confirmar que a alteração de status para cancelamento utiliza o canal
   * configurado no setup, e não apenas os fluxos de venda.
   *
   * Regras de negócio e cobertura:
   * - O cancelamento autenticado deve concluir com o setup `WHATSAPP`.
   * - A operação deve acionar o endpoint `/whatsapp` ao menos uma vez.
   * - O roteamento de canal deve ser consistente entre venda e mudança de status.
   */
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
