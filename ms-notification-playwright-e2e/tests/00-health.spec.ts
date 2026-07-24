import { test, expect } from '../src/fixtures/api';
import { expectStatus } from '../src/utils/response';

test.describe('Health check e inicialização', () => {
  /**
   * Garante que o serviço de notificações esteja disponível para sustentar os fluxos de comunicação.
   *
   * Objetivo do teste: confirmar, em uma verificação smoke, que a aplicação iniciou corretamente
   * e está apta a receber solicitações antes da execução dos cenários funcionais.
   *
   * Regras de negócio e cobertura:
   * - O endpoint de saúde deve responder com HTTP 200 quando o serviço estiver operacional.
   * - O contrato de disponibilidade deve informar o status `UP`.
   * - Uma falha nesta verificação impede considerar os canais de notificação prontos para uso.
   */
  test('@smoke CT-001 - serviço deve responder UP', async ({ apiClient }) => {
    const response = await apiClient.health();

    await expectStatus(response, 200);
    const body = await response.json() as { status?: string };
    expect(body.status).toBe('UP');
  });
});
