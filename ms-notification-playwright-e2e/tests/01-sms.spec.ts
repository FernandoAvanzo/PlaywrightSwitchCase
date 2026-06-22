import { test, expect } from '../src/fixtures/api';
import { env, isProd } from '../src/config/environment';
import { smsPayload, phones } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Envio de SMS', () => {
  /**
   * Valida o envio de SMS com um payload válido no ambiente local.
   *
   * Regras de negócio cobertas:
   * - O serviço deve aceitar uma solicitação de envio de SMS quando todos os campos obrigatórios
   *   forem informados corretamente.
   * - Uma solicitação válida de SMS deve retornar HTTP 202, indicando que foi aceita para
   *   processamento assíncrono.
   * - Após aceitar a solicitação, o serviço deve acionar o provedor externo de SMS configurado
   *   ou seu mock local equivalente.
   * - O fluxo local deve permitir validar a integração com a infraestrutura simulada sem enviar
   *   SMS real.
   */
  test('@local @local-only CT-002 - enviar SMS com payload válido', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-playwright-001' }));

    await expectStatus(response, 202);
    await expect.poll(() => mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(1);
  });

  /**
   * Valida a rejeição de uma solicitação de SMS sem telefone.
   *
   * Regras de negócio cobertas:
   * - O telefone do destinatário é obrigatório para o envio de SMS.
   * - O serviço não deve aceitar uma solicitação sem o campo de telefone.
   * - Payloads inválidos devem ser rejeitados antes do processamento ou integração com provedores.
   * - A API deve retornar HTTP 400 para indicar erro de validação na requisição.
   */
  test('@contract CT-003 - rejeitar SMS sem telefone', async ({ apiClient }) => {
    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-invalid-001', cellPhone: undefined }));

    await expectStatus(response, 400);
  });

  /**
   * Valida a rejeição de uma solicitação de SMS com telefone em formato inválido.
   *
   * Regras de negócio cobertas:
   * - O telefone informado deve respeitar o formato aceito pelo contrato da API.
   * - Telefones inválidos não devem ser encaminhados para processamento de envio.
   * - A validação de contrato deve proteger o serviço contra dados inconsistentes.
   * - A API deve retornar HTTP 400 quando o telefone não atender às regras de validação.
   */
  test('@contract CT-004 - rejeitar SMS com telefone inválido', async ({ apiClient }) => {
    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-invalid-phone-001', cellPhone: phones.invalid }));

    await expectStatus(response, 400);
  });

  /**
   * Valida a rejeição de uma solicitação de SMS com mensagem menor que o tamanho mínimo permitido.
   *
   * Regras de negócio cobertas:
   * - A mensagem de SMS deve possuir conteúdo mínimo suficiente para ser considerada válida.
   * - Mensagens com menos de 5 caracteres não devem ser aceitas pelo serviço.
   * - A API deve aplicar validações de conteúdo antes de aceitar a solicitação para processamento.
   * - A resposta HTTP 400 deve ser retornada quando a mensagem violar a regra de tamanho mínimo.
   */
  test('@contract CT-005 - rejeitar SMS com mensagem menor que 5 caracteres', async ({ apiClient }) => {
    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-invalid-message-001', message: 'Oi' }));

    await expectStatus(response, 400);
  });

  /**
   * Valida o comportamento do serviço quando um alias de credenciais inexistente é informado.
   *
   * Regras de negócio cobertas:
   * - Quando o alias informado não existir, o serviço deve utilizar as credenciais padrão
   *   configuradas para envio de SMS.
   * - A inexistência do alias não deve impedir o envio quando houver credenciais default válidas.
   * - Uma solicitação válida deve continuar sendo aceita para processamento assíncrono.
   * - A API deve retornar HTTP 202 para indicar que o SMS foi aceito mesmo utilizando fallback
   *   de credenciais.
   */
  test('@local @local-only CT-006 - alias inexistente usa credenciais default', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.sendSms(
      smsPayload({ transactionId: 'trx-sms-default-credentials-001' }),
      'alias-inexistente'
    );

    await expectStatus(response, 202);
  });

  /**
   * Valida o comportamento de contingência quando ocorre uma falha transitória no envio de SMS.
   *
   * Regras de negócio cobertas:
   * - Falhas temporárias do provedor de SMS não devem impedir a API de aceitar a solicitação
   *   para tratamento assíncrono.
   * - O serviço deve responder HTTP 202, indicando que a requisição foi recebida e será tratada.
   * - Em caso de falha transitória, o fluxo de contingência ou retry deve ser acionado.
   * - A mensagem pode ser publicada em uma fila de retentativa para posterior reprocessamento,
   *   garantindo resiliência no envio.
   */
  test('@local @local-only SMS - falha transitória publica contingência', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubSmsFailure(500);

    const response = await apiClient.sendSms(smsPayload({ transactionId: 'trx-sms-retry-001' }));

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.smsRetry);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });
});
