import { request as apiRequest, expect, test } from '@playwright/test';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import {
  VoucherBatchBlockPayload,
  VoucherBatchOperation,
  voucherBatchOperationSchema
} from '../../src/api/voucherBatchOperations.js';
import { WireMockClient } from '../../src/api/wiremockClient.js';
import { loadEnv } from '../../src/config/env.js';
import { configuredVoucherBatchPayload } from '../../src/data/payloadBuilders.js';
import {
  blockProdMutation,
  skipWhenMissing,
  skipWhenMutatingE2EDisabled,
  skipWhenMutationNotAllowed
} from '../../src/utils/guards.js';
import {
  expectInitialVoucherBatchOperation,
  expectPublicVoucherBatchContract,
  readVoucherBatchOperation,
  voucherBatchItem,
  waitForVoucherBatchCompletion
} from '../../src/utils/voucherBatch.js';

const env = loadEnv();

const PT_422007 = 'Não foi possível obter vouchers o suficiente.';
const PT_500000 = 'Erro interno do servidor.';

async function createAndWait(
  client: MsVoucherClient,
  scenario: string,
  vouchers: string[],
  overrides: Partial<VoucherBatchBlockPayload> = {}
): Promise<{ payload: VoucherBatchBlockPayload; operation: VoucherBatchOperation }> {
  const payload = configuredVoucherBatchPayload(env, scenario, vouchers, overrides);
  const initial = await test.step('Criar a operação e validar o contrato inicial', async () => {
    const operation = await readVoucherBatchOperation(await client.createVoucherBatchBlock(payload), 201);
    expectInitialVoucherBatchOperation(operation, payload);
    return operation;
  });

  const operation = await test.step('Aguardar operação e itens em estado terminal', async () =>
    waitForVoucherBatchCompletion(client, initial.id, {
      acceptLanguage: 'pt-BR',
      timeoutMs: env.batch.pollTimeoutMs,
      intervalMs: env.batch.pollIntervalMs
    }));

  return { payload, operation };
}

