import { SuiteEnv } from '../config/env';

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
