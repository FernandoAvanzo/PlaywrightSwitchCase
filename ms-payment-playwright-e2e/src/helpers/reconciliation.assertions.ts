import { expect } from '@playwright/test';

export function expectRefundContract(payload: unknown, amount: number, paymentMethod: 'PIX' | 'CREDIT_CARD') {
  const root = payload as any;
  const row = root?.json?.row?.order_paid ?? root?.row?.order_paid;
  expect(row, 'o envelope legado json.row.order_paid deve existir').toBeTruthy();
  expect(row.type).toBe('order.paid');
  expect(row.order_status).toBe('C');
  expect(row.order_status_descr).toBe('Cancelado');
  expect(row.order_cancel_date).toBeTruthy();
  expect(row.order_delivery_date).toBeUndefined();

  const serialized = JSON.stringify(payload);
  expect(serialized).not.toMatch(/order_refunded|order\.refunded/);
  expect(serialized).not.toMatch(/\b(pan|cvv|securityCode|cardNumber)\b/i);
  if (paymentMethod === 'PIX') expect(serialized).toMatch(/refund/i);
  if (paymentMethod === 'CREDIT_CARD') {
    expect(serialized).toMatch(/refund/i);
    expect(serialized).toMatch(/cancel/i);
  }
  expect(serialized).toContain(String(amount));
}
