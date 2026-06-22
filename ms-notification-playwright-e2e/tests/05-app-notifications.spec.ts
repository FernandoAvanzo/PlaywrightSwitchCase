import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { notificationPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Notificações de aplicativo', () => {
  test('@local @local-only CT-024 - criar notificação individual', async ({ apiClient }) => {
    const response = await apiClient.createNotification(notificationPayload());

    await expectStatus(response, 201);
    expect(response.headers()['location']).toBeTruthy();
  });

  test('@local @local-only CT-025 - criar coleção de notificações', async ({ apiClient }) => {
    const ownerId = `usuario-${Date.now()}`;
    const response = await apiClient.createNotificationCollection([
      notificationPayload({ title: 'Notificação 1', ownerId, type: 'ORDER' }),
      notificationPayload({ title: 'Notificação 2', ownerId, type: 'SERVICE' })
    ]);

    await expectStatus(response, 201);
  });

  test('@local @local-only CT-026/CT-027 - consultar e atualizar status para READ', async ({ apiClient }) => {
    const ownerId = `usuario-${Date.now()}`;
    const create = await apiClient.createNotification(notificationPayload({ ownerId }));
    await expectStatus(create, 201);

    const list = await apiClient.listNotifications(`?owner-id=${ownerId}&type=ORDER&status=UNREAD&_offset=0&_limit=10&_order-by=createdAt%20DESC`);
    await expectStatus(list, 200);

    const body = await list.json() as unknown;
    const notifications = Array.isArray(body) ? body : (body as { content?: unknown[] }).content ?? [];
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    const id = String((notifications[0] as { id?: string | number }).id);
    const update = await apiClient.updateNotificationStatus(id, 'READ');
    await expectStatus(update, 204);
  });

  test('@local @local-only CT-028 - retornar 404 ao atualizar notificação de outro client_id', async ({ apiClient }) => {
    const ownerId = `usuario-${Date.now()}`;
    const create = await apiClient.createNotification(notificationPayload({ ownerId }));
    await expectStatus(create, 201);

    const list = await apiClient.listNotifications(`?owner-id=${ownerId}&_offset=0&_limit=10`);
    await expectStatus(list, 200);
    const body = await list.json() as unknown;
    const notifications = Array.isArray(body) ? body : (body as { content?: unknown[] }).content ?? [];
    const id = String((notifications[0] as { id?: string | number }).id);

    const update = await apiClient.updateNotificationStatus(id, 'READ', 'outro-client-id');
    await expectStatus(update, 404);
  });
});
