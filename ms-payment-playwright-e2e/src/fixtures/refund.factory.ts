import { randomUUID } from 'node:crypto';

export type RefundStatus = 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'REFUND_PENDING' | 'CANCELLED';

export function malgaPaymentWebhook(chargeId: string, status: 'authorized' | 'paid' = 'authorized', merchantOrderId: string) {
  return {
    id: `evt-${randomUUID()}`,
    object: 'event',
    event: 'charge.updated',
    createdAt: new Date().toISOString(),
    data: { id: chargeId, orderId: merchantOrderId, status, transactionRequests: [] }
  };
}

export function malgaRefundWebhook(chargeId: string, status: RefundStatus, amount: number, merchantOrderId: string) {
  const id = `evt-${randomUUID()}`;
  return {
    id,
    object: 'event',
    type: 'charge.updated',
    event: 'charge.updated',
    createdAt: new Date().toISOString(),
    data: {
      id: chargeId,
      orderId: merchantOrderId,
      status,
      amount,
      refundedAmount: amount,
      transactionRequests: [{
        id: `refund-${id}`,
        requestId: `request-${id}`,
        requestType: 'void',
        requestStatus: status === 'REFUNDED' ? 'success' : status.toLowerCase(),
        transactionId: `provider-refund-${id}`,
        amount
      }]
    }
  };
}

export function malgaWebhookHeaders(idempotencyKey: string) {
  return {
    'X-Idempotency-Key': idempotencyKey,
    'X-Plug-Date': new Date().toISOString(),
    'X-Plug-Signature': 'local-test-signature'
  };
}
