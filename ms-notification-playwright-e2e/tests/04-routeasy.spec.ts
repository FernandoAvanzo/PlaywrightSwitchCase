import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { routeasyPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Webhook Routeasy', () => {
  test('@local @local-only CT-021 - evento mapeado dispara SMS', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubShortenerSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload());

    await expectStatus(response, 202);
    expect(await mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(1);
  });

  test('@local @local-only CT-022 - evento não mapeado não dispara SMS', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubShortenerSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload({
      current: {
        entity: { status: 'unknown', type: 'message' },
        values: { message_type: 'unknown_event' },
        visibilityUrl: 'https://visibility.exemplo.com/abc123',
        services: [{ phone: '(11) 98888-1234' }]
      }
    }));

    await expectStatus(response, 202);
    expect(await mockInfra.countRequests('.*(sms|infobip).*')).toBe(0);
  });

  test('@local @local-only CT-023 - falha de encurtador envia ocorrência para hospital', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubShortenerFailure();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload());

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.routeasyHospital);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });
});
