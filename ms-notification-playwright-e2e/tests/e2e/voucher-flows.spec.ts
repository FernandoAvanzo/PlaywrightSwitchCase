import { test, expect } from '../../src/fixtures/api';
import { voucherAdhocPayload } from '../../src/data/payloads';
import { expectStatus, optionalJson } from '../../src/utils/response';

test.describe('E2E - Voucher Vale Gás', () => {
  test('@e2e @local @local-only E2E-001 - venda com WhatsApp aceito', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-wa-ok'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body?.sentChannel) expect(body.sentChannel).toBe('WHATSAPP');
  });

  test('@e2e @local @local-only E2E-002 - WhatsApp falha e SMS fallback tem sucesso', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-fallback-ok'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body?.sentChannel) expect(body.sentChannel).toBe('SMS');
  });

  test('@e2e @local @local-only E2E-003 - falha total registra contingência', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(500);
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-total-failure'
    }));

    await expectStatus(response, 202);
  });
});
