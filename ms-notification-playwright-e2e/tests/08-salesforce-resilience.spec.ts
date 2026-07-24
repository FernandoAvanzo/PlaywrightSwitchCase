import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { salesforceVoucherPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';
import {
  expectNoSms,
  expectQueueEmpty,
  salesforcePaths,
  waitForQueueMessage,
  waitForRequestCount
} from '../src/utils/salesforce-test';

test.describe('WhatsApp via Salesforce - renovação e classificação de falhas', () => {
  /**
   * Mantém a entrega em andamento quando o Salesforce invalida o primeiro token,
   * sem exigir uma nova solicitação do consumidor.
   *
   * Regras de negócio: o primeiro 401 invalida o cache; um novo token é obtido;
   * a chamada Apex é repetida uma única vez e o aceite encerra o fluxo sem filas.
   */
  test('@local @local-only SF-R04 - renovar token após o primeiro 401', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess('sf-token-renovavel');
    await mockInfra.stubSalesforceUnauthorizedThenAccepted('voucher', 'sf-correlation-r04');

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-refresh-r04'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 2);
    expect(await mockInfra.countRequests(salesforcePaths.oauth)).toBe(2);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
  });

  /**
   * Interrompe a repetição automática quando a credencial renovada também é
   * rejeitada, evitando loop, sobrecarga e múltiplos envios inconclusivos.
   *
   * Regras de negócio: dois 401 produzem exatamente duas chamadas OAuth/Apex;
   * não existe terceira tentativa; a falha definitiva segue para hospital.
   */
  test('@local @local-only SF-R05 - hospitalizar o segundo 401 sem repetição infinita', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess('sf-token-sempre-invalido');
    await mockInfra.stubSalesforceFailure(401);

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-second-401-r05'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 2);
    expect(await mockInfra.countRequests(salesforcePaths.oauth)).toBe(2);
    await waitForQueueMessage(sqs, env.queues.whatsappHospital);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    expect(await mockInfra.countRequests(salesforcePaths.voucher)).toBe(2);
  });

  for (const status of [400, 403]) {
    /**
     * Direciona rejeições definitivas do Salesforce para tratamento operacional,
     * sem insistir automaticamente em uma solicitação que não será aceita.
     *
     * Regras de negócio: 400 e 403 pertencem ao hospital; não geram retry e,
     * no endpoint geral de WhatsApp, não acionam SMS.
     */
    test(`@local @local-only SF-R0${status === 400 ? '6' : '7'} - hospitalizar HTTP ${status}`, async ({
      salesforceApiClient,
      mockInfra,
      sqs
    }) => {
      await mockInfra.stubSalesforceOAuthSuccess();
      await mockInfra.stubSalesforceFailure(status);

      const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
        transactionId: `trx-sf-definitive-${status}`
      }));

      await expectStatus(response, 202);
      await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
      await waitForQueueMessage(sqs, env.queues.whatsappHospital);
      await expectQueueEmpty(sqs, env.queues.whatsappRetry);
      await expectNoSms(mockInfra);
    });
  }

  const transientFailures = [
    { id: 'R08', status: 429 },
    { id: 'R09', status: 500 },
    { id: 'R10', status: 503 }
  ];

  for (const failure of transientFailures) {
    /**
     * Preserva a oportunidade de entrega quando a indisponibilidade do Salesforce
     * é temporária, sem antecipar um SMS que poderia duplicar a comunicação.
     *
     * Regras de negócio: 429, 500 e 503 temporário seguem para retry; o hospital
     * permanece vazio e nenhum SMS é enviado imediatamente.
     */
    test(`@local @local-only SF-${failure.id} - agendar retry para HTTP ${failure.status}`, async ({
      salesforceApiClient,
      mockInfra,
      sqs
    }) => {
      await mockInfra.stubSalesforceOAuthSuccess();
      await mockInfra.stubSalesforceFailure(failure.status);

      const transactionId = `trx-sf-transient-${failure.status}`;
      const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
        transactionId,
        message: `VG-${failure.status}`
      }));

      await expectStatus(response, 202);
      await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
      const queueBody = JSON.parse(await waitForQueueMessage(
        sqs,
        env.queues.whatsappRetry
      )) as Record<string, unknown>;

      expect(queueBody).toMatchObject({
        id: transactionId,
        cellPhone: '5511988881234',
        message: `VG-${failure.status}`,
        flow: 'VOUCHER',
        provider: 'SALESFORCE',
        notificationType: 'SELL'
      });
      expect(queueBody.templateId).toBeUndefined();
      expect(queueBody.providerConfigId).toBeUndefined();
      await expectQueueEmpty(sqs, env.queues.whatsappHospital);
      await expectNoSms(mockInfra);
    });
  }

  /**
   * Diferencia indisponibilidade técnica de uma configuração de negócio ausente,
   * evitando retries inúteis para fluxo, canal ou template não configurado.
   *
   * Regras de negócio: um 503 configuracional é definitivo; segue ao hospital,
   * não à fila de retry.
   */
  test('@local @local-only SF-R11 - hospitalizar 503 configuracional', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(503, {
      body: {
        success: false,
        message: 'Fluxo não configurado para o canal WhatsApp',
        errorMessage: 'Template não configurado'
      }
    });

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-config-503-r11'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await waitForQueueMessage(sqs, env.queues.whatsappHospital);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
  });

  /**
   * Retém a mensagem para nova tentativa quando o Salesforce não responde dentro
   * do limite operacional, sem concluir prematuramente que houve falha definitiva.
   *
   * Regras de negócio: timeout é transitório; publica retry e não aciona SMS.
   */
  test('@local @local-only SF-R12 - agendar retry após timeout do Salesforce', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(202, {
      body: {
        success: true,
        correlationId: 'sf-correlation-tardia'
      },
      fixedDelayMilliseconds: 1_200
    });

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-timeout-r12'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await waitForQueueMessage(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
    await expectNoSms(mockInfra);
  });

  /**
   * Trata uma resposta sem corpo como falha controlada, preservando a mensagem
   * para reprocessamento em vez de declarar sucesso sem evidência do provider.
   *
   * Regras de negócio: corpo vazio não é aceite; a mensagem segue para retry.
   */
  test('@local @local-only SF-R13A - agendar retry para resposta vazia', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(202, { rawBody: '' });

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-empty-response-r13'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await waitForQueueMessage(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
  });

  /**
   * Exige que o Salesforce informe explicitamente o resultado da operação antes
   * de a aplicação considerar a mensagem processada.
   *
   * Regras de negócio: ausência de success torna a resposta inválida e recuperável;
   * a mensagem segue para retry controlado.
   */
  test('@local @local-only SF-R13B - agendar retry sem indicador success', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(202, {
      body: {
        correlationId: 'sf-correlation-sem-success',
        message: 'Resposta incompleta'
      }
    });

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-missing-success-r13'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await waitForQueueMessage(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
  });

  /**
   * Impede falso positivo quando o transporte HTTP aceita a chamada, mas o
   * Salesforce declara que a mensagem não foi aceita pelo processo de negócio.
   *
   * Regras de negócio: somente 202 combinado com success=true é sucesso; um
   * 202 com success=false segue para hospital, sem retry.
   */
  test('@local @local-only SF-R14 - rejeitar 202 com success false', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceFailure(202, {
      body: {
        success: false,
        correlationId: 'sf-correlation-rejeitada',
        message: 'Solicitação rejeitada',
        errorMessage: 'Regra de negócio não atendida'
      }
    });

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-success-false-r14'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await waitForQueueMessage(sqs, env.queues.whatsappHospital);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
  });
});
