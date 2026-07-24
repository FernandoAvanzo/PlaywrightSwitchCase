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
  /**
   * Prioriza o WhatsApp na entrega do código de Vale Gás e evita comunicação duplicada.
   *
   * Objetivo do teste: confirmar que o sucesso do canal primário encerra o fluxo sem acionar
   * o SMS configurado exclusivamente como contingência.
   *
   * Regras de negócio e cobertura:
   * - WhatsApp deve ser o canal primário e SMS o fallback do Voucher adhoc.
   * - O aceite do BLiP deve resultar em `ACCEPTED` e `sentChannel=WHATSAPP`.
   * - O lookup e o envio ao BLiP devem ocorrer uma vez, sem qualquer chamada ao provedor de SMS.
   */
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

  /**
   * Garante a entrega do Vale Gás por SMS quando o WhatsApp sofre uma rejeição definitiva.
   *
   * Objetivo do teste: validar a continuidade da comunicação ao cliente por meio do canal
   * secundário após uma falha funcional HTTP 400 no BLiP.
   *
   * Regras de negócio e cobertura:
   * - A falha do WhatsApp deve ser hospitalizada e não encerrar o fluxo adhoc.
   * - O SMS de contingência deve ser enviado e aceito uma única vez.
   * - A resposta deve indicar `FALLBACK_SENT`, `sentChannel=SMS` e os status dos dois canais.
   */
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

  /**
   * Expõe a falha total de comunicação quando os canais primário e secundário não concluem o envio.
   *
   * Objetivo do teste: garantir que a API não sinalize sucesso quando o BLiP rejeita a mensagem
   * e o provedor de SMS também falha durante a contingência.
   *
   * Regras de negócio e cobertura:
   * - A falha funcional do WhatsApp deve permanecer classificada para tratamento em hospital.
   * - O SMS deve ser tentado e seu insucesso precisa compor o resultado do fluxo.
   * - O estado consolidado deve ser `FALLBACK_FAILED`, com rastreabilidade dos dois canais.
   */
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

  /**
   * Evita duplicidade de entrega enquanto uma falha temporária do WhatsApp ainda pode ser recuperada.
   *
   * Objetivo do teste: confirmar que um HTTP 503 do BLiP prioriza o retry do canal principal
   * e não dispara SMS imediatamente.
   *
   * Regras de negócio e cobertura:
   * - A tentativa de lookup e envio ao BLiP deve ocorrer normalmente.
   * - O resultado deve ser `RETRY_SCHEDULED`, sem canal concluído nem status de fallback.
   * - O provedor de SMS não deve receber chamadas durante a janela de reprocessamento do WhatsApp.
   */
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

  /**
   * Mantém o contrato simplificado para consumidores que omitem a estratégia de canais no payload.
   *
   * Objetivo do teste: validar a aplicação automática da política padrão de comunicação do
   * Voucher adhoc sem exigir configuração explícita do cliente.
   *
   * Regras de negócio e cobertura:
   * - Na ausência dos canais, WhatsApp deve ser assumido como primário e SMS como fallback.
   * - Com o BLiP disponível, o envio deve ser concluído pelo WhatsApp.
   * - A resposta HTTP 202 deve apresentar os canais efetivamente resolvidos pelo serviço.
   */
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

  /**
   * Preserva o código do Vale Gás no SMS de contingência quando a entrada contém somente template.
   *
   * Objetivo do teste: assegurar que as variáveis do template forneçam conteúdo suficiente para
   * construir a mensagem alternativa após uma rejeição do WhatsApp.
   *
   * Regras de negócio e cobertura:
   * - A falha funcional do BLiP deve acionar o fallback SMS.
   * - O código `778899` deve ser extraído das variáveis e estar presente no corpo enviado por SMS.
   * - O resultado consolidado deve indicar `FALLBACK_SENT` e `sentChannel=SMS`.
   */
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

  /**
   * Garante a entrega por SMS quando o BLiP não consegue resolver um destinatário de WhatsApp.
   *
   * Objetivo do teste: validar que a ausência de destino no lookup é tratada como falha funcional
   * do canal primário, sem tentativa inválida de template e com acionamento da contingência.
   *
   * Regras de negócio e cobertura:
   * - O lookup deve ocorrer, mas nenhuma chamada a `/messages` deve ser realizada sem destino.
   * - O status primário deve ser `HOSPITAL_SCHEDULED`.
   * - O SMS deve ser enviado e o fluxo deve terminar como `FALLBACK_SENT`.
   */
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

  /**
   * Impede o processamento de um Voucher adhoc sem o identificador que vincula a comunicação ao Vale Gás.
   *
   * Objetivo do teste: confirmar que `voucherId` é obrigatório para rastrear e compor corretamente
   * a notificação antes de qualquer tentativa de envio.
   *
   * Regras de negócio e cobertura:
   * - Todo pedido adhoc deve informar um `voucherId`.
   * - A ausência do identificador deve ser rejeitada na validação de contrato.
   * - A API deve responder com HTTP 400 para o payload incompleto.
   */
  test('@contract CT-018 - rejeitar voucher adhoc sem voucherId', async ({ apiClient }) => {
    const payload = voucherAdhocPayload({ transactionId: 'trx-voucher-no-id-001' });
    delete (payload as Record<string, unknown>).voucherId;

    const response = await apiClient.sendVoucherAdhoc(payload);

    await expectStatus(response, 400);
  });

  /**
   * Protege a ordem de canais definida para o fluxo adhoc de Vale Gás.
   *
   * Objetivo do teste: validar que consumidores não podem substituir o WhatsApp pelo SMS como
   * canal primário, preservando a estratégia comercial configurada para esse fluxo.
   *
   * Regras de negócio e cobertura:
   * - O único canal primário aceito para Voucher adhoc é `WHATSAPP`.
   * - Configurar `SMS` como primário viola o contrato mesmo quando o fallback também é SMS.
   * - A combinação inválida deve retornar HTTP 400.
   */
  test('@contract CT-019 - rejeitar canal primário diferente de WhatsApp', async ({ apiClient }) => {
    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-invalid-primary-001',
      primaryChannel: 'SMS',
      fallbackChannel: 'SMS'
    }));

    await expectStatus(response, 400);
  });

  /**
   * Mantém o SMS como único canal de contingência permitido para o Voucher adhoc.
   *
   * Objetivo do teste: impedir configurações que repetem o WhatsApp como fallback e, portanto,
   * não oferecem uma alternativa real para entregar o código ao cliente.
   *
   * Regras de negócio e cobertura:
   * - O canal primário deve ser `WHATSAPP` e o fallback deve ser `SMS`.
   * - `WHATSAPP` não é aceito como canal secundário nesse contrato.
   * - A API deve rejeitar a estratégia inválida com HTTP 400.
   */
  test('@contract CT-020 - rejeitar fallback diferente de SMS', async ({ apiClient }) => {
    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-voucher-invalid-fallback-001',
      primaryChannel: 'WHATSAPP',
      fallbackChannel: 'WHATSAPP'
    }));

    await expectStatus(response, 400);
  });
});
