import { test, expect } from '@playwright/test';
import { MsPaymentClient } from '../../src/clients/ms-payment.client';

/**
 * Garante que o serviço de pagamentos esteja disponível antes das jornadas financeiras.
 *
 * Objetivo do teste: executar uma verificação smoke segura para ambientes local, homologação e
 * produção, confirmando que a API pode receber novas solicitações.
 *
 * Regras de negócio e cobertura:
 * - O endpoint de saúde deve responder com um status HTTP de sucesso.
 * - O contrato de disponibilidade deve informar `status=UP`.
 * - O cenário não altera dados e funciona como pré-condição operacional da suíte.
 */
test('@smoke @local @hml @prod-safe API deve estar saudável', async ({ request }) => {
  const response = await new MsPaymentClient(request).health();
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe('UP');
});
