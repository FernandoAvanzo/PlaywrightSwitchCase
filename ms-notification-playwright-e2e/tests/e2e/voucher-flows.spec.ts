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
  /**
   * Valida ponta a ponta a entrega prioritária do Vale Gás por WhatsApp.
   *
   * Objetivo do teste: confirmar que, com o BLiP disponível, todo o fluxo adhoc conclui no
   * canal primário sem gerar comunicação duplicada por SMS.
   *
   * Regras de negócio e cobertura:
   * - A API deve aceitar a solicitação e retornar estado `ACCEPTED`.
   * - Lookup e envio ao BLiP devem acontecer uma vez e definir `sentChannel=WHATSAPP`.
   * - O canal de contingência SMS deve permanecer inativo após o sucesso primário.
   */
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

  /**
   * Valida ponta a ponta a continuidade da entrega quando o WhatsApp é rejeitado.
   *
   * Objetivo do teste: comprovar que uma falha funcional do BLiP aciona o SMS de contingência
   * e ainda permite comunicar o código do Vale Gás ao cliente.
   *
   * Regras de negócio e cobertura:
   * - O WhatsApp deve ser tentado e sua falha deve ser classificada para hospital.
   * - O SMS deve ser acionado e aceito como canal efetivamente enviado.
   * - O resultado deve consolidar `FALLBACK_SENT` e os status de ambos os canais.
   */
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

  /**
   * Valida ponta a ponta a sinalização de indisponibilidade total dos canais do Voucher adhoc.
   *
   * Objetivo do teste: assegurar que o sistema exponha um resultado de falha quando a rejeição
   * do WhatsApp é seguida pelo insucesso do SMS de contingência.
   *
   * Regras de negócio e cobertura:
   * - O SMS deve ser tentado depois da falha funcional do BLiP.
   * - O estado primário deve preservar o agendamento em hospital.
   * - A resposta consolidada deve ser `FALLBACK_FAILED`, sem mascarar o insucesso da entrega.
   */
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

  /**
   * Valida ponta a ponta a política de recuperação do WhatsApp antes de usar o canal secundário.
   *
   * Objetivo do teste: confirmar que uma indisponibilidade transitória do BLiP agenda retry e
   * evita um SMS imediato que poderia duplicar a comunicação após a recuperação.
   *
   * Regras de negócio e cobertura:
   * - Lookup e tentativa de envio ao BLiP devem ocorrer uma vez.
   * - O fluxo deve retornar `RETRY_SCHEDULED`, sem `sentChannel` ou status de fallback.
   * - Nenhuma requisição de SMS deve ser produzida enquanto o WhatsApp aguarda reprocessamento.
   */
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
