import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';

const env = loadEnv();

test.describe('Disponibilidade da aplicação @health', () => {
  /**
   * Garante que o ms-voucher esteja disponível para executar as jornadas de Vale Gás.
   *
   * Objetivo do teste: realizar uma verificação smoke do ambiente local antes dos cenários que
   * consultam ou alteram dados de negócio.
   *
   * Regras de negócio e cobertura:
   * - O endpoint de saúde deve responder com HTTP 200.
   * - O contrato de disponibilidade deve informar `status=UP`.
   * - A verificação não deve provocar mutações e serve como pré-condição operacional da suíte.
   */
  test('HEALTH-001 @smoke | ms-voucher local deve estar saudável', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const body = await expectJsonResponse(await client.getHealth(), 200);

    expect(body).toMatchObject({ status: 'UP' });
  });
});
