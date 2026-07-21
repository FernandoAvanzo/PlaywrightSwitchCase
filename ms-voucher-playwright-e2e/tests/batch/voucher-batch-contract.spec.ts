import { expect, test } from '@playwright/test';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { loadEnv } from '../../src/config/env.js';
import { voucherBatchContractPayload } from '../../src/data/payloadBuilders.js';
import { expectJsonResponse } from '../../src/utils/assertions.js';
import {
  blockProdMutation,
  skipWhenMutatingE2EDisabled,
  skipWhenMutationNotAllowed
} from '../../src/utils/guards.js';

const env = loadEnv();

function expectError(body: unknown, code: string, field: string) {
  expect(Array.isArray(body)).toBeTruthy();
  expect(body).toContainEqual(expect.objectContaining({ code }));
  expect(JSON.stringify(body)).toContain(field);
}

test.describe('Contrato do bloqueio em lote | E2E-CONTRACT-001..003 @batch @contract @mutating', () => {
  test.beforeEach(() => {
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMutatingE2EDisabled(env);
  });

  test('E2E-CONTRACT-001 | Rejeitar listas de Vales inválidas antes de criar a operação', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const cases: Array<{
      name: string;
      payload: Record<string, unknown>;
      code: string;
      expectedMessage?: string;
    }> = [
      {
        name: 'campo vouchers ausente',
        payload: (() => {
          const payload: Record<string, unknown> = { ...voucherBatchContractPayload() };
          delete payload.vouchers;
          return payload;
        })(),
        code: '400.001'
      },
      {
        name: 'lista vazia',
        payload: { ...voucherBatchContractPayload({ vouchers: [] }) },
        code: '400.001'
      },
      {
        name: 'limite excedido com 101 Vales',
        payload: { ...voucherBatchContractPayload({
          vouchers: Array.from({ length: 101 }, (_, index) => `V${String(index).padStart(6, '0')}`)
        }) },
        code: '400.027',
        expectedMessage: 'O campo vouchers deve conter no máximo 100 vouchers.'
      },
      {
        name: 'código de Vale fora dos tamanhos 7 e 15',
        payload: { ...voucherBatchContractPayload({ vouchers: ['ABC123'] }) },
        code: '400.010'
      }
    ];

    for (const contractCase of cases) {
      await test.step(contractCase.name, async () => {
        const response = await client.createVoucherBatchBlock(contractCase.payload);
        const body = await expectJsonResponse(response, 400);
        expectError(body, contractCase.code, 'vouchers');
        if (contractCase.expectedMessage) {
          expect(body).toContainEqual(expect.objectContaining({ message: contractCase.expectedMessage }));
        }
      });
    }
  });

  test('E2E-CONTRACT-002 | Rejeitar cada campo obrigatório ausente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const requiredFields = [
      'caseId',
      'validationChannel',
      'codeResale',
      'addressValidation',
      'documentResale',
      'userType',
      'codeProduct'
    ] as const;

    for (const field of requiredFields) {
      await test.step(`campo ${field} ausente`, async () => {
        const payload: Record<string, unknown> = { ...voucherBatchContractPayload() };
        delete payload[field];
        const body = await expectJsonResponse(await client.createVoucherBatchBlock(payload), 400);
        expectError(body, '412.001', field);
      });
    }
  });

  test('E2E-CONTRACT-003 | Rejeitar userType e webhook fora do contrato', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const invalidCases = [
      {
        name: 'userType desconhecido',
        payload: voucherBatchContractPayload({ userType: 'INVALID_USER_TYPE' }),
        field: 'userType'
      },
      {
        name: 'webhook não codificado em Base64',
        payload: voucherBatchContractPayload({ webhookUrl: 'not-base64' }),
        field: 'webhookUrl'
      },
      {
        name: 'webhook Base64 com protocolo não permitido',
        payload: voucherBatchContractPayload({
          webhookUrl: Buffer.from('ftp://client.example.com/callback').toString('base64')
        }),
        field: 'webhookUrl'
      }
    ];

    for (const invalidCase of invalidCases) {
      await test.step(invalidCase.name, async () => {
        const body = await expectJsonResponse(await client.createVoucherBatchBlock(invalidCase.payload), 400);
        expectError(body, '400.004', invalidCase.field);
      });
    }
  });
});

test.describe('Consulta de operação em lote | @batch @contract', () => {
  test('E2E-CONTRACT-004 | Operação inexistente deve retornar 404 sem detalhes técnicos', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const response = await client.getVoucherBatchOperation('00000000-0000-0000-0000-000000000000');
    const body = await response.text();

    expect(response.status(), body).toBe(404);
    expect(body).not.toMatch(/stack\s*trace|soapenv|messageCode|messageArguments|localeTag/i);
  });
});
