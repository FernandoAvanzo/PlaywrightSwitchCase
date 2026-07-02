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

  test('@contract CT-009 - rejeitar WhatsApp sem mensagem e sem template', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp({
      transactionId: 'trx-whatsapp-no-content-001',
      cellPhone: phones.valid,
      notificationType: 'SELL'
    });

    await expectStatus(response, 400);
  });

  test('@contract CT-010 - rejeitar WhatsApp com telefone inválido', async ({ apiClient }) => {
    const response = await apiClient.sendWhatsapp(whatsappPayload({
      transactionId: 'trx-whatsapp-invalid-phone-001',
      cellPhone: '00123'
    }));

    await expectStatus(response, 400);
  });

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
