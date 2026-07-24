import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { blipAccounts, whatsappPayload, whatsappTemplatePayload, phones } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';
import {
  headerValues,
  requestJson,
  type LoggedRequest,
  type MockInfraClient
} from '../src/clients/mock-infra-client';

type BlipCommandBody = {
  to?: string;
  method?: string;
  uri?: string;
};

type BlipMessageBody = {
  to?: string;
  type?: string;
  content?: {
    type?: string;
    template?: {
      namespace?: string;
      name?: string;
      language?: {
        code?: string;
        policy?: string;
      };
      components?: Array<{
        type?: string;
        parameters?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    };
  };
};

async function waitForRequestCount(mockInfra: MockInfraClient, urlPattern: string, expected: number): Promise<void> {
  await expect.poll(async () => mockInfra.countRequests(urlPattern), { timeout: 15_000 }).toBe(expected);
}

async function waitForAtLeastOneRequest(mockInfra: MockInfraClient, urlPattern: string): Promise<void> {
  await expect.poll(async () => mockInfra.countRequests(urlPattern), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
}

function expectBlipAuthorization(request: LoggedRequest): void {
  const authorization = headerValues(request, 'Authorization');

  expect(authorization).toHaveLength(1);
  expect(authorization[0]).toMatch(/^Key .+/);
  expect(authorization[0]).not.toMatch(/^Bearer /);
  expect(headerValues(request, 'X-Account-Id')).toEqual([]);
}

test.describe('Envio de WhatsApp via BLiP', () => {
  /**
   * Garante o envio de uma notificação de WhatsApp com o template comercial padrão do Vale Gás.
   *
   * Objetivo do teste: validar o fluxo completo de descoberta do destinatário e despacho da
   * mensagem quando o consumidor informa conteúdo textual em um payload válido.
   *
   * Regras de negócio e cobertura:
   * - Uma solicitação válida deve ser aceita de forma assíncrona com HTTP 202.
   * - O telefone deve ser consultado no BLiP antes do envio ao `alternativeAccount` retornado.
   * - O conteúdo deve usar o template padrão `vale_gas_codigo_venda`.
   * - Comandos e mensagens devem usar a credencial `Key`, sem token Bearer ou cabeçalho de conta.
   */
  test('@local @local-only CT-007 - enviar WhatsApp com payload message usando template BLiP default', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipSuccessWithAlternativeAccount();

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-playwright-001' }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 1);

    const commandRequest = (await mockInfra.findRequests('/commands'))[0];
    const messageRequest = (await mockInfra.findRequests('/messages'))[0];
    const commandBody = requestJson<BlipCommandBody>(commandRequest);
    const messageBody = requestJson<BlipMessageBody>(messageRequest);

    expectBlipAuthorization(commandRequest);
    expectBlipAuthorization(messageRequest);
    expect(commandBody.to).toBe('postmaster@wa.gw.msging.net');
    expect(commandBody.method).toBe('get');
    expect(commandBody.uri).toBe('lime://wa.gw.msging.net/accounts/+5511988881234');
    expect(messageBody.to).toBe(blipAccounts.alternativeAccount);
    expect(messageBody.type).toBe('application/json');
    expect(messageBody.content?.type).toBe('template');
    expect(messageBody.content?.template?.name).toBe('vale_gas_codigo_venda');
  });

  /**
   * Preserva a composição determinística de templates de WhatsApp com variáveis de negócio ordenadas.
   *
   * Objetivo do teste: assegurar que os parâmetros numerados sejam enviados ao BLiP na ordem
   * esperada pelo template, independentemente da ordem em que chegam no objeto de entrada.
   *
   * Regras de negócio e cobertura:
   * - O template deve manter namespace, nome, idioma `pt_BR` e política determinística válidos.
   * - As variáveis `1` e `2` devem compor o corpo respectivamente como `first` e `second`.
   * - O provedor deve receber um conteúdo do tipo `template` após a API aceitar a solicitação.
   */
  test('@local @local-only CT-008 - enviar WhatsApp usando template BLiP com parâmetros ordenados', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipSuccessWithAlternativeAccount();

    const response = await apiClient.sendWhatsapp(whatsappTemplatePayload({
      transactionId: 'trx-whatsapp-template-playwright-001',
      templateVariables: {
        '2': 'second',
        '1': 'first'
      }
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, '/messages', 1);

    const messageRequest = (await mockInfra.findRequests('/messages'))[0];
    const messageBody = requestJson<BlipMessageBody>(messageRequest);
    const template = messageBody.content?.template;
    const parameters = template?.components?.[0]?.parameters?.map((parameter) => parameter.text);

    expect(messageBody.content?.type).toBe('template');
    expect(template?.namespace).toBeTruthy();
    expect(template?.name).toBe('vale_gas_codigo_venda');
    expect(template?.language?.code).toBe('pt_BR');
    expect(template?.language?.policy).toBe('deterministic');
    expect(template?.components?.[0]?.type).toBe('body');
    expect(parameters).toEqual(['first', 'second']);
  });

  /**
   * Mantém a entrega do WhatsApp quando o BLiP não fornece uma conta alternativa para o destinatário.
   *
   * Objetivo do teste: comprovar que a identidade principal retornada pelo lookup funciona como
   * destino de contingência e evita a perda de uma notificação válida.
   *
   * Regras de negócio e cobertura:
   * - A ausência de `alternativeAccount` não deve impedir o envio quando houver `identity`.
   * - A mensagem deve ser direcionada exatamente para a identidade resolvida pelo BLiP.
   * - A solicitação deve permanecer aceita com HTTP 202 e gerar um único despacho.
   */
  test('@local @local-only BLIP-001 - usar identity quando BLiP não retornar alternativeAccount', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipSuccessWithIdentity(blipAccounts.identity);

    const response = await apiClient.sendWhatsapp(whatsappTemplatePayload({
      transactionId: 'trx-whatsapp-identity-destination-001'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, '/messages', 1);

    const messageRequest = (await mockInfra.findRequests('/messages'))[0];
    const messageBody = requestJson<BlipMessageBody>(messageRequest);

    expect(messageBody.to).toBe(blipAccounts.identity);
  });

  /**
   * Evita o envio de uma mensagem de WhatsApp sem destinatário válido após a consulta ao BLiP.
   *
   * Objetivo do teste: validar que o serviço interrompe o despacho ao provedor quando o lookup
   * não retorna `alternativeAccount` nem `identity`, protegendo a operação contra destino inválido.
   *
   * Regras de negócio e cobertura:
   * - A consulta de conta deve ocorrer uma única vez para o telefone informado.
   * - Nenhuma chamada de mensagem deve ser feita sem um destino resolvido.
   * - O recebimento assíncrono da solicitação continua representado por HTTP 202.
   */
  test('@local @local-only BLIP-002 - lookup sem destino não envia template', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubBlipLookupWithoutDestination();
    await mockInfra.stubBlipMessageSuccess();

    const response = await apiClient.sendWhatsapp(whatsappTemplatePayload({
      transactionId: 'trx-whatsapp-destination-missing-001'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, '/commands', 1);
    await waitForRequestCount(mockInfra, '/messages', 0);
  });

  /**
   * Impede a criação de notificações de WhatsApp sem conteúdo comunicável ao consumidor.
   *
   * Objetivo do teste: validar a barreira contratual que exige uma mensagem textual ou um
   * template antes que a solicitação entre no fluxo de processamento.
   *
   * Regras de negócio e cobertura:
   * - Toda notificação de WhatsApp deve informar `message` ou dados de template.
   * - Payload sem as duas formas de conteúdo deve ser rejeitado com HTTP 400.
   * - A validação antecipada evita aceitar uma comunicação que não pode ser materializada.
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
   * Protege o canal de WhatsApp contra tentativas de envio para números fora do padrão aceito.
   *
   * Objetivo do teste: confirmar que um telefone inválido é rejeitado no contrato de entrada,
   * antes de qualquer tentativa de comunicação com o provedor.
   *
   * Regras de negócio e cobertura:
   * - O destinatário deve possuir um número compatível com a regra de telefonia do serviço.
   * - O número `00123` não representa um destino comercial válido.
   * - A API deve responder com HTTP 400 para dados de contato inconsistentes.
   */
  test('@contract CT-010 - rejeitar WhatsApp com telefone inválido', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp(whatsappPayload({
      transactionId: 'trx-whatsapp-invalid-phone-001',
      cellPhone: '00123'
    }));

    await expectStatus(response, 400);
  });

  /**
   * Preserva a oportunidade de entrega diante de uma indisponibilidade temporária do BLiP.
   *
   * Objetivo do teste: comprovar que uma falha HTTP 503, após a resolução do destinatário,
   * agenda reprocessamento assíncrono em vez de encerrar definitivamente a comunicação.
   *
   * Regras de negócio e cobertura:
   * - A API deve aceitar a solicitação com HTTP 202 mesmo com falha transitória do provedor.
   * - O fluxo deve efetivamente tentar o lookup e o envio da mensagem.
   * - A notificação deve ser publicada na fila de retry do WhatsApp para nova tentativa.
   */
  test('@local @local-only CT-011 - erro BLiP transitório agenda retry', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(503);

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-retry-001' }));

    await expectStatus(response, 202);
    await waitForAtLeastOneRequest(mockInfra, '/commands');
    await waitForAtLeastOneRequest(mockInfra, '/messages');
    await expect.poll(async () => (await sqs.receive(env.queues.whatsappRetry)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
  });

  /**
   * Direciona falhas definitivas do BLiP para tratamento operacional sem retentativa automática indevida.
   *
   * Objetivo do teste: validar que uma rejeição funcional HTTP 400 é registrada na fila hospital
   * após a tentativa de envio, permitindo análise e correção do evento.
   *
   * Regras de negócio e cobertura:
   * - A entrada assíncrona deve responder HTTP 202, separando aceite técnico do resultado do provedor.
   * - O serviço deve executar o lookup e tentar enviar a mensagem antes de classificar a falha.
   * - Erros funcionais devem ser publicados na fila hospital do WhatsApp.
   */
  test('@local @local-only CT-012 - erro BLiP funcional envia para hospital', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubBlipLookupWithAlternativeAccount();
    await mockInfra.stubBlipMessageFailure(400);

    const response = await apiClient.sendWhatsapp(whatsappPayload({ transactionId: 'trx-whatsapp-hospital-001' }));

    await expectStatus(response, 202);
    await waitForAtLeastOneRequest(mockInfra, '/commands');
    await waitForAtLeastOneRequest(mockInfra, '/messages');
    await expect.poll(async () => (await sqs.receive(env.queues.whatsappHospital)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
  });
});
