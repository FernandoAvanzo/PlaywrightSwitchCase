import { request as apiRequest, expect, test } from '@playwright/test';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import {
  VoucherBatchBlockPayload,
  VoucherBatchOperation,
  voucherBatchOperationSchema
} from '../../src/api/voucherBatchOperations.js';
import { WireMockClient } from '../../src/api/wiremockClient.js';
import { loadEnv } from '../../src/config/env.js';
import { voucherBatchContractPayload } from '../../src/data/payloadBuilders.js';
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
const PT_INTERNAL_ERROR = 'Erro interno do servidor.';
const PT_NOT_FOUND = (voucherCode: string) =>
  `O Vale ${voucherCode} não foi localizado. Verifique o código informado.`;
const EN_NOT_FOUND = (voucherCode: string) =>
  `Voucher ${voucherCode} was not found. Check the provided code.`;

const soaWiremock = new WireMockClient(env.wiremockSoaAdminUrl);
let soaWiremockReady = false;

async function createAndWait(
  client: MsVoucherClient,
  scenario: string,
  vouchers: string[],
  acceptLanguage: string | null = 'pt-BR',
  overrides: Partial<VoucherBatchBlockPayload> = {}
): Promise<VoucherBatchOperation> {
  const payload = voucherBatchContractPayload({
    caseId: `PW-422064-${scenario}-${Date.now()}`,
    vouchers,
    ...overrides
  });

  const initial = await readVoucherBatchOperation(
    await client.createVoucherBatchBlock(payload, { acceptLanguage }),
    201
  );
  expectInitialVoucherBatchOperation(initial, payload);

  return waitForVoucherBatchCompletion(client, initial.id, {
    acceptLanguage,
    timeoutMs: env.batch.pollTimeoutMs,
    intervalMs: env.batch.pollIntervalMs
  });
}

function expectTechnicalFallback(operation: VoucherBatchOperation, voucherCode: string) {
  const item = voucherBatchItem(operation, voucherCode);
  expect(item).toMatchObject({ status: 'ERROR', message: PT_INTERNAL_ERROR });
  expect(item.message ?? '').not.toMatch(/não foi localizado|soap|fault|stack|falha técnica simulada/i);
}

