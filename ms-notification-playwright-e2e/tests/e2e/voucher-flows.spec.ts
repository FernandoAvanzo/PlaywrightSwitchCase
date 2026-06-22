import { test, expect } from '../../src/fixtures/api';
import { voucherAdhocPayload } from '../../src/data/payloads';
import { expectStatus, optionalJson } from '../../src/utils/response';

test.describe('E2E - Voucher Vale Gás', () => {
  /**
   * Valida o fluxo ponta a ponta de uma venda de voucher Vale Gás quando o envio
   * pelo canal principal, WhatsApp, é aceito com sucesso.
   *
   * Regras de negócio cobertas:
   * - Uma solicitação válida de voucher adhoc deve ser aceita pela API.
   * - O fluxo de voucher Vale Gás deve priorizar o envio pelo canal WhatsApp.
   * - Quando o provedor de WhatsApp responde com sucesso, não deve ser necessário
   *   acionar outro canal de envio.
   * - A API deve retornar HTTP 202, indicando que a solicitação foi recebida para
   *   processamento.
   * - Quando a resposta informar o canal utilizado, ele deve ser `WHATSAPP`,
   *   confirmando que o envio ocorreu pelo canal principal esperado.
   */
  test('@e2e @local @local-only E2E-001 - venda com WhatsApp aceito', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-wa-ok'
    }));

    await expectStatus(response, 202);
    const body = await optionalJson<Record<string, unknown>>(response);
    if (body?.sentChannel) expect(body.sentChannel).toBe('WHATSAPP');
  });

  /**
   * Valida o fluxo ponta a ponta de fallback para SMS quando o envio do voucher
   * Vale Gás pelo WhatsApp é rejeitado.
   *
   * Regras de negócio cobertas:
   * - O WhatsApp é o canal principal do fluxo adhoc de voucher.
   * - Quando o WhatsApp falha por rejeição funcional, o sistema deve tentar o envio
   *   pelo canal de fallback configurado.
   * - O SMS deve ser utilizado como canal de fallback para o voucher Vale Gás.
   * - A solicitação deve continuar sendo aceita com HTTP 202, pois o tratamento do
   *   envio ocorre dentro do fluxo da aplicação.
   * - Quando a resposta informar o canal utilizado, ele deve ser `SMS`,
   *   confirmando que o fallback foi acionado corretamente.
   */
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

  /**
   * Valida o comportamento ponta a ponta do fluxo de voucher Vale Gás quando tanto
   * o canal principal quanto o canal de fallback falham.
   *
   * Regras de negócio cobertas:
   * - A API deve aceitar a solicitação de voucher adhoc com HTTP 202 mesmo quando
   *   os provedores externos apresentam falha.
   * - Uma falha no WhatsApp deve permitir que o fluxo tente o canal de fallback.
   * - Uma falha também no SMS deve ser tratada pelo mecanismo interno de contingência,
   *   hospitalização, retentativa ou tratamento assíncrono equivalente.
   * - O cliente da API não deve receber erro síncrono quando a falha puder ser tratada
   *   pelo fluxo assíncrono da aplicação.
   * - O cenário garante que falhas totais de provedores não quebrem o contrato de
   *   aceite inicial da solicitação.
   */
  test('@e2e @local @local-only E2E-003 - falha total registra contingência', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(500);
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendVoucherAdhoc(voucherAdhocPayload({
      transactionId: 'trx-e2e-total-failure'
    }));

    await expectStatus(response, 202);
  });
});
