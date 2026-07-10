import { randomUUID } from 'node:crypto';
import { CreatePaymentPayload, UpsertSplitReceiverPayload } from '../types/payment';
import { loadEnvironment } from '../config/environment';

const env = loadEnvironment();
const webhook = Buffer.from(`${env.webhookMockUrl}/webhooks/payment`).toString('base64');
export const splitReceiverDocument = { type: 'CPF', number: '52998224725', country: 'BR' };

function shortId(): string {
  return `PW${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function billingAddress() {
  return {
    street: 'Rua Teste',
    number: '100',
    complement: 'N/A',
    zip_code: '80000000',
    city: 'Curitiba',
    state: 'PR',
    country: 'BR',
    district: 'Centro',
    reference: 'E2E Playwright'
  };
}

export function creditPayment(overrides: Partial<CreatePaymentPayload> = {}): CreatePaymentPayload {
  const id = shortId();
  const email = `playwright+${id}@example.com`;
  const address = billingAddress();
  const base: CreatePaymentPayload = {
    merchant_code: 'HUB',
    merchant_id: env.merchantId,
    merchant_payment_id: id,
    merchant_order_id: `ORD-${id}`,
    payment_method_type: 'CREDIT_CARD',
    currency: 'BRL',
    amount: 2000,
    webhook_url: webhook,
    customer: {
      name: 'Cliente Playwright', email,
      document_type: 'CPF', document_number: '12345678909', document_country: 'BR', phone: '41999999999'
    },
    card_details: { card_token: `token-${id}`, installments: 1 },
    fraud_analysis: {
      sla: 10,
      customer: {
        name: 'Cliente Playwright',
        identity: '12345678909',
        identity_type: 'CPF',
        email,
        phone: '41999999999',
        birthdate: '1990-01-01',
        registration_date: '2023-01-01T10:00:00Z',
        billing_address: address,
        browser: {
          browser_fingerprint: `visitor-${id}`,
          cookies_accepted: true,
          email,
          host_name: 'localhost',
          ip_address: '127.0.0.1',
          type: 'Chrome'
        }
      },
      cart: {
        items: [{
          name: 'Produto Playwright',
          quantity: 1,
          sku: 'SKU-PW',
          unit_price: 2000,
          risk: 'Low',
          locality: 'Curitiba',
          date: '2026-07-10T12:00:00Z',
          type: 1,
          genre: 'produto',
          tickets: {
            quantity_ticket_sale: 1,
            quantity_event_house: 1,
            convenience_fee_value: 0,
            quantity_full: 1,
            quantity_half: 0,
            batch: 1
          },
          location: address
        }]
      }
    },
    reconciliation_data: { vendor_name: 'PLAYWRIGHT', subsidiary: '001' }
  };
  return { ...base, ...overrides };
}

export function creditPaymentWithSplit(): CreatePaymentPayload {
  return creditPayment({
    split_receivers: [{
      document_type: splitReceiverDocument.type,
      document_number: splitReceiverDocument.number,
      amount: 1000
    }]
  });
}

export function pixPayment(): CreatePaymentPayload {
  const payload = creditPayment({ payment_method_type: 'PIX' });
  delete payload.card_details;
  delete payload.split_receivers;
  return payload;
}

export function splitReceiverPayload(): UpsertSplitReceiverPayload {
  const address = billingAddress();
  return {
    merchant_id: env.merchantId,
    receiver_type: 'NATURAL_PERSON',
    owner: {
      name: 'Seller Playwright',
      email: 'seller.playwright@example.com',
      phone_number: '41988887777',
      birthdate: '1990-01-01',
      document: splitReceiverDocument,
      address: {
        street: address.street,
        street_number: address.number,
        complement: address.complement,
        zip_code: address.zip_code,
        city: address.city,
        state: address.state,
        country: address.country,
        district: address.district
      },
      business_category: 'services'
    },
    mcc: 5999,
    bank_account: {
      holder_name: 'Seller Playwright',
      holder_document: splitReceiverDocument.number,
      bank: '001',
      branch_number: '0001',
      branch_check_digit: '0',
      account_number: '12345',
      account_check_digit: '6',
      type: 'checking'
    },
    transfer_policy: {
      transfer_day: 1,
      transfer_enabled: true,
      transfer_interval: 'daily',
      automatic_anticipation_enabled: false
    },
    metadata: { source: 'playwright-e2e' }
  };
}
