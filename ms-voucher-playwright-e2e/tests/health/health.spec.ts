import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';

const env = loadEnv();

test.describe('Disponibilidade da aplicação @health', () => {
  test('HEALTH-001 @smoke | ms-voucher local deve estar saudável', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const body = await expectJsonResponse(await client.getHealth(), 200);

    expect(body).toMatchObject({ status: 'UP' });
  });
});
