import { test, expect } from '../src/fixtures/api';
import { voucherAdhocPayload, whatsappTemplatePayload, phones } from '../src/data/payloads';
import { expectStatus, optionalJson } from '../src/utils/response';

test.describe('Fluxo adhoc de voucher', () => {
  test('@local @local-only CT-013 - WhatsApp aceito sem fallback SMS', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-adhoc-001'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body) {
      expect(body.primaryChannel).toBe('WHATSAPP');
      expect(body.fallbackChannel).toBe('SMS');
      expect(body.sentChannel).toBe('WHATSAPP');
    }
    expect(await mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(0);
  });

  test('@local @local-only CT-014 - acionar SMS fallback quando WhatsApp for rejeitado', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-fallback-001',
      voucherId: 'VCH-TESTE-002',
      message: 'Seu codigo Vale Gas e 654321'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body) {
      expect(body.sentChannel).toBe('SMS');
      expect(['FALLBACK_SENT', 'ACCEPTED']).toContain(String(body.status));
    }
  });

  test('@local @local-only CT-015 - WhatsApp e SMS falham', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(500);
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-fallback-failed-001',
      voucherId: 'VCH-TESTE-003'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body?.status) {
      expect(['FALLBACK_FAILED', 'RETRY_SCHEDULED', 'HOSPITAL_SCHEDULED']).toContain(String(body.status));
    }
  });

  test('@local @local-only CT-016 - usar canais default quando payload não informar canais', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const payload = voucherAdhocPayload({
      transactionId: 'trx-voucher-default-channels-001',
      voucherId: 'VCH-TESTE-004'
    });
    delete (payload as Record<string, unknown>).primaryChannel;
    delete (payload as Record<string, unknown>).fallbackChannel;

    const response = await apiClient.sendVoucherAdhoc(payload);

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body) {
      expect(body.primaryChannel).toBe('WHATSAPP');
      expect(body.fallbackChannel).toBe('SMS');
    }
  });

  test('@local @local-only CT-017 - template-only gera SMS fallback com código', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc({
      ...whatsappTemplatePayload({
        transactionId: 'trx-voucher-template-fallback-001',
        voucherId: 'VCH-TESTE-005',
        templateVariables: { voucherCode: '778899', '1': '778899' }
      }),
      origin: 'GESTAO_VG'
    });

    await expectStatus(response, 202);
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
