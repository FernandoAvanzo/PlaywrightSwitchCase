import { test, expect } from '../../src/fixtures/api';
import { notificationPayload } from '../../src/data/payloads';
import { expectStatus } from '../../src/utils/response';

test.describe('E2E - Notificações persistidas', () => {
  test('@e2e @local @local-only E2E-005 - criação, leitura e atualização', async ({ apiClient }) => {
    const ownerId = `usuario-e2e-${Date.now()}`;

    const create = await apiClient.createNotification(notificationPayload({ ownerId }));
    await expectStatus(create, 201);

    const list = await apiClient.listNotifications(`?owner-id=${ownerId}&status=UNREAD&_offset=0&_limit=10`);
    await expectStatus(list, 200);

    const body = await list.json() as unknown;
    const notifications = Array.isArray(body) ? body : (body as { content?: unknown[] }).content ?? [];
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    const id = String((notifications[0] as { id?: string | number }).id);
    const patch = await apiClient.updateNotificationStatus(id, 'READ');
    await expectStatus(patch, 204);
  });
});