test.describe('Regras do bloqueio em lote 422.007/422.062 | @batch @e2e @mutating', () => {
  test.beforeEach(() => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
    skipWhenMissing({
      BATCH_CODE_RESALE: env.batch.codeResale,
      BATCH_ADDRESS_VALIDATION: env.batch.addressValidation,
      BATCH_DOCUMENT_RESALE: env.batch.documentResale,
      BATCH_PRODUCT_CODE: env.batch.productCode,
      BATCH_CONSUMER_DOCUMENT: env.batch.consumerDocument,
      BATCH_CONSUMER_PHONE_NUMBER: env.batch.consumerPhoneNumber
    }, 'Contexto base do bloqueio em lote não configurado.');
  });

  test('E2E-422007-001 | Estoque insuficiente deve ser falha funcional 422.007', async ({ request }) => {
    skipWhenMissing({ BATCH_VOUCHER_INSUFFICIENT_STOCK: env.batch.voucherInsufficientStock });
    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(client, 'INSUFFICIENT-STOCK', [env.batch.voucherInsufficientStock]);
    const item = voucherBatchItem(operation, env.batch.voucherInsufficientStock);

    expect(operation.status).toBe('COMPLETED');
    expect(item.status).toBe('ERROR');
    expect(item.message).toBe(PT_422007);
    expect(item.message).not.toContain('Latitude/Longitude');
    expect(item.message).not.toBe(PT_500000);
  });

  test('E2E-SUCCESS-001 | Estoque suficiente deve concluir somente o item solicitado', async ({ request }) => {
    skipWhenMissing({ BATCH_VOUCHER_SUCCESS: env.batch.voucherSuccess });
    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(client, 'SUCCESS', [env.batch.voucherSuccess]);
    const item = voucherBatchItem(operation, env.batch.voucherSuccess);

    expect(operation.status).toBe('COMPLETED');
    expect(operation.items).toHaveLength(1);
    expect(item.status).toBe('COMPLETED');
    expect(item.message).toContain('Vale bloqueado com sucesso.');
    expect(item.message).not.toBe(PT_422007);
    expect(item.message).not.toBe(PT_500000);
  });

  test('E2E-422062-001 | Ausência das duas coordenadas deve preservar 422.062 e a CIA', async ({ request }) => {
    skipWhenMissing({
      BATCH_VOUCHER_MISSING_COORDINATES: env.batch.voucherMissingCoordinates,
      BATCH_DESTINATION_COMPANY: env.batch.destinationCompany
    });
    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(
      client,
      'MISSING-COORDINATES',
      [env.batch.voucherMissingCoordinates],
      { orderLatitude: undefined, orderLongitude: undefined }
    );
    const item = voucherBatchItem(operation, env.batch.voucherMissingCoordinates);

    expect(operation.status).toBe('COMPLETED');
    expect(item.status).toBe('ERROR');
    expect(item.message).toBe(
      `Não foi possível gerar o novo Vale na ${env.batch.destinationCompany}. Dados de Latitude/Longitude não enviados.`
    );
    expect(item.message).not.toBe(PT_422007);
    expect(item.message).not.toBe(PT_500000);
  });

  test('E2E-COORD-001 | Coordenadas devem chegar a cada item sem falso 422.062', async ({ request }) => {
    skipWhenMissing({ BATCH_VOUCHER_COORDINATE_PROPAGATION: env.batch.voucherCoordinatePropagation });
    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(
      client,
      'COORDINATE-PROPAGATION',
      [env.batch.voucherCoordinatePropagation],
      { orderLatitude: '-25.428400', orderLongitude: '-49.273300' }
    );
    const item = voucherBatchItem(operation, env.batch.voucherCoordinatePropagation);

    expect(operation).toMatchObject({
      orderLatitude: '-25.428400',
      orderLongitude: '-49.273300',
      status: 'COMPLETED'
    });
    expect(item.status).toBe('ERROR');
    expect(item.message).toBe(PT_422007);
    expect(item.message).not.toContain('Latitude/Longitude');
  });

  test('E2E-422064-001 | Vale inexistente deve manter código e mensagem funcional', async ({ request }) => {
    skipWhenMissing({ BATCH_VOUCHER_NOT_FOUND: env.batch.voucherNotFound });
    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(client, 'VOUCHER-NOT-FOUND', [env.batch.voucherNotFound]);
    const item = voucherBatchItem(operation, env.batch.voucherNotFound);

    expect(operation.status).toBe('COMPLETED');
    expect(item.status).toBe('ERROR');
    expect(item.message).toBe(
      `O Vale ${env.batch.voucherNotFound.toUpperCase()} não foi localizado. Verifique o código informado.`
    );
    expect(item.message).not.toBe(PT_422007);
    expect(item.message).not.toBe(PT_500000);
  });

  test('E2E-MIXED-001 | Lote misto deve isolar sucesso, 422.064 e 422.007', async ({ request }) => {
    skipWhenMissing({
      BATCH_MIXED_VOUCHER_SUCCESS: env.batch.mixedVoucherSuccess,
      BATCH_VOUCHER_NOT_FOUND: env.batch.voucherNotFound,
      BATCH_MIXED_VOUCHER_INSUFFICIENT_STOCK: env.batch.mixedVoucherInsufficientStock
    });
    const vouchers = [
      env.batch.mixedVoucherSuccess,
      env.batch.voucherNotFound,
      env.batch.mixedVoucherInsufficientStock
    ];
    expect(new Set(vouchers).size, 'A massa do lote misto deve usar três códigos distintos.').toBe(3);

    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(client, 'MIXED', vouchers);
    const success = voucherBatchItem(operation, env.batch.mixedVoucherSuccess);
    const notFound = voucherBatchItem(operation, env.batch.voucherNotFound);
    const insufficientStock = voucherBatchItem(operation, env.batch.mixedVoucherInsufficientStock);

    expect(operation.status).toBe('COMPLETED');
    expect(operation.items).toHaveLength(3);
    expect(operation.items.every(item => item.operationId === operation.id)).toBeTruthy();
    expect(success.status).toBe('COMPLETED');
    expect(success.message).toContain('Vale bloqueado com sucesso.');
    expect(notFound).toMatchObject({
      status: 'ERROR',
      message: `O Vale ${env.batch.voucherNotFound.toUpperCase()} não foi localizado. Verifique o código informado.`
    });
    expect(insufficientStock).toMatchObject({ status: 'ERROR', message: PT_422007 });
    expect(operation.items.map(item => item.message)).not.toContain(PT_500000);
  });

  test('E2E-I18N-001 | Locale persistido e override en-US devem alterar só a representação', async ({ request }) => {
    skipWhenMissing({ BATCH_VOUCHER_NOT_FOUND: env.batch.voucherNotFound });
    const client = new MsVoucherClient(request, env);
    const { operation } = await createAndWait(client, 'I18N', [env.batch.voucherNotFound]);
    const expectedPtBr = `O Vale ${env.batch.voucherNotFound.toUpperCase()} não foi localizado. Verifique o código informado.`;

    const contextWithoutLanguage = await apiRequest.newContext({
      extraHTTPHeaders: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
    try {
      const clientWithoutLanguage = new MsVoucherClient(contextWithoutLanguage, env);
      const persistedLocaleResponse = await clientWithoutLanguage.getVoucherBatchOperation(operation.id, {
        acceptLanguage: null
      });
      const persistedLocale = await readVoucherBatchOperation(persistedLocaleResponse);
      expect(voucherBatchItem(persistedLocale, env.batch.voucherNotFound).message).toBe(expectedPtBr);
      expect((persistedLocaleResponse.headers().vary ?? '').toLowerCase()).toContain('accept-language');
    } finally {
      await contextWithoutLanguage.dispose();
    }

    const englishResponse = await client.getVoucherBatchOperation(operation.id, { acceptLanguage: 'en-US' });
    const english = await readVoucherBatchOperation(englishResponse);
    const englishItem = voucherBatchItem(english, env.batch.voucherNotFound);
    expect(englishItem).toMatchObject({
      status: 'ERROR',
      message: `Voucher ${env.batch.voucherNotFound.toUpperCase()} was not found. Check the provided code.`
    });
    expect(english.status).toBe(operation.status);
    expect(english.items.map(item => item.voucherCode)).toEqual(operation.items.map(item => item.voucherCode));
    expect((englishResponse.headers().vary ?? '').toLowerCase()).toContain('accept-language');
    expectPublicVoucherBatchContract(english);
  });

  test('E2E-WEBHOOK-001 | Callback deve repetir o DTO público sem contexto interno', async ({ request }) => {
    skipWhenMissing({
      BATCH_WEBHOOK_URL: env.batch.webhookUrl,
      BATCH_VOUCHER_WEBHOOK_INSUFFICIENT_STOCK: env.batch.voucherWebhookInsufficientStock,
      WIREMOCK_NOTIFICATION_ADMIN_URL: env.wiremockNotificationAdminUrl
    });
    const webhookPath = new URL(env.batch.webhookUrl).pathname;
    const wiremock = new WireMockClient(env.wiremockNotificationAdminUrl);
    const client = new MsVoucherClient(request, env);

    try {
      await wiremock.resetRequests();
      const { operation } = await createAndWait(
        client,
        'WEBHOOK',
        [env.batch.voucherWebhookInsufficientStock],
        { webhookUrl: Buffer.from(env.batch.webhookUrl).toString('base64') }
      );

      await expect.poll(() => wiremock.countPostRequests(webhookPath), {
        message: 'O webhook deve ser enviado uma única vez após o lote terminar.',
        timeout: env.batch.pollTimeoutMs,
        intervals: [env.batch.pollIntervalMs]
      }).toBe(1);

      const requestBodies = await wiremock.postRequestBodies(webhookPath);
      expect(requestBodies).toHaveLength(1);
      const callback = voucherBatchOperationSchema.parse(JSON.parse(requestBodies[0]));
      expect(callback.id).toBe(operation.id);
      expect(callback.status).toBe('COMPLETED');
      expect(voucherBatchItem(callback, env.batch.voucherWebhookInsufficientStock)).toMatchObject({
        status: 'ERROR',
        message: PT_422007
      });
      expectPublicVoucherBatchContract(callback);
    } finally {
      await wiremock.dispose();
    }
  });
});
