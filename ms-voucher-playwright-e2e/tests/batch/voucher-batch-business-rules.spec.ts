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
  expectVoucherBatchRepresentationInvariant,
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

  /**
   * Preserva a classificação funcional de falta de estoque durante o bloqueio de Vale em lote.
   *
   * Objetivo do teste: confirmar que um Vale sem estoque suficiente encerra apenas seu item como
   * erro de negócio, sem ser confundido com ausência de coordenadas ou falha interna.
   *
   * Regras de negócio e cobertura:
   * - A operação deve concluir mesmo quando um item termina com erro.
   * - O item deve retornar a mensagem funcional correspondente ao código 422.007.
   * - A resposta não pode apresentar mensagem de latitude/longitude nem erro genérico 500.000.
   */
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

  /**
   * Garante o bloqueio bem-sucedido e isolado quando há estoque para o Vale solicitado.
   *
   * Objetivo do teste: validar o caminho positivo do processamento em lote com um único código,
   * assegurando que nenhum item adicional seja criado ou afetado.
   *
   * Regras de negócio e cobertura:
   * - A operação e seu único item devem alcançar estado `COMPLETED`.
   * - A mensagem deve confirmar o bloqueio do Vale com sucesso.
   * - O resultado não pode carregar classificações de estoque insuficiente ou erro interno.
   */
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

  /**
   * Mantém a regra de localização obrigatória para geração do novo Vale na companhia de destino.
   *
   * Objetivo do teste: confirmar que a ausência simultânea de latitude e longitude produz a
   * mensagem funcional 422.062 com a companhia correta, sem degradação para outro erro.
   *
   * Regras de negócio e cobertura:
   * - O lote deve concluir, registrando o item como `ERROR`.
   * - A mensagem deve informar a falta das coordenadas e identificar a CIA de destino configurada.
   * - O caso não pode ser classificado como estoque insuficiente nem erro interno.
   */
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

  /**
   * Garante que as coordenadas da operação sejam propagadas aos itens antes da aplicação das regras de bloqueio.
   *
   * Objetivo do teste: evitar falso 422.062 quando latitude e longitude foram informadas e permitir
   * que a causa funcional real do item, neste caso estoque insuficiente, seja preservada.
   *
   * Regras de negócio e cobertura:
   * - A operação deve conservar exatamente as coordenadas recebidas e concluir o processamento.
   * - O item deve ser classificado como 422.007, sem referência a latitude ou longitude.
   * - Dados geográficos válidos devem alcançar o processamento assíncrono de cada Vale.
   */
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

  /**
   * Preserva a informação acionável quando o código de Vale solicitado não existe.
   *
   * Objetivo do teste: validar que a falha 422.064 mantém o código consultado na mensagem pública,
   * permitindo ao operador ou cliente corrigir o dado informado.
   *
   * Regras de negócio e cobertura:
   * - A operação deve concluir e marcar apenas o item inexistente como `ERROR`.
   * - A mensagem deve informar o código do Vale em caixa alta e orientar sua verificação.
   * - A classificação não pode ser substituída por 422.007 ou por erro interno genérico.
   */
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

  /**
   * Isola resultados heterogêneos para que a falha de um Vale não comprometa os demais do lote.
   *
   * Objetivo do teste: confirmar que sucesso, Vale não localizado e estoque insuficiente podem
   * coexistir na mesma operação, cada qual com estado e mensagem próprios.
   *
   * Regras de negócio e cobertura:
   * - Os três códigos de entrada devem gerar exatamente três itens ligados à mesma operação.
   * - O item elegível deve concluir; os demais devem manter respectivamente 422.064 e 422.007.
   * - Nenhum resultado funcional deve ser convertido em erro interno genérico.
   */
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

  /**
   * Mantém o resultado de negócio estável ao apresentar a operação em idiomas diferentes.
   *
   * Objetivo do teste: validar que o locale usado na criação seja persistido e que uma consulta
   * com `en-US` traduza somente a representação, sem alterar identidade, estados ou itens do lote.
   *
   * Regras de negócio e cobertura:
   * - Sem `Accept-Language`, a consulta deve reutilizar a mensagem em português registrada na operação.
   * - Com `en-US`, o 422.064 deve ser apresentado em inglês com o mesmo código de Vale.
   * - As respostas devem declarar variação por idioma e respeitar o DTO público invariável.
   */
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
    expectVoucherBatchRepresentationInvariant(operation, english);
    expect((englishResponse.headers().vary ?? '').toLowerCase()).toContain('accept-language');
    expectPublicVoucherBatchContract(english);
  });

  /**
   * Entrega ao sistema consumidor o resultado final do lote no mesmo contrato público da consulta.
   *
   * Objetivo do teste: assegurar que o callback seja emitido uma única vez após o término da
   * operação e contenha um DTO validado, sem contexto técnico interno.
   *
   * Regras de negócio e cobertura:
   * - A URL de webhook codificada deve receber exatamente um POST após a conclusão.
   * - O callback deve manter o ID e o estado `COMPLETED` da operação.
   * - O item deve preservar a falha 422.007 e todo o payload deve respeitar o schema público.
   */
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
