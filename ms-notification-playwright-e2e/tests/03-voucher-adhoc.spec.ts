import { test, expect } from '../src/fixtures/api';
import { voucherAdhocPayload, voucherAdhocTemplateOnlyPayload } from '../src/data/payloads';
import { expectStatus, optionalJson } from '../src/utils/response';
import { type MockInfraClient } from '../src/clients/mock-infra-client';

type VoucherAdhocResponse = {
  transactionId?: string;
  primaryChannel?: string;
  fallbackChannel?: string;
  sentChannel?: string;
  status?: string;
  primaryStatus?: string;
  fallbackStatus?: string;
  message?: string;
};

async function waitForRequestCount(mockInfra: MockInfraClient, urlPattern: string, expected: number): Promise<void> {
  await expect.poll(async () => mockInfra.countRequests(urlPattern), { timeout: 15_000 }).toBe(expected);
}

async function waitForAtLeastOneRequest(mockInfra: MockInfraClient, urlPattern: string): Promise<void> {
  await expect.poll(async () => mockInfra.countRequests(urlPattern), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
}

async function expectNoSmsFallback(mockInfra: MockInfraClient): Promise<void> {
  await expect.poll(async () => mockInfra.countRequests('.*(sms|infobip).*'), { timeout: 2_000 }).toBe(0);
}

function parseVoucherResponse(response: VoucherAdhocResponse | null): VoucherAdhocResponse {
  return response ?? {};
}

test.describe('Fluxo adhoc de voucher via BLiP com fallback SMS', () => {
  test('@local @local-only CT-013 - WhatsApp BLiP aceito sem fallback SMS', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipSuccessWithAlternativeAccount();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-adhoc-001'
    }));

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));

    expect(body.primaryChannel).toBe('WHATSAPP');
    expect(body.fallbackChannel).toBe('SMS');
    expect(body.sentChannel).toBe('WHATSAPP');
    expect(body.status).toBe('ACCEPTED');
    expect(body.primaryStatus).toBe('ACCEPTED');
    expect(body.fallbackStatus).toBeUndefined();
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);
    await expectNoSmsFallback(mockInfra);
  });

  test('@local @local-only CT-014 - falha funcional BLiP aciona SMS fallback', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-fallback-001',
      voucherId: 'VCH-TESTE-002',
      message: 'Seu codigo Vale Gas e 654321'
    }));

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));

    expect(body.primaryChannel).toBe('WHATSAPP');
    expect(body.fallbackChannel).toBe('SMS');
    expect(body.sentChannel).toBe('SMS');
    expect(body.status).toBe('FALLBACK_SENT');
    expect(body.primaryStatus).toBe('HOSPITAL_SCHEDULED');
    expect(body.fallbackStatus).toBe('ACCEPTED');
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);
    await waitForAtLeastOneRequest(mockInfra, '.*(sms|infobip).*');
  });

  test('@local @local-only CT-015 - falha funcional BLiP e falha SMS retornam FALLBACK_FAILED', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(400);
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-fallback-failed-001',
      voucherId: 'VCH-TESTE-003'
    }));

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));

    expect(body.status).toBe('FALLBACK_FAILED');
    expect(body.primaryStatus).toBe('HOSPITAL_SCHEDULED');
    expect(['RETRY_SCHEDULED', 'HOSPITAL_SCHEDULED', 'FAILED']).toContain(body.fallbackStatus);
    await waitForAtLeastOneRequest(mockInfra, '.*(sms|infobip).*');
  });

  test('@local @local-only BLIP-003 - falha transitória BLiP não aciona SMS imediato', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(503);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-whatsapp-retry-001',
      voucherId: 'VCH-TESTE-004'
    }));

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));

    expect(body.status).toBe('RETRY_SCHEDULED');
    expect(body.primaryStatus).toBe('RETRY_SCHEDULED');
    expect(body.sentChannel).toBeUndefined();
    expect(body.fallbackStatus).toBeUndefined();
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);
    await expectNoSmsFallback(mockInfra);
  });

  test('@local @local-only CT-016 - usar canais default quando payload não informar canais', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipSuccessWithAlternativeAccount();

    const payload = voucherAdhocPayload({
      transactionId: 'trx-voucher-default-channels-001',
      voucherId: 'VCH-TESTE-005'
    });
    delete (payload as Record<string, unknown>).primaryChannel;
    delete (payload as Record<string, unknown>).fallbackChannel;

    const response = await apiClient.sendVoucherAdhoc(payload);

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));

    expect(body.primaryChannel).toBe('WHATSAPP');
    expect(body.fallbackChannel).toBe('SMS');
    expect(body.sentChannel).toBe('WHATSAPP');
  });

  test('@local @local-only CT-017 - template-only gera SMS fallback com código', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocTemplateOnlyPayload({
      transactionId: 'trx-voucher-template-fallback-001',
      voucherId: 'VCH-TESTE-006',
      templateVariables: { voucherCode: '778899', '1': '778899' }
    }));

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));
    const smsRequest = await mockInfra.latestRequest('.*(sms|infobip).*');

    expect(body.status).toBe('FALLBACK_SENT');
    expect(body.sentChannel).toBe('SMS');
    expect(smsRequest?.body).toContain('778899');
  });

  test('@local @local-only BLIP-004 - lookup BLiP sem destino aciona fallback SMS sem enviar template', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithoutDestination();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-blip-destination-missing-001',
      voucherId: 'VCH-TESTE-007'
    }));

    await expectStatus(response, 202);
    const body = parseVoucherResponse(await optionalJson<VoucherAdhocResponse>(response));

    expect(body.status).toBe('FALLBACK_SENT');
    expect(body.primaryStatus).toBe('HOSPITAL_SCHEDULED');
    expect(body.sentChannel).toBe('SMS');
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 0);
    await waitForAtLeastOneRequest(mockInfra, '.*(sms|infobip).*');
  });

  test('@contract CT-018 - rejeitar voucher adhoc sem voucherId', async ({ apiClient }) => {
    const payload = voucherAdhocPayload({ transactionId: 'trx-voucher-no-id-001' });
    delete (payload as Record<string, unknown>).voucherId;

    const response = await apiClient.sendVoucherAdhoc(payload);

    await expectStatus(response, 400);
  });

  test('@contract CT-019 - rejeitar canal primário diferente de WhatsApp', async ({ apiClient }) => {
    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-invalid-primary-001',
      primaryChannel: 'SMS',
      fallbackChannel: 'SMS'
    }));

    await expectStatus(response, 400);
  });

  test('@contract CT-020 - rejeitar fallback diferente de SMS', async ({ apiClient }) => {
    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-invalid-fallback-001',
      primaryChannel: 'WHATSAPP',
      fallbackChannel: 'WHATSAPP'
    }));

    await expectStatus(response, 400);
  });
});
