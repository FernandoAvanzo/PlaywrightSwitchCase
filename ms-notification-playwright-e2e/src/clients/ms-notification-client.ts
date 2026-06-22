import { expect } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { EnvironmentConfig } from '../config/environment';

export class MsNotificationClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly env: EnvironmentConfig
  ) {}

  health(): Promise<APIResponse> {
    return this.request.get('/actuator/health');
  }

  sendSms(data: unknown, credentialsAlias = this.env.credentialsAlias): Promise<APIResponse> {
    return this.request.post('/sms', {
      headers: { 'Credentials-Alias': credentialsAlias },
      data
    });
  }

  sendWhatsapp(data: unknown, credentialsAlias = this.env.credentialsAlias): Promise<APIResponse> {
    return this.request.post('/whatsapp', {
      headers: { 'Credentials-Alias': credentialsAlias },
      data
    });
  }

  sendVoucherAdhoc(data: unknown, credentialsAlias = this.env.credentialsAlias): Promise<APIResponse> {
    return this.request.post('/vouchers/adhoc', {
      headers: { 'Credentials-Alias': credentialsAlias },
      data
    });
  }

  routeasyWebhook(data: unknown): Promise<APIResponse> {
    return this.request.post('/routeasy-webhook', { data });
  }

  createNotification(data: unknown, clientId = this.env.clientId): Promise<APIResponse> {
    return this.request.post('/notifications', {
      headers: { client_id: clientId },
      data
    });
  }

  createNotificationCollection(data: unknown, clientId = this.env.clientId): Promise<APIResponse> {
    return this.request.post('/notifications/collection', {
      headers: { client_id: clientId },
      data
    });
  }

  listNotifications(query = '', clientId = this.env.clientId): Promise<APIResponse> {
    return this.request.get(`/notifications${query}`, {
      headers: { client_id: clientId }
    });
  }

  updateNotificationStatus(id: string, status: string, clientId = this.env.clientId): Promise<APIResponse> {
    return this.request.patch(`/notifications/${id}`, {
      headers: { client_id: clientId },
      data: { status }
    });
  }
}

export async function expectJsonResponse(response: APIResponse): Promise<Record<string, unknown>> {
  expect(response.headers()['content-type'] ?? '').toContain('application/json');
  return response.json() as Promise<Record<string, unknown>>;
}
