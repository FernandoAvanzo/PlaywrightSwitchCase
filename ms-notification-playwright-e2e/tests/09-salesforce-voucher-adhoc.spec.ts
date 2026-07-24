import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { voucherAdhocPayload } from '../src/data/payloads';
import { expectStatus, optionalJson } from '../src/utils/response';
import {
  expectNoSms,
  expectQueueEmpty,
  latestSalesforceRequest,
  salesforcePaths,
  waitForAtLeastOneRequest,
  waitForQueueMessage,
  waitForRequestCount
} from '../src/utils/salesforce-test';

type VoucherAdhocResponse = {
  transactionId?: string;
  primaryChannel?: string;
  fallbackChannel?: string;
  sentChannel?: string;
  status?: string;
  primaryStatus?: string;
  fallbackStatus?: string;
};

test.describe('Voucher adhoc via Salesforce com contingência SMS', () => {
  /**
   * Confirma o WhatsApp como canal primário do Voucher adhoc quando o Salesforce
   * aceita a mensagem, preservando o SMS exclusivamente como contingência.
   *
   * Regras de negócio: aceite retorna ACCEPTED e sentChannel=WHATSAPP; não há
   * fallback, retry ou hospital depois do sucesso.
   */
  test('@local @local-only SF-F12 - concluir Voucher adhoc pelo WhatsApp aceito', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-adhoc-f12');
    await mockInfra.stubSmsSuccess();

    const response = await salesforceApiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-sf-adhoc-f12',
      message: 'VG-ADHOC-F12'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body).toMatchObject({
      transactionId: 'trx-sf-adhoc-f12',
      primaryChannel: 'WHATSAPP',
      fallbackChannel: 'SMS',
      sentChannel: 'WHATSAPP',
      status: 'ACCEPTED',
      primaryStatus: 'ACCEPTED'
    });
    expect(body?.fallbackStatus).toBeUndefined();
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await expectNoSms(mockInfra);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
  });

  /**
   * Preserva a emissão do Vale Gás mesmo quando o Salesforce rejeita a mensagem
   * de forma definitiva, usando SMS uma única vez como canal de contingência.
   *
   * Regras de negócio: falha 400 é hospitalizada; SMS aceito produz FALLBACK_SENT;
   * nenhuma mensagem é publicada na fila de retry do WhatsApp.
   */
  test('@local @local-only SF-R06/R18 - enviar SMS após rejeição definitiva', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(400);
    await mockInfra.stubSmsSuccess();

    const response = await salesforceApiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-sf-adhoc-r18',
      message: 'VG-ADHOC-R18'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body).toMatchObject({
      sentChannel: 'SMS',
      status: 'FALLBACK_SENT',
      primaryStatus: 'HOSPITAL_SCHEDULED',
      fallbackStatus: 'ACCEPTED'
    });
    await waitForQueueMessage(sqs, env.queues.whatsappHospital);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    await waitForRequestCount(mockInfra, salesforcePaths.sms, 1);
  });

  /**
   * Evita comunicação duplicada durante uma indisponibilidade recuperável do
   * Salesforce, dando prioridade ao reprocessamento do canal principal.
   *
   * Regras de negócio: falha 500 agenda retry; não envia SMS imediatamente; a
   * resposta adhoc informa RETRY_SCHEDULED e não define canal enviado.
   */
  test('@local @local-only SF-R09 - manter falha transitória em retry sem SMS', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(500);
    await mockInfra.stubSmsSuccess();

    const response = await salesforceApiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-sf-adhoc-r09',
      message: 'VG-ADHOC-R09'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body).toMatchObject({
      status: 'RETRY_SCHEDULED',
      primaryStatus: 'RETRY_SCHEDULED'
    });
    expect(body?.sentChannel).toBeUndefined();
    expect(body?.fallbackStatus).toBeUndefined();
    await waitForQueueMessage(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
    await expectNoSms(mockInfra);
  });

  /**
   * Mantém compatibilidade com consumidores que informam somente o identificador
   * do Vale Gás, assegurando que ainda exista conteúdo para ambos os canais.
   *
   * Regras de negócio: voucherId é o último fallback do código; ele se torna text
   * no Salesforce e permite construir a mensagem padrão do SMS se necessário.
   */
  test('@local @local-only SF-F10 - usar voucherId como código quando não houver mensagem', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-adhoc-f10');

    const response = await salesforceApiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-sf-adhoc-f10',
      voucherId: 'VG-ID-F10-7788',
      message: undefined,
      templateName: undefined,
      templateVariables: undefined
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    const { body } = await latestSalesforceRequest(mockInfra, salesforcePaths.voucher);

    expect(body).toEqual({
      to: '5511988881234',
      text: 'VG-ID-F10-7788'
    });
  });

  /**
   * Expõe de forma rastreável que nenhum canal concluiu a comunicação, permitindo
   * atuação operacional sem mascarar a falha do canal secundário.
   *
   * Regras de negócio: rejeição definitiva do Salesforce seguida de falha do SMS
   * produz FALLBACK_FAILED e mantém os status dos dois canais na resposta.
   */
  test('@local @local-only SF-R19 - informar falha do WhatsApp e do SMS', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(403);
    await mockInfra.stubSmsFailure(500);

    const response = await salesforceApiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-sf-adhoc-r19',
      message: 'VG-ADHOC-R19'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<VoucherAdhocResponse>(response);

    expect(body?.status).toBe('FALLBACK_FAILED');
    expect(body?.primaryStatus).toBe('HOSPITAL_SCHEDULED');
    expect(['RETRY_SCHEDULED', 'HOSPITAL_SCHEDULED', 'FAILED']).toContain(body?.fallbackStatus);
    await waitForQueueMessage(sqs, env.queues.whatsappHospital);
    await waitForAtLeastOneRequest(mockInfra, salesforcePaths.sms);
  });
});
