import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env';
import { MsVoucherClient } from '../../src/api/msVoucherClient';
import { expectNoLiteralPlaceholder } from '../../src/utils/assertions';
import { blockProdMutation, skipWhenMissing, skipWhenMutatingE2EDisabled, skipWhenMutationNotAllowed } from '../../src/utils/guards';

const env = loadEnv();

test.describe('Mensagens funcionais PT-BR | MSG-001..MSG-008 @messages @mutating', () => {
  test.beforeEach(() => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
  });

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
