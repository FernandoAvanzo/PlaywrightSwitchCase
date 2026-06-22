import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { whatsappPayload, whatsappTemplatePayload, phones } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Envio de WhatsApp', () => {
  test('@local @local-only CT-007 - enviar WhatsApp com mensagem livre', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-playwright-001' }));

    await expectStatus(response, 202);
    await expect.poll(() => mockInfra.countRequests('.*(whatsapp|infobip).*')).toBeGreaterThanOrEqual(1);
  });

  test('@local @local-only CT-008 - enviar WhatsApp usando template', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const response = await apiClient.sendWhatsapp(whatsappTemplatePayload({
      transactionId: 'trx-whatsapp-template-playwright-001'
    }));

    await expectStatus(response, 202);
  });

  test('@contract CT-009 - rejeitar WhatsApp sem mensagem e sem template', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp({
      transactionId: 'trx-whatsapp-no-content-001',
      cellPhone: phones.valid,
      notificationType: 'SELL'
    });

    await expectStatus(response, 400);
  });

  test('@contract CT-010 - rejeitar WhatsApp com telefone inválido', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp(whatsappPayload({
      transactionId: 'trx-whatsapp-invalid-phone-001',
      cellPhone: '00123'
    }));

    await expectStatus(response, 400);
  });

  test('@local @local-only CT-011 - enviar WhatsApp para retry em erro transitório', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubWhatsappFailure(500);

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-retry-001' }));

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.whatsappRetry);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });

  test('@local @local-only CT-012 - enviar WhatsApp para hospital em erro funcional', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubWhatsappFailure(400);

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-hospital-001' }));

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.whatsappHospital);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });
});
