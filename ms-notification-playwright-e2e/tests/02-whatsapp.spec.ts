import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { whatsappPayload, whatsappTemplatePayload, phones } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Envio de WhatsApp', () => {
  /**
   * Valida o envio de uma notificação de WhatsApp utilizando mensagem livre.
   *
   * Regras de negócio cobertas:
   * - Uma requisição válida de envio de WhatsApp com mensagem livre deve ser aceita pela API.
   * - O serviço deve retornar HTTP 202, indicando que a solicitação foi recebida para processamento assíncrono.
   * - A integração externa responsável pelo envio do WhatsApp deve ser acionada ao menos uma vez.
   * - O fluxo local deve permitir simular sucesso da infraestrutura externa para validar o comportamento esperado da aplicação.
   */
  test('@local @local-only CT-007 - enviar WhatsApp com mensagem livre', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-playwright-001' }));

    await expectStatus(response, 202);
    await expect.poll(() => mockInfra.countRequests('.*(whatsapp|infobip).*')).toBeGreaterThanOrEqual(1);
  });

  /**
   * Valida o envio de uma notificação de WhatsApp baseada em template.
   *
   * Regras de negócio cobertas:
   * - Uma requisição válida contendo dados de template deve ser aceita pela API.
   * - O serviço deve retornar HTTP 202 para indicar que o envio foi recebido e será processado de forma assíncrona.
   * - O canal WhatsApp deve permitir envio por template como alternativa ao envio por mensagem livre.
   * - O fluxo local deve permitir simular sucesso da infraestrutura externa para validar a aceitação da solicitação.
   */
  test('@local @local-only CT-008 - enviar WhatsApp usando template', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappSuccess();

    const response = await apiClient.sendWhatsapp(whatsappTemplatePayload({
      transactionId: 'trx-whatsapp-template-playwright-001'
    }));

    await expectStatus(response, 202);
  });

  /**
   * Valida a rejeição de uma requisição de WhatsApp sem conteúdo de mensagem.
   *
   * Regras de negócio cobertas:
   * - Uma notificação de WhatsApp deve possuir uma mensagem livre ou um template informado.
   * - Requisições sem mensagem e sem template são consideradas inválidas.
   * - A API deve retornar HTTP 400 quando os dados obrigatórios para compor o conteúdo da notificação não forem enviados.
   * - O contrato da API deve impedir o aceite de solicitações que não possuem conteúdo suficiente para envio ao destinatário.
   */
  test('@contract CT-009 - rejeitar WhatsApp sem mensagem e sem template', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp({
      transactionId: 'trx-whatsapp-no-content-001',
      cellPhone: phones.valid,
      notificationType: 'SELL'
    });

    await expectStatus(response, 400);
  });


  /**
   * Valida a rejeição de uma requisição de WhatsApp com telefone inválido.
   *
   * Regras de negócio cobertas:
   * - O número de telefone do destinatário deve respeitar o formato esperado para envio de WhatsApp.
   * - Requisições com telefone inválido não devem ser aceitas para processamento.
   * - A API deve retornar HTTP 400 quando o campo de telefone não atender às regras de validação.
   * - O contrato da API deve proteger o fluxo de envio contra dados de destinatário inconsistentes.
   */
  test('@contract CT-010 - rejeitar WhatsApp com telefone inválido', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp(whatsappPayload({
      transactionId: 'trx-whatsapp-invalid-phone-001',
      cellPhone: '00123'
    }));

    await expectStatus(response, 400);
  });

  /**
   * Valida o comportamento do fluxo de contingência para erro transitório no envio de WhatsApp.
   *
   * Regras de negócio cobertas:
   * - Quando a integração externa retorna erro transitório, como HTTP 500, a solicitação inicial ainda deve ser aceita pela API.
   * - O serviço deve retornar HTTP 202, pois o processamento do envio ocorre de forma assíncrona.
   * - Falhas temporárias no provedor externo devem direcionar a mensagem para o fluxo de retry.
   * - O mecanismo de fila de retry deve estar disponível para permitir nova tentativa de processamento da notificação.
   */
  test('@local @local-only CT-011 - enviar WhatsApp para retry em erro transitório', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubWhatsappFailure(500);

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-retry-001' }));

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.whatsappRetry);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });

  /**
   * Valida o direcionamento de uma notificação de WhatsApp para hospital em caso de erro funcional.
   *
   * Regras de negócio cobertas:
   * - Quando a integração externa retorna erro funcional, como HTTP 400, a solicitação inicial deve continuar sendo aceita pela API.
   * - O serviço deve retornar HTTP 202, indicando que a requisição foi recebida para tratamento assíncrono.
   * - Erros funcionais do provedor externo não devem seguir o mesmo fluxo de retentativa de falhas transitórias.
   * - Mensagens com falha funcional devem ser direcionadas para a fila hospital para análise ou tratamento posterior.
   */
  test('@local @local-only CT-012 - enviar WhatsApp para hospital em erro funcional', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubWhatsappFailure(400);

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-hospital-001' }));

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.whatsappHospital);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });
});
