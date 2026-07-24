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

  /**
   * Impede a criação de operações em lote com uma coleção de Vales fora dos limites do produto.
   *
   * Objetivo do teste: validar em uma única matriz as fronteiras do campo `vouchers` antes que
   * qualquer processamento assíncrono ou mutação de negócio seja iniciado.
   *
   * Regras de negócio e cobertura:
   * - A lista é obrigatória, não pode ser vazia e aceita no máximo 100 códigos.
   * - Cada código deve possuir um dos comprimentos permitidos pelo contrato: 7 ou 15 caracteres.
   * - Cada violação deve responder HTTP 400 com código e referência ao campo correspondente.
   */
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

  /**
   * Garante que toda operação de bloqueio tenha o contexto mínimo necessário para execução e auditoria.
   *
   * Objetivo do teste: percorrer os campos obrigatórios e comprovar que a ausência de qualquer
   * um deles é identificada individualmente pelo contrato.
   *
   * Regras de negócio e cobertura:
   * - Caso, canal, revenda, endereço, documento, tipo de usuário e produto são obrigatórios.
   * - A remoção de cada campo deve gerar HTTP 400 com código funcional `412.001`.
   * - A mensagem de erro deve apontar o campo ausente para correção pelo consumidor.
   */
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

  /**
   * Protege o lote contra tipos de usuário desconhecidos e destinos de callback inseguros ou inválidos.
   *
   * Objetivo do teste: validar as restrições semânticas de `userType` e `webhookUrl`, impedindo
   * que valores bem formados sintaticamente, porém não suportados, entrem no processamento.
   *
   * Regras de negócio e cobertura:
   * - `userType` deve pertencer ao domínio reconhecido pela aplicação.
   * - O webhook deve estar em Base64 e decodificar uma URL com protocolo permitido.
   * - Valor textual não codificado e URL FTP devem ser rejeitados com HTTP 400 e código `400.004`.
   */
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
  /**
   * Fornece uma resposta segura e previsível ao consultar uma operação de lote inexistente.
   *
   * Objetivo do teste: confirmar que IDs desconhecidos resultam em não encontrado sem revelar
   * detalhes da implementação, integração SOAP ou contexto de internacionalização.
   *
   * Regras de negócio e cobertura:
   * - Uma operação inexistente deve responder HTTP 404.
   * - O corpo não pode expor stack trace, envelope SOAP, códigos internos ou argumentos de mensagem.
   * - A fronteira pública deve manter detalhes técnicos fora do contrato de erro.
   */
  test('E2E-CONTRACT-004 | Operação inexistente deve retornar 404 sem detalhes técnicos', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const response = await client.getVoucherBatchOperation('00000000-0000-0000-0000-000000000000');
    const body = await response.text();

    expect(response.status(), body).toBe(404);
    expect(body).not.toMatch(/stack\s*trace|soapenv|messageCode|messageArguments|localeTag/i);
  });
});
