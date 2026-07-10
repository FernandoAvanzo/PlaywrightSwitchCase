import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
test('@smoke @local @hml @prod-safe API deve estar saudável', async ({ request }) => {
  const response = await new MsPaymentClient(request).health();
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe('UP');
});
