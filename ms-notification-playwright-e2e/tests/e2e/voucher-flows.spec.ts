import { test, expect } from '../../src/fixtures/api';
import { voucherAdhocPayload } from '../../src/data/payloads';
import { expectStatus, optionalJson } from '../../src/utils/response';
import { type MockInfraClient } from '../../src/clients/mock-infra-client';

type VoucherAdhocResponse = {
  sentChannel?: string;
  status?: string;
  primaryStatus?: string;
  fallbackStatus?: string;
};

async function waitForRequestCount(mockInfra: MockInfraClient, urlPattern: string, expected: number): Promise<void> {
  await expect.poll(async () => mockInfra.countRequests(urlPattern), { timeout: 15_000 }).toBe(expected);
}

test.describe('E2E - Voucher Vale Gas via BLiP', () => {
  test('@e2e @local @local-only E2E-001 - venda com WhatsApp BLiP aceito', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipSuccessWithAlternativeAccount();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-wa-ok'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body?.status).toBe('ACCEPTED');
    expect(body?.sentChannel).toBe('WHATSAPP');
    expect(body?.primaryStatus).toBe('ACCEPTED');
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);
    await waitForRequestCount(mockInfra, '.*(sms|infobip).*', 0);
  });

  test('@e2e @local @local-only E2E-002 - falha funcional BLiP e SMS fallback tem sucesso', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-fallback-ok'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body?.status).toBe('FALLBACK_SENT');
    expect(body?.sentChannel).toBe('SMS');
    expect(body?.primaryStatus).toBe('HOSPITAL_SCHEDULED');
    expect(body?.fallbackStatus).toBe('ACCEPTED');
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);
    await expect.poll(async () => mockInfra.countRequests('.*(sms|infobip).*'), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
  });

  test('@e2e @local @local-only E2E-003 - falha funcional BLiP e SMS fallback falha', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(400);
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-total-failure'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body?.status).toBe('FALLBACK_FAILED');
    expect(body?.primaryStatus).toBe('HOSPITAL_SCHEDULED');
    expect(['RETRY_SCHEDULED', 'HOSPITAL_SCHEDULED', 'FAILED']).toContain(body?.fallbackStatus);
    await expect.poll(async () => mockInfra.countRequests('.*(sms|infobip).*'), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
  });

  test('@e2e @local @local-only E2E-004 - falha transitória BLiP fica em retry sem SMS imediato', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(503);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-whatsapp-retry'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body?.status).toBe('RETRY_SCHEDULED');
    expect(body?.primaryStatus).toBe('RETRY_SCHEDULED');
    expect(body?.sentChannel).toBeUndefined();
    expect(body?.fallbackStatus).toBeUndefined();
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);
    await waitForRequestCount(mockInfra, '.*(sms|infobip).*', 0);
  });
});
