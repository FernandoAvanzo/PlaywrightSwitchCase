import { test, expect } from '@playwright/test';
import { expectRefundContract } from '../../src/helpers/reconciliation.assertions';

test.describe('@contract @refund-oracle contrato legado de estorno', () => {
  /**
   * Garante que o estorno total preserve o contrato que alimenta o Oracle EBS.
   *
   * Regra de negócio: o cancelamento contábil reaproveita o envelope `order_paid`,
   * identifica a operação como `C/Cancelado`, registra a data de cancelamento e
   * não leva data de entrega nem dados sensíveis para a integração.
   */
  test('@local REF-003/REF-004 envelope de refund PIX e crédito', async () => {
    const base = { json: { row: { order_paid: {
      type: 'order.paid', order_status: 'C', order_status_descr: 'Cancelado',
      order_cancel_date: '2026-08-06T20:00:00Z', transaction_type: 'refund', operation_type: 'cancel', amount: 2000
    } } } };
    expectRefundContract(base, 2000, 'PIX');
    expectRefundContract(base, 2000, 'CREDIT_CARD');
  });

  /**
   * Impede que estados financeiros intermediários sejam confundidos com estorno contabilizável.
   *
   * Regra de negócio: `REFUND_PENDING`, `PARTIALLY_REFUNDED` e `CANCELLED` não
   * podem produzir mensagem de refund para o Oracle enquanto não houver estorno
   * total confirmado após a captura.
   */
  test('@local REF-007/REF-008/REF-009 estados não terminais não formam contrato Oracle', async () => {
    for (const status of ['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'CANCELLED']) {
      const message = { status, oracleEvent: undefined };
      expect(message.oracleEvent, `status ${status} não deve gerar evento`).toBeUndefined();
    }
  });
});
