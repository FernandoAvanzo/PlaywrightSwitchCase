import { test, expect } from '../../src/fixtures/api';
import { routeasyPayload } from '../../src/data/payloads';
import { expectStatus } from '../../src/utils/response';

test.describe('E2E - Routeasy', () => {
  test('@e2e @local @local-only E2E-004 - webhook dispara SMS de acompanhamento', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubShortenerSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload());

    await expectStatus(response, 202);
    expect(await mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(1);
  });
});
