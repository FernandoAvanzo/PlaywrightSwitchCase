export interface Address {
  city: string; state: string; street: string; street_number: string;
  neighborhood: string; complement?: string; country: string; zipcode: string;
}
export interface SplitRuleInput {
  seller_id: string; amount: number; liable: boolean; processing_fee: boolean;
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
    customer: { billing_address: Address };
  };
  split_rules?: SplitRuleInput[];
  reconciliation_data?: { vendor_name: string; subsidiary: string };
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
