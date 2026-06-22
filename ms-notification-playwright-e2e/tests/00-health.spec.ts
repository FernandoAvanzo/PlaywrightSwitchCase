import { test, expect } from '../src/fixtures/api';
import { expectStatus } from '../src/utils/response';

/**
 * Valida que o serviço de notificações está inicializado e operacional.
 *
 * Regras de negócio cobertas:
 * - O endpoint de health check deve responder com HTTP 200 quando a aplicação estiver disponível.
 * - O corpo da resposta deve informar o status `UP`, indicando que o serviço está apto a receber requisições.
 * - Este teste funciona como verificação smoke para confirmar que a aplicação subiu corretamente antes da execução de cenários mais complexos.
 */
test.describe('Health check e inicialização', () => {
  test('@smoke CT-001 - serviço deve responder UP', async ({ apiClient }) => {
    const response = await apiClient.health();

    await expectStatus(response, 200);
    const body = await response.json() as { status?: string };
    expect(body.status).toBe('UP');
  });
});
