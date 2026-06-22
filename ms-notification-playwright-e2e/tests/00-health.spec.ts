import { test, expect } from '../src/fixtures/api';
import { expectStatus } from '../src/utils/response';

test.describe('Health check e inicialização', () => {
  test('@smoke CT-001 - serviço deve responder UP', async ({ apiClient }) => {
    const response = await apiClient.health();

    await expectStatus(response, 200);
    const body = await response.json() as { status?: string };
    expect(body.status).toBe('UP');
  });
});
