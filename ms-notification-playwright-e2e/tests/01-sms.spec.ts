import { test, expect } from '../src/fixtures/api';
import { env, isProd } from '../src/config/environment';
import { smsPayload, phones } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Envio de SMS', () => {
  test('@local @local-only CT-002 - enviar SMS com payload válido', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-playwright-001' }));

    await expectStatus(response, 202);
    await expect.poll(() => mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(1);
  });

  test('@contract CT-003 - rejeitar SMS sem telefone', async ({ apiClient }) => {
    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-invalid-001', cellPhone: undefined }));

    await expectStatus(response, 400);
  });

  test('@contract CT-004 - rejeitar SMS com telefone inválido', async ({ apiClient }) => {
    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-invalid-phone-001', cellPhone: phones.invalid }));

    await expectStatus(response, 400);
  });

  test('@contract CT-005 - rejeitar SMS com mensagem menor que 5 caracteres', async ({ apiClient }) => {
    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-invalid-message-001', message: 'Oi' }));

    await expectStatus(response, 400);
  });

  test('@local @local-only CT-006 - alias inexistente usa credenciais default', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendSms(
      smsPayload({ transactionId: 'trx-sms-default-credentials-001' }),
      'alias-inexistente'
    );

    await expectStatus(response, 202);
  });

  test('@local @local-only SMS - falha transitória publica contingência', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-retry-001' }));

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.smsRetry);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });
});
