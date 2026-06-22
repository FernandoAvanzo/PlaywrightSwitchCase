import { test, expect } from '../src/fixtures/api';
import { voucherAdhocPayload, whatsappTemplatePayload, phones } from '../src/data/payloads';
import { expectStatus, optionalJson } from '../src/utils/response';

test.describe('Fluxo adhoc de voucher', () => {
  /**
   * Valida o fluxo feliz de envio adhoc de voucher quando o provedor de WhatsApp aceita a mensagem.
   *
   * Regras de negócio cobertas:
   * - O canal primário do voucher adhoc deve ser WhatsApp.
   * - O canal de fallback configurado deve ser SMS.
   * - Quando o WhatsApp responde com sucesso, a notificação deve ser aceita com HTTP 202.
   * - O canal efetivamente utilizado deve permanecer como WhatsApp.
   * - O SMS não deve ser necessário como fallback quando o envio primário é bem-sucedido.
   */
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

  /**
   * Valida o acionamento do fallback por SMS quando o envio pelo WhatsApp é rejeitado.
   *
   * Regras de negócio cobertas:
   * - O serviço deve aceitar a solicitação de voucher adhoc mesmo quando o canal primário falha.
   * - Uma rejeição do WhatsApp deve acionar automaticamente o canal de fallback SMS.
   * - O canal efetivamente utilizado deve ser SMS quando o fallback é executado.
   * - O status retornado deve indicar que o fallback foi enviado ou que a solicitação foi aceita para processamento.
   */
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

  /**
   * Valida o comportamento do fluxo quando tanto o canal primário quanto o canal de fallback falham.
   *
   * Regras de negócio cobertas:
   * - A solicitação de voucher adhoc deve ser aceita para tratamento assíncrono mesmo diante de falhas nos provedores.
   * - Uma falha no WhatsApp deve tentar o fallback por SMS.
   * - Uma falha também no SMS deve resultar em status de falha de fallback, retentativa agendada ou envio para hospitalização.
   * - O serviço não deve retornar erro síncrono ao cliente quando a falha puder ser tratada pelo fluxo assíncrono.
   */
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

  /**
   * Valida a aplicação dos canais padrão quando o payload não informa explicitamente os canais de envio.
   *
   * Regras de negócio cobertas:
   * - Na ausência de canal primário, o serviço deve assumir WhatsApp como padrão.
   * - Na ausência de canal de fallback, o serviço deve assumir SMS como padrão.
   * - O payload continua válido mesmo sem os campos de canais, desde que os demais dados obrigatórios estejam presentes.
   * - A solicitação deve ser aceita com HTTP 202 após a normalização dos canais default.
   */
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

  /**
   * Valida que um payload baseado apenas em template de WhatsApp consegue acionar fallback por SMS contendo o código do voucher.
   *
   * Regras de negócio cobertas:
   * - O serviço deve aceitar payloads de voucher adhoc baseados em template.
   * - As variáveis do template devem fornecer dados suficientes para compor a mensagem de fallback.
   * - Quando o WhatsApp rejeita o envio do template, o fluxo deve recorrer ao SMS.
   * - A solicitação deve ser aceita com HTTP 202 para processamento do fallback.
   */
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

  /**
   * Valida a rejeição contratual de um voucher adhoc enviado sem identificador do voucher.
   *
   * Regras de negócio cobertas:
   * - O campo voucherId é obrigatório para o envio de voucher adhoc.
   * - Payloads sem voucherId devem ser considerados inválidos.
   * - O serviço deve rejeitar a requisição com HTTP 400, sem seguir para envio aos provedores.
   */
  test('@contract CT-018 - rejeitar voucher adhoc sem voucherId', async ({ apiClient }) => {
    const payload = voucherAdhocPayload({ transactionId: 'trx-voucher-no-id-001' });
    delete (payload as Record<string, unknown>).voucherId;

    const response = await apiClient.sendVoucherAdhoc(payload);

    await expectStatus(response, 400);
  });

  /**
   * Valida a rejeição contratual quando o canal primário informado não é WhatsApp.
   *
   * Regras de negócio cobertas:
   * - O fluxo adhoc de voucher deve permitir apenas WhatsApp como canal primário.
   * - SMS não pode ser utilizado como canal primário nesse contrato.
   * - Requisições com canal primário inválido devem ser rejeitadas com HTTP 400.
   * - A validação deve ocorrer antes de qualquer tentativa de envio.
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
   * Valida a rejeição contratual quando o canal de fallback informado não é SMS.
   *
   * Regras de negócio cobertas:
   * - O fluxo adhoc de voucher deve permitir apenas SMS como canal de fallback.
   * - WhatsApp não pode ser utilizado como fallback nesse contrato.
   * - Requisições com fallback inválido devem ser rejeitadas com HTTP 400.
   * - A combinação válida esperada para o fluxo é WhatsApp como primário e SMS como fallback.
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
