import { randomUUID } from 'node:crypto';
import { CreatePaymentPayload } from '../types/payment';
import { loadEnvironment } from '../config/environment';

const env = loadEnvironment();
const webhook = Buffer.from(`${env.webhookMockUrl}/webhooks/payment`).toString('base64');

export function creditPayment(overrides: Partial<CreatePaymentPayload> = {}): CreatePaymentPayload {
  const id = randomUUID();
  const base: CreatePaymentPayload = {
    merchant_code: 'HUB',
    merchant_id: env.merchantId,
    merchant_payment_id: `PW-${id}`,
    merchant_order_id: `ORD-${id}`,
    payment_method_type: 'CREDIT_CARD',
    currency: 'BRL',
    amount: 2000,
    webhook_url: webhook,
    customer: {
      name: 'Cliente Playwright', email: `playwright+${id}@example.com`,
      document_type: 'CPF', document_number: '12345678909', document_country: 'BR', phone: '41999999999'
    },
    card_details: { card_token: `token-${id}`, installments: 1 },
    fraud_analysis: {
      customer: {
        billing_address: {
          city: 'Curitiba', state: 'PR', street: 'Rua Teste', street_number: '100',
          neighborhood: 'Centro', complement: '', country: 'BR', zipcode: '80000000'
        }
      }
    },
    reconciliation_data: { vendor_name: 'PLAYWRIGHT', subsidiary: '001' }
  };
  return { ...base, ...overrides };
}

export function creditPaymentWithSplit(): CreatePaymentPayload {
  return creditPayment({
    split_rules: [{ seller_id: 'seller-001', amount: 1000, liable: false, processing_fee: false }]
  });
}

export function pixPayment(): CreatePaymentPayload {
  const payload = creditPayment({ payment_method_type: 'PIX' });
  delete payload.card_details;
  delete payload.fraud_analysis;
  delete payload.split_rules;
  return payload;
}
