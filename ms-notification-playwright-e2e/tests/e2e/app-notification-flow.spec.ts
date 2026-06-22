import { test, expect } from '../../src/fixtures/api';
import { notificationPayload } from '../../src/data/payloads';
import { expectStatus } from '../../src/utils/response';

test.describe('E2E - Notificações persistidas', () => {
  /**
   * Valida o fluxo ponta a ponta de uma notificação persistida no aplicativo,
   * cobrindo desde a criação do recurso até sua consulta e atualização de status.
   *
   * Regras de negócio cobertas:
   * - Uma notificação válida deve ser criada com sucesso para um proprietário específico.
   * - A criação da notificação deve retornar HTTP 201, indicando persistência do recurso.
   * - A notificação recém-criada deve estar disponível para consulta pelo `owner-id` informado.
   * - A listagem deve permitir filtrar notificações por proprietário, tipo, status e paginação.
   * - Notificações criadas inicialmente devem poder ser encontradas com status `UNREAD`.
   * - Uma notificação existente deve permitir atualização de status para `READ`.
   * - A atualização de status bem-sucedida deve retornar HTTP 204, indicando execução sem corpo de resposta.
   * - O fluxo completo deve garantir que o ciclo de vida básico da notificação persistida funcione corretamente.
   */
  test('@e2e @local @local-only E2E-005 - criação, leitura e atualização', async ({ apiClient }) => {
    const ownerId = `usuario-e2e-${Date.now()}`;

    const create = await apiClient.createNotification(notificationPayload({ ownerId }));
    await expectStatus(create, 201);

    const list = await apiClient.listNotifications(`?owner-id=${ownerId}&type=ORDER&status=UNREAD&_offset=0&_limit=10`);
    await expectStatus(list, 200);

    const body = await list.json() as unknown;
    const notifications = Array.isArray(body) ? body : (body as { content?: unknown[] }).content ?? [];
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    const id = String((notifications[0] as { id?: string | number }).id);
    const patch = await apiClient.updateNotificationStatus(id, 'READ');
    await expectStatus(patch, 204);
  });
});
