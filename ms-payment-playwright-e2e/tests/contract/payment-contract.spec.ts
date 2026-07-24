import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';
import { creditPayment, pixPayment } from '../../src/fixtures/payment.factory';

test.describe('@contract contrato público', () => {
  /**
   * Impede o processamento de crédito sem os dados de faturamento e análise exigidos para a operação.
   *
   * Objetivo do teste: confirmar que a ausência de `fraud_analysis`, estrutura que contém o
   * endereço de cobrança e o contexto antifraude, é barrada no contrato de entrada.
   *
   * Regras de negócio e cobertura:
   * - Pagamentos com cartão devem fornecer os dados necessários à análise e ao faturamento.
   * - Uma solicitação de crédito incompleta não pode seguir para o orquestrador financeiro.
   * - A API deve rejeitar o payload inválido com HTTP 400.
   */
  test('@local crédito sem billing deve ser rejeitado', async ({ request }) => {
    const payload = creditPayment();
    delete payload.fraud_analysis;
    const response = await new MsPaymentClient(request).createPayment(payload);
    expect(response.status()).toBe(400);
  });
  /**
   * Mantém o contrato de PIX livre de informações exclusivas de cartão.
   *
   * Objetivo do teste: validar que uma cobrança PIX não aceite `card_details`, evitando mistura
   * de meios de pagamento e roteamento incorreto da transação.
   *
   * Regras de negócio e cobertura:
   * - Dados de token e parcelamento pertencem somente ao fluxo de cartão de crédito.
   * - Um payload PIX com `card_details` é semanticamente inválido.
   * - A inconsistência deve ser rejeitada com HTTP 400 antes da criação da cobrança.
   */
  test('@local PIX não deve aceitar card_details', async ({ request }) => {
    const payload = pixPayment();
    payload.card_details = { card_token: 'nao-permitido' };
    const response = await new MsPaymentClient(request).createPayment(payload);
    expect(response.status()).toBe(400);
  });
  /**
   * Impede a criação de transações financeiras sem valor econômico.
   *
   * Objetivo do teste: assegurar que o valor do pagamento seja validado antes do envio ao
   * provedor, protegendo conciliação, cobrança e registros financeiros.
   *
   * Regras de negócio e cobertura:
   * - O campo `amount` deve representar um valor monetário maior que zero.
   * - Pagamento de crédito com valor zero não pode ser processado.
   * - A API deve responder HTTP 400 para a violação dessa regra.
   */
  test('@local valor zero deve ser rejeitado', async ({ request }) => {
    const response = await new MsPaymentClient(request).createPayment(creditPayment({ amount: 0 }));
    expect(response.status()).toBe(400);
  });
});