test.describe('Fronteiras do Vale não localizado 422.064 | @batch @e2e @stub @mutating', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    soaWiremockReady = false;
    blockProdMutation(env);
    test.skip(env.name !== 'local', 'Os cenários determinísticos alteram somente o WireMock SOA do ambiente local.');
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
    skipWhenMissing({ WIREMOCK_SOA_ADMIN_URL: env.wiremockSoaAdminUrl });
    await soaWiremock.resetAllToDefaultMappings();
    await soaWiremock.resetRequests();
    soaWiremockReady = true;
  });

  test.afterEach(async () => {
    if (soaWiremockReady) {
      await soaWiremock.resetAllToDefaultMappings();
      await soaWiremock.dispose();
      soaWiremockReady = false;
    }
  });

  /**
   * Reconhece de forma tolerante a assinatura funcional de Vale não localizado devolvida pelo legado.
   *
   * Objetivo do teste: confirmar que diferenças apenas de caixa e espaços externos não alteram
   * a classificação 422.064 nem a mensagem pública apresentada ao consumidor.
   *
   * Regras de negócio e cobertura:
   * - A assinatura exata do SOA deve ser normalizada quanto a maiúsculas, minúsculas e espaços.
   * - Cada código deve resultar em item `ERROR` com mensagem funcional padronizada e interpolada.
   * - O legado deve ser consultado exatamente uma vez para cada Vale do lote.
   */
  test('E2E-422064-STUB-001 | Assinatura exata, caixa e espaços devem preservar a classificação funcional', async ({ request }) => {
    const cases = [
      { voucherCode: 'MISS001', responseMessage: 'Erro - Vale MISS001 não localizado.' },
      { voucherCode: 'MISS002', responseMessage: '  Erro - Vale MISS002 não localizado.  ' },
      { voucherCode: 'MISS003', responseMessage: 'ERRO - VALE MISS003 NÃO LOCALIZADO.' }
    ];
    await Promise.all(cases.map(({ voucherCode, responseMessage }) => soaWiremock.stubSoapBlockResult({
      voucherCode,
      responseCode: '2',
      responseMessage
    })));

    const operation = await createAndWait(
      new MsVoucherClient(request, env),
      'NORMALIZATION',
      cases.map(({ voucherCode }) => voucherCode)
    );

    expect(operation.status).toBe('COMPLETED');
    for (const { voucherCode } of cases) {
      expect(voucherBatchItem(operation, voucherCode)).toMatchObject({
        status: 'ERROR',
        message: PT_NOT_FOUND(voucherCode)
      });
      expect(await soaWiremock.countSoapBlockRequests(voucherCode)).toBe(1);
    }
  });

  /**
   * Evita classificar falhas técnicas ou mensagens apenas semelhantes como Vale não localizado.
   *
   * Objetivo do teste: proteger a precisão do 422.064 diante de HTTP 500, SOAP Fault, outra regra
   * funcional, texto incompleto ou mensagem referente a um código diferente.
   *
   * Regras de negócio e cobertura:
   * - Somente a assinatura completa e correspondente ao Vale consultado pode gerar 422.064.
   * - Casos divergentes devem usar o fallback público de erro interno, sem vazar detalhes do SOA.
   * - Todos os itens devem ser isolados, processados uma vez e respeitar o contrato público.
   */
  test('E2E-422064-STUB-002 | Falhas técnicas e assinaturas divergentes não devem produzir falso 422.064', async ({ request }) => {
    const technicalCases = ['TECH001', 'FAULT01', 'OTHER02', 'PARTIAL', 'WRONG01'];
    await Promise.all([
      soaWiremock.stubSoapBlockHttpError('TECH001'),
      soaWiremock.stubSoapBlockFault('FAULT01', 'TE-503', 'SOA temporariamente indisponível'),
      soaWiremock.stubSoapBlockResult({
        voucherCode: 'OTHER02',
        responseCode: '2',
        responseMessage: 'O Vale já foi bloqueado.'
      }),
      soaWiremock.stubSoapBlockResult({
        voucherCode: 'PARTIAL',
        responseCode: '2',
        responseMessage: 'Vale PARTIAL não localizado'
      }),
      soaWiremock.stubSoapBlockResult({
        voucherCode: 'WRONG01',
        responseCode: '2',
        responseMessage: 'Erro - Vale OTHER99 não localizado.'
      })
    ]);

    const operation = await createAndWait(
      new MsVoucherClient(request, env),
      'NEGATIVE-BOUNDARIES',
      technicalCases
    );

    expect(operation.status).toBe('COMPLETED');
    expect(operation.items).toHaveLength(technicalCases.length);
    for (const voucherCode of technicalCases) {
      expectTechnicalFallback(operation, voucherCode);
      expect(await soaWiremock.countSoapBlockRequests(voucherCode)).toBe(1);
    }
    expectPublicVoucherBatchContract(operation);
  });

  /**
   * Permite concluir o bloqueio quando o Vale existe apenas no sistema legado consultado como fallback.
   *
   * Objetivo do teste: validar que a resposta síncrona de sucesso do SOA seja convertida em
   * conclusão do item, sem falso diagnóstico de Vale não localizado.
   *
   * Regras de negócio e cobertura:
   * - O código de retorno `1` do legado representa bloqueio realizado com sucesso.
   * - Operação e item devem terminar como `COMPLETED` com mensagem positiva.
   * - O SOA deve ser chamado uma única vez e a mensagem 422.064 não pode aparecer.
   */
  test('E2E-422064-STUB-003 | Vale externo existente deve concluir pelo fallback síncrono', async ({ request }) => {
    const voucherCode = 'EXT0001';
    await soaWiremock.stubSoapBlockResult({
      voucherCode,
      responseCode: '1',
      responseMessage: 'Vale bloqueado com sucesso.'
    });

    const operation = await createAndWait(
      new MsVoucherClient(request, env),
      'EXTERNAL-SUCCESS',
      [voucherCode]
    );
    const item = voucherBatchItem(operation, voucherCode);

    expect(operation.status).toBe('COMPLETED');
    expect(item.status).toBe('COMPLETED');
    expect(item.message).toContain('Vale bloqueado com sucesso.');
    expect(item.message).not.toBe(PT_NOT_FOUND(voucherCode));
    expect(await soaWiremock.countSoapBlockRequests(voucherCode)).toBe(1);
  });

  /**
   * Define uma representação internacional previsível quando o consumidor não informa idioma.
   *
   * Objetivo do teste: confirmar que tanto a criação quanto a consulta sem `Accept-Language`
   * utilizem `en-US` como fallback, sem modificar o conteúdo estrutural da operação.
   *
   * Regras de negócio e cobertura:
   * - O Vale não localizado deve ser apresentado com mensagem funcional em inglês.
   * - A resposta deve declarar `Accept-Language` no cabeçalho `Vary`.
   * - Identidade, estados e itens devem permanecer invariáveis entre representações.
   */
  test('E2E-422064-STUB-004 | POST e GET sem Accept-Language devem usar o fallback en-US', async () => {
    const voucherCode = 'DEFLT01';
    await soaWiremock.stubSoapBlockResult({
      voucherCode,
      responseCode: '2',
      responseMessage: `Erro - Vale ${voucherCode} não localizado.`
    });
    const contextWithoutLanguage = await apiRequest.newContext({
      extraHTTPHeaders: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });

    try {
      const client = new MsVoucherClient(contextWithoutLanguage, env);
      const operation = await createAndWait(client, 'DEFAULT-LOCALE', [voucherCode], null);
      const responseWithoutLanguage = await client.getVoucherBatchOperation(operation.id, { acceptLanguage: null });
      const representationWithoutLanguage = await readVoucherBatchOperation(responseWithoutLanguage);

      expect(voucherBatchItem(representationWithoutLanguage, voucherCode)).toMatchObject({
        status: 'ERROR',
        message: EN_NOT_FOUND(voucherCode)
      });
      expect((responseWithoutLanguage.headers().vary ?? '').toLowerCase()).toContain('accept-language');
      expectVoucherBatchRepresentationInvariant(operation, representationWithoutLanguage);
    } finally {
      await contextWithoutLanguage.dispose();
    }
  });

  /**
   * Mantém no webhook o idioma escolhido na criação, independentemente de consultas posteriores.
   *
   * Objetivo do teste: garantir que o callback de um Vale não localizado seja emitido uma única
   * vez em português e não exponha contexto interno, mesmo quando a operação é consultada em inglês.
   *
   * Regras de negócio e cobertura:
   * - O callback deve preservar ID, código, estado e mensagem 422.064 em `pt-BR`.
   * - O payload enviado deve respeitar integralmente o schema público da operação.
   * - Uma consulta com `en-US` deve traduzir apenas sua resposta, sem alterar o webhook já produzido.
   */
  test('E2E-422064-STUB-005 | Webhook deve manter 422.064 no locale salvo e sem contexto interno', async ({ request }) => {
    skipWhenMissing({
      BATCH_WEBHOOK_URL: env.batch.webhookUrl,
      WIREMOCK_NOTIFICATION_ADMIN_URL: env.wiremockNotificationAdminUrl
    });
    const voucherCode = 'WHOOK01';
    const webhookPath = new URL(env.batch.webhookUrl).pathname;
    const notificationWiremock = new WireMockClient(env.wiremockNotificationAdminUrl);
    await soaWiremock.stubSoapBlockResult({
      voucherCode,
      responseCode: '2',
      responseMessage: `Erro - Vale ${voucherCode} não localizado.`
    });

    try {
      await notificationWiremock.resetRequests();
      const client = new MsVoucherClient(request, env);
      const operation = await createAndWait(client, 'WEBHOOK-NOT-FOUND', [voucherCode], 'pt-BR', {
        webhookUrl: Buffer.from(env.batch.webhookUrl).toString('base64')
      });

      await expect.poll(() => notificationWiremock.countPostRequests(webhookPath), {
        timeout: env.batch.pollTimeoutMs,
        intervals: [env.batch.pollIntervalMs],
        message: 'O callback do lote deve ser enviado uma única vez.'
      }).toBe(1);

      const requestBodies = await notificationWiremock.postRequestBodies(webhookPath);
      expect(requestBodies).toHaveLength(1);
      const callback = voucherBatchOperationSchema.parse(JSON.parse(requestBodies[0]));
      expect(callback.id).toBe(operation.id);
      expect(voucherBatchItem(callback, voucherCode)).toMatchObject({
        status: 'ERROR',
        message: PT_NOT_FOUND(voucherCode)
      });
      expectPublicVoucherBatchContract(callback);

      const english = await readVoucherBatchOperation(
        await client.getVoucherBatchOperation(operation.id, { acceptLanguage: 'en-US' })
      );
      expect(voucherBatchItem(english, voucherCode).message).toBe(EN_NOT_FOUND(voucherCode));
      expect(voucherBatchItem(callback, voucherCode).message).toBe(PT_NOT_FOUND(voucherCode));
    } finally {
      await notificationWiremock.dispose();
    }
  });

  /**
   * Protege o isolamento de dados quando múltiplos lotes de Vales são processados simultaneamente.
   *
   * Objetivo do teste: validar que duas operações concorrentes, com dez códigos cada, concluam
   * sem cruzar códigos, mensagens ou itens entre si.
   *
   * Regras de negócio e cobertura:
   * - Cada operação deve conter somente seus dez Vales e terminar como `COMPLETED`.
   * - Toda mensagem 422.064 deve interpolar o próprio código, sem placeholder ou código do outro lote.
   * - Cada Vale deve gerar exatamente uma chamada ao SOA e o DTO final deve permanecer público.
   */
  test('E2E-422064-STUB-006 | Operações concorrentes devem isolar códigos e concluir todos os itens', async ({ request }) => {
    const leftCodes = Array.from({ length: 10 }, (_, index) => `L${String(index + 1).padStart(6, '0')}`);
    const rightCodes = Array.from({ length: 10 }, (_, index) => `R${String(index + 1).padStart(6, '0')}`);
    const allCodes = [...leftCodes, ...rightCodes];
    await Promise.all(allCodes.map(voucherCode => soaWiremock.stubSoapBlockResult({
      voucherCode,
      responseCode: '2',
      responseMessage: `Erro - Vale ${voucherCode} não localizado.`
    })));

    const client = new MsVoucherClient(request, env);
    const [leftOperation, rightOperation] = await Promise.all([
      createAndWait(client, 'CONCURRENT-LEFT', leftCodes),
      createAndWait(client, 'CONCURRENT-RIGHT', rightCodes)
    ]);

    for (const [operation, ownCodes, foreignCodes] of [
      [leftOperation, leftCodes, rightCodes],
      [rightOperation, rightCodes, leftCodes]
    ] as const) {
      expect(operation.status).toBe('COMPLETED');
      expect(operation.items).toHaveLength(10);
      for (const voucherCode of ownCodes) {
        const item = voucherBatchItem(operation, voucherCode);
        expect(item).toMatchObject({ status: 'ERROR', message: PT_NOT_FOUND(voucherCode) });
        expect(item.message).not.toContain('{0}');
        for (const foreignCode of foreignCodes) {
          expect(item.message).not.toContain(foreignCode);
        }
      }
      expectPublicVoucherBatchContract(operation);
    }

    for (const voucherCode of allCodes) {
      expect(await soaWiremock.countSoapBlockRequests(voucherCode)).toBe(1);
    }
  });
});
