import { SuiteEnv } from '../config/env.js';
import { VoucherBatchBlockPayload } from '../api/voucherBatchOperations.js';

let batchCaseSequence = 0;

export function backofficeSellVoucherPayload(env: SuiteEnv) {
  return {
    quantity: 1,
    productCode: env.data.productCode,
    consumer: {
      phone: {
        ddd: env.data.phoneDdd,
        number: env.data.phoneNumber
      }
    },
    mustSendSms: true
  };
}

export function cancelVoucherPayload(env: SuiteEnv) {
  return [
    {
      authorizationCode: env.data.authCode,
      status: 'CANCELADO',
      reason: 'Cancelamento automatizado Playwright'
    }
  ];
}

export function confirmSellPayload(env: SuiteEnv) {
  return {
    voucherCode: env.data.authCode
  };
}

export function priceQueryParams(env: SuiteEnv) {
  return {
    'code-product': env.data.productCode
  };
}

function nextBatchCaseId(prefix: string, scenario: string) {
  batchCaseSequence += 1;
  return `${prefix}-${scenario}-${Date.now()}-${batchCaseSequence}`;
}

export function voucherBatchContractPayload(
  overrides: Partial<VoucherBatchBlockPayload> = {}
): VoucherBatchBlockPayload {
  return {
    caseId: nextBatchCaseId('PW-CONTRACT', 'VALIDATION'),
    validationChannel: 'APP',
    codeResale: '123456',
    addressValidation: 'MAIN',
    documentResale: '12345678000199',
    userType: 'CONSUMIDOR_FINAL',
    codeProduct: 'P13',
    orderLatitude: '-23.550520',
    orderLongitude: '-46.633308',
    consumerDocument: '12345678909',
    consumerPhoneNumber: '11999999999',
    vouchers: ['ABC1234'],
    ...overrides
  };
}

export function configuredVoucherBatchPayload(
  env: SuiteEnv,
  scenario: string,
  vouchers: string[],
  overrides: Partial<VoucherBatchBlockPayload> = {}
): VoucherBatchBlockPayload {
  return {
    caseId: nextBatchCaseId(env.batch.caseIdPrefix, scenario),
    validationChannel: env.batch.validationChannel,
    codeResale: env.batch.codeResale,
    addressValidation: env.batch.addressValidation,
    documentResale: env.batch.documentResale,
    userType: env.batch.userType,
    codeProduct: env.batch.productCode,
    orderLatitude: '-23.550520',
    orderLongitude: '-46.633308',
    consumerDocument: env.batch.consumerDocument,
    consumerPhoneNumber: env.batch.consumerPhoneNumber,
    vouchers,
    ...overrides
  };
}
