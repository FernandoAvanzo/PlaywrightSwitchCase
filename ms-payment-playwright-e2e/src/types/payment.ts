export interface Address {
  street: string;
  number: string;
  complement?: string;
  zip_code: string;
  city: string;
  state: string;
  country: string;
  district?: string;
  reference?: string;
}
export interface SplitReceiverInput {
  document_type: string;
  document_number: string;
  amount: number;
}
export interface CreatePaymentPayload {
  merchant_code: string;
  merchant_id: string;
  merchant_payment_id: string;
  merchant_order_id: string;
  payment_method_type: 'PIX' | 'CREDIT_CARD';
  currency: 'BRL';
  amount: number;
  webhook_url: string;
  customer: {
    name: string; email: string; document_type: string; document_number: string;
    document_country: string; phone: string;
  };
  card_details?: { card_token: string; installments?: number };
  fraud_analysis?: {
    sla?: number;
    customer: {
      name: string;
      identity: string;
      identity_type: string;
      email?: string;
      phone?: string;
      birthdate?: string;
      registration_date?: string;
      billing_address: Address;
      browser: {
        browser_fingerprint: string;
        cookies_accepted?: boolean;
        email?: string;
        host_name?: string;
        ip_address?: string;
        type?: string;
      };
    };
    cart: {
      items: Array<{
        name: string;
        quantity: number;
        sku: string;
        unit_price: number;
        risk?: string;
        locality?: string;
        date?: string;
        type?: number;
        genre?: string;
        tickets?: {
          quantity_ticket_sale?: number;
          quantity_event_house?: number;
          convenience_fee_value?: number;
          quantity_full?: number;
          quantity_half?: number;
          batch?: number;
        };
        location?: Address;
      }>;
    };
  };
  split_receivers?: SplitReceiverInput[];
  reconciliation_data?: { vendor_name: string; subsidiary: string };
}

export interface UpsertSplitReceiverPayload {
  merchant_id: string;
  receiver_type: 'NATURAL_PERSON' | 'LEGAL_PERSON';
  owner: {
    name: string;
    email: string;
    phone_number: string;
    birthdate: string;
    document: { type: string; number: string; country: string };
    address: {
      street: string;
      street_number: string;
      complement?: string;
      zip_code: string;
      city: string;
      state: string;
      country: string;
      district?: string;
    };
    business_category?: string;
  };
  mcc: number;
  bank_account: {
    holder_name: string;
    holder_document: string;
    bank: string;
    branch_number: string;
    branch_check_digit?: string;
    account_number: string;
    account_check_digit?: string;
    type: string;
  };
  transfer_policy: {
    transfer_day: number;
    transfer_enabled: boolean;
    transfer_interval: string;
    automatic_anticipation_enabled: boolean;
  };
  metadata?: Record<string, unknown>;
}
export interface PaymentResponse {
  id: string;
  status: string;
  payment_method_type: string;
  orchestrator?: string;
  capture_mode?: string;
  authorized_amount?: number;
  captured_amount?: number;
  card?: { brand?: string; masked_pan?: string };
}
