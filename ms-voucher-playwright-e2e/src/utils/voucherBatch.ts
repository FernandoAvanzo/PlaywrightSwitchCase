import { APIResponse, expect } from '@playwright/test';
import { MsVoucherClient } from '../api/msVoucherClient.js';
import {
  TERMINAL_BATCH_STATUSES,
  VoucherBatchBlockPayload,
  VoucherBatchItem,
  VoucherBatchOperation,
  voucherBatchOperationSchema
} from '../api/voucherBatchOperations.js';
import { expectJsonResponse } from './assertions.js';

const FORBIDDEN_PUBLIC_FIELDS = new Set([
  'messageCode',
  'messageArguments',
  'messageDetail',
  'localeTag',
  'stackTrace',
  'exception',
  'trace'
]);

export async function readVoucherBatchOperation(response: APIResponse, expectedStatus = 200) {
  const body = await expectJsonResponse(response, expectedStatus);
  return voucherBatchOperationSchema.parse(body);
}

export function expectPublicVoucherBatchContract(operation: VoucherBatchOperation) {
  const exposedForbiddenFields: string[] = [];

  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_PUBLIC_FIELDS.has(key)) {
        exposedForbiddenFields.push(`${path}.${key}`);
      }
      visit(child, `${path}.${key}`);
    }
  }

  visit(operation, '$');
  expect(exposedForbiddenFields, 'O contrato público não pode expor contexto técnico interno.').toEqual([]);
}

export function expectInitialVoucherBatchOperation(
  operation: VoucherBatchOperation,
  payload: VoucherBatchBlockPayload
) {
  expect(operation).toMatchObject({
    operation: 'BLOCK',
    status: 'NOT_STARTED',
    caseId: payload.caseId,
    validationChannel: payload.validationChannel,
    codeResale: payload.codeResale,
    addressValidation: payload.addressValidation,
    documentResale: payload.documentResale,
    userType: payload.userType,
    codeProduct: payload.codeProduct
  });
  expect(operation.orderLatitude ?? null).toBe(payload.orderLatitude ?? null);
  expect(operation.orderLongitude ?? null).toBe(payload.orderLongitude ?? null);
  expect(operation.consumerDocument ?? null).toBe(payload.consumerDocument ?? null);
  expect(operation.consumerPhoneNumber ?? null).toBe(payload.consumerPhoneNumber ?? null);
  expect(operation.items).toHaveLength(payload.vouchers.length);
  expect(operation.items.map(item => item.voucherCode)).toEqual(payload.vouchers.map(code => code.toUpperCase()));
  for (const item of operation.items) {
    expect(item).toMatchObject({
      operationId: operation.id,
      status: 'NOT_STARTED',
      message: null
    });
  }
  expectPublicVoucherBatchContract(operation);
}

export async function waitForVoucherBatchCompletion(
  client: MsVoucherClient,
  operationId: string,
  options: { timeoutMs: number; intervalMs: number; acceptLanguage?: string | null }
) {
  let latest: VoucherBatchOperation | undefined;

  await expect.poll(async () => {
    latest = await readVoucherBatchOperation(await client.getVoucherBatchOperation(operationId, {
      acceptLanguage: options.acceptLanguage
    }));

    const operationFinished = TERMINAL_BATCH_STATUSES.has(latest.status);
    const itemsFinished = latest.items.length > 0
      && latest.items.every(item => TERMINAL_BATCH_STATUSES.has(item.status));
    return operationFinished && itemsFinished;
  }, {
    message: `A operação ${operationId} não concluiu dentro do tempo limite.`,
    timeout: options.timeoutMs,
    intervals: [options.intervalMs]
  }).toBe(true);

  if (!latest) {
    throw new Error(`A operação ${operationId} não retornou estado consultável.`);
  }
  expectPublicVoucherBatchContract(latest);
  return latest;
}

export function voucherBatchItem(operation: VoucherBatchOperation, voucherCode: string): VoucherBatchItem {
  const matches = operation.items.filter(item => item.voucherCode === voucherCode.toUpperCase());
  expect(matches, `Deve existir exatamente um item para o Vale ${voucherCode}.`).toHaveLength(1);
  return matches[0];
}

export function expectVoucherBatchRepresentationInvariant(
  original: VoucherBatchOperation,
  localized: VoucherBatchOperation
) {
  const withoutLocalizedMessages = (operation: VoucherBatchOperation) => ({
    ...operation,
    items: operation.items.map(({ message: _message, ...item }) => item)
  });

  expect(withoutLocalizedMessages(localized), 'A localização não deve alterar o estado persistido da operação.')
    .toEqual(withoutLocalizedMessages(original));
}
