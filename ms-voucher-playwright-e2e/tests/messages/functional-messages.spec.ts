import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { expectNoLiteralPlaceholder } from '../../src/utils/assertions.js';
import { blockProdMutation, skipWhenMissing, skipWhenMutatingE2EDisabled, skipWhenMutationNotAllowed } from '../../src/utils/guards.js';

const env = loadEnv();

test.describe('Mensagens funcionais PT-BR | MSG-001..MSG-008 @messages @mutating', () => {
  test.beforeEach(() => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
  });

  /**
   * Mantém a mensagem de erro FEPAS acionável quando o identificador efetivo não é localizado.
   *
   * Objetivo do teste: confirmar que a resposta funcional interpola o ID informado pelo usuário,
   * em vez de expor um placeholder literal ou uma mensagem sem contexto.
   *
   * Regras de negócio e cobertura:
   * - A tentativa de finalização sem um ID efetivo válido deve retornar HTTP 422.
   * - O corpo deve conter exatamente o identificador usado na solicitação.
   * - Nenhum marcador de interpolação pode permanecer visível no contrato público.
   */
  test('MSG-008 | FEPAS sem id efetivo deve exibir o id informado e não placeholder literal', async ({ request }) => {
    skipWhenMissing({ FEPAS_EFFECTIVE_ID: env.data.fepasEffectiveId });

    // O endpoint exato de finalização FEPAS pode variar por contrato/gateway.
    // Este teste preserva a intenção BDD e deve ser ajustado se o path interno divergir.
    const response = await request.post('/fepas/finalize-sale', {
      data: {
        effectiveId: env.data.fepasEffectiveId
      }
    });

    expect(response.status(), await response.text()).toBe(422);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain(env.data.fepasEffectiveId);
    expectNoLiteralPlaceholder(body);
  });

  /**
   * Comunica claramente o limite unitário de venda quando a operação é iniciada por código de barras.
   *
   * Objetivo do teste: validar que uma tentativa de vender mais de um Vale por barcode seja
   * rejeitada com orientação funcional específica para correção da quantidade.
   *
   * Regras de negócio e cobertura:
   * - Vendas por barcode permitem somente um Vale por operação.
   * - Quantidade igual a dois deve retornar HTTP 422 com a mensagem correspondente.
   * - A resposta não pode apresentar placeholders literais ao consumidor.
   */
  test('MSG-006 | Venda por barcode com quantidade maior que 1 deve retornar mensagem específica', async ({ request }) => {
    skipWhenMissing({
      CUSTOMER_ID: env.data.customerId,
      CUSTOMER_SITE_ID: env.data.customerSiteId,
      PRODUCT_CODE_BARCODE: env.data.productCodeBarcode
    });

    const client = new MsVoucherClient(request, env);
    const response = await client.sellVoucherBackoffice({
      quantity: 2,
      voucherBarcode: env.data.productCodeBarcode,
      mustSendSms: false
    });

    expect(response.status(), await response.text()).toBe(422);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain('É permitido vender somente 1 vale por vez');
    expectNoLiteralPlaceholder(body);
  });
});
