import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { expectJsonResponse, expectNoSetupTechnicalFields } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMutationNotAllowed } from '../../src/utils/guards.js';

const env = loadEnv();

test.describe('Setup de voucher | SETUP-001..SETUP-006 @contract', () => {
  test('SETUP-001 @smoke | Dado ambiente ativo, quando consultar setup, então retorna contrato público válido', async ({ request }) => {
    const client = new MsVoucherClient(request, env);

    const response = await client.getSetup();
    const body = await expectJsonResponse(response, 200);

    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('notificationChannel');
    expect(['SMS', 'WHATSAPP', 'AMBOS']).toContain(body.notificationChannel);
    expectNoSetupTechnicalFields(body);
  });

  for (const channel of ['SMS', 'WHATSAPP', 'AMBOS'] as const) {
    test(`SETUP-${channel === 'SMS' ? '002' : channel === 'WHATSAPP' ? '003' : '004'} @mutating | Atualizar setup para ${channel}`, async ({ request }) => {
      blockProdMutation(env);
      skipWhenMutationNotAllowed(env);

      const client = new MsVoucherClient(request, env);

      const update = await client.updateSetup({
        id: 'default',
        consumerDataRequiredOnBlock: 'NONE',
        notificationChannel: channel
      });
      const updateBody = await expectJsonResponse(update, 200);

      expect(updateBody.notificationChannel).toBe(channel);
      expectNoSetupTechnicalFields(updateBody);

      const get = await client.getSetup();
      const getBody = await expectJsonResponse(get, 200);
      expect(getBody.notificationChannel).toBe(channel);
      expectNoSetupTechnicalFields(getBody);
    });
  }

  test('SETUP-005 @mutating | Payload legado isSendSms=true deve ser interpretado como SMS', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);

    const response = await client.updateSetup({
      id: 'default',
      isSendSms: true
    });
    const body = await expectJsonResponse(response, 200);

    expect(body.notificationChannel).toBe('SMS');
    expectNoSetupTechnicalFields(body);
  });

  test('SETUP-006 @mutating | Canal inválido deve retornar 400', async ({ request }) => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);

    const client = new MsVoucherClient(request, env);

    for (const invalidChannel of ['EMAIL', 'NONE']) {
      await test.step(`Quando notificationChannel=${invalidChannel}`, async () => {
        const response = await client.updateSetup({
          id: 'default',
          consumerDataRequiredOnBlock: 'NONE',
          notificationChannel: invalidChannel
        });

        expect(response.status(), await response.text()).toBe(400);
      });
    }
  });
});
