import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { notificationPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Notificações de aplicativo', () => {
  /**
   * Valida a criação de uma notificação individual de aplicativo.
   *
   * Regras de negócio cobertas:
   * - Uma requisição válida para criação de notificação individual deve ser aceita pela API.
   * - A criação bem-sucedida deve retornar HTTP 201, indicando que o recurso foi criado.
   * - A resposta deve conter o header `location`, permitindo identificar ou acessar o recurso criado.
   * - O contrato da API deve garantir que notificações individuais possam ser persistidas quando o payload atende aos dados obrigatórios.
   */
  test('@local @local-only CT-024 - criar notificação individual', async ({ apiClient }) => {
    const response = await apiClient.createNotification(notificationPayload());

    await expectStatus(response, 201);
    expect(response.headers()['location']).toBeTruthy();
  });

  /**
   * Valida a criação de uma coleção de notificações de aplicativo em uma única requisição.
   *
   * Regras de negócio cobertas:
   * - A API deve aceitar a criação em lote de múltiplas notificações válidas.
   * - Notificações da mesma coleção podem possuir tipos diferentes, como ORDER e SERVICE.
   * - Todas as notificações enviadas no lote devem estar associadas ao mesmo proprietário quando informado no payload.
   * - A criação bem-sucedida da coleção deve retornar HTTP 201, indicando persistência dos recursos solicitados.
   */
  test('@local @local-only CT-025 - criar coleção de notificações', async ({ apiClient }) => {
    const ownerId = `usuario-${Date.now()}`;
    const response = await apiClient.createNotificationCollection([
      notificationPayload({ title: 'Notificação 1', ownerId, type: 'ORDER' }),
      notificationPayload({ title: 'Notificação 2', ownerId, type: 'SERVICE' })
    ]);

    await expectStatus(response, 201);
  });

  /**
   * Valida o fluxo de consulta de notificações e atualização de status para READ.
   *
   * Regras de negócio cobertas:
   * - Uma notificação criada com sucesso deve ficar disponível para consulta pelo proprietário.
   * - A listagem deve permitir filtros por owner-id, tipo, status, paginação e ordenação.
   * - Notificações recém-criadas devem poder ser encontradas com status UNREAD antes da atualização.
   * - Uma notificação existente deve permitir alteração de status para READ.
   * - A atualização de status bem-sucedida deve retornar HTTP 204, indicando execução sem conteúdo de resposta.
   */
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

  /**
   * Valida que uma notificação não pode ser atualizada por um client_id diferente daquele autorizado.
   *
   * Regras de negócio cobertas:
   * - Uma notificação criada deve estar vinculada ao contexto de cliente autorizado para sua manutenção.
   * - A consulta deve retornar notificações pertencentes ao proprietário informado quando os filtros são válidos.
   * - A atualização de status deve respeitar o isolamento por client_id.
   * - Tentativas de atualizar uma notificação usando outro client_id não devem expor ou alterar o recurso.
   * - A API deve retornar HTTP 404 quando o recurso não pertence ao client_id informado, preservando o isolamento entre clientes.
   */
  test('@local @local-only CT-028 - retornar 404 ao atualizar notificação de outro client_id', async ({ apiClient }) => {
    const ownerId = `usuario-${Date.now()}`;
    const create = await apiClient.createNotification(notificationPayload({ ownerId }));
    await expectStatus(create, 201);

    const list = await apiClient.listNotifications(`?owner-id=${ownerId}&type=ORDER&_offset=0&_limit=10`);
    await expectStatus(list, 200);
    const body = await list.json() as unknown;
    const notifications = Array.isArray(body) ? body : (body as { content?: unknown[] }).content ?? [];
    const id = String((notifications[0] as { id?: string | number }).id);

    const update = await apiClient.updateNotificationStatus(id, 'READ', 'outro-client-id');
    await expectStatus(update, 404);
  });
});
