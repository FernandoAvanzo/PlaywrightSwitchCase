import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { expectJsonResponse, expectNoSetupTechnicalFields } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMutationNotAllowed, skipWhenSetupContractUnsupported } from '../../src/utils/guards.js';

const env = loadEnv();

test.describe('Setup de voucher | SETUP-001..SETUP-006 @contract', () => {
  test.beforeEach(() => {
    skipWhenSetupContractUnsupported(env);
  });

  /**
   * Expõe a configuração de notificação em um contrato público estável e sem detalhes técnicos.
   *
   * Objetivo do teste: validar que a consulta do setup informe a identidade da configuração e
   * um canal reconhecido pelo domínio para orientar vendas e cancelamentos.
   *
   * Regras de negócio e cobertura:
   * - A consulta deve responder HTTP 200 com `id` e `notificationChannel`.
   * - O canal deve ser `SMS`, `WHATSAPP` ou `AMBOS`.
   * - Campos internos de persistência ou implementação não podem aparecer na resposta.
   */
  test('SETUP-001 | Dado contrato notification-channel ativo, quando consultar setup, então retorna contrato público válido', async ({ request }) => {
    const client = new MsVoucherClient(request, env);

    const response = await client.getSetup();
    const body = await expectJsonResponse(response, 200);

    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('notificationChannel');
    expect(['SMS', 'WHATSAPP', 'AMBOS']).toContain(body.notificationChannel);
    expectNoSetupTechnicalFields(body);
  });

  for (const channel of ['SMS', 'WHATSAPP', 'AMBOS'] as const) {
    /**
     * Permite configurar e persistir cada estratégia de notificação suportada pelo Vale Gás.
     *
     * Objetivo do teste: confirmar, para SMS, WhatsApp e ambos, que a atualização é refletida
     * imediatamente na resposta e permanece disponível em uma nova consulta.
     *
     * Regras de negócio e cobertura:
     * - Somente os três canais do domínio devem ser usados pela matriz positiva.
     * - A atualização e a leitura subsequente devem retornar exatamente o canal escolhido.
     * - Nenhuma das respostas pode expor campos técnicos do setup.
     */
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

  /**
   * Mantém compatibilidade com consumidores legados que configuram notificação por flag booleana.
   *
   * Objetivo do teste: validar a tradução de `isSendSms=true` para o novo contrato de canais,
   * permitindo evolução da API sem interromper integrações existentes.
   *
   * Regras de negócio e cobertura:
   * - A flag legada verdadeira deve equivaler a `notificationChannel=SMS`.
   * - A atualização deve responder HTTP 200 com o valor normalizado.
   * - A resposta compatível não pode expor campos técnicos internos.
   */
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

  /**
   * Impede a persistência de canais que não fazem parte da estratégia de notificação do produto.
   *
   * Objetivo do teste: confirmar que valores como `EMAIL` e `NONE` sejam recusados e não alterem
   * o roteamento das comunicações de Vale Gás.
   *
   * Regras de negócio e cobertura:
   * - O domínio aceita exclusivamente `SMS`, `WHATSAPP` e `AMBOS`.
   * - Cada canal desconhecido da matriz deve ser validado de forma independente.
   * - A tentativa de atualização deve retornar HTTP 400.
   */
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
