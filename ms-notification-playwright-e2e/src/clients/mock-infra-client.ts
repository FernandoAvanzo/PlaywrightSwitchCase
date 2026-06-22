import { request, APIRequestContext, expect } from '@playwright/test';

type StubOptions = {
  name: string;
  urlPattern: string;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export class MockInfraClient {
  private context?: APIRequestContext;

  constructor(private readonly baseURL?: string) {}

  private async api(): Promise<APIRequestContext> {
    if (!this.baseURL) {
      throw new Error('MOCK_BASE_URL não configurado para este ambiente.');
    }
    this.context ??= await request.newContext({ baseURL: this.baseURL });
    return this.context;
  }

  async reset(): Promise<void> {
    if (!this.baseURL) return;
    const api = await this.api();
    await api.delete('/__admin/mappings');
    await api.delete('/__admin/requests');
  }

  async stubPost(options: StubOptions): Promise<void> {
    const api = await this.api();
    const response = await api.post('/__admin/mappings', {
      data: {
        name: options.name,
        request: {
          method: 'POST',
          urlPattern: options.urlPattern
        },
        response: {
          status: options.status,
          jsonBody: options.body ?? { status: 'OK', providerMessageId: `mock-${Date.now()}` },
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers ?? {})
          }
        }
      }
    });
    expect(response.ok()).toBeTruthy();
  }

  async stubSmsSuccess(): Promise<void> {
    await this.stubPost({
      name: 'sms-provider-success',
      urlPattern: '.*(sms|infobip).*',
      status: 200,
      body: { status: 'ACCEPTED', channel: 'SMS', providerMessageId: 'sms-mock-ok' }
    });
  }

  async stubSmsFailure(status = 500): Promise<void> {
    await this.stubPost({
      name: `sms-provider-failure-${status}`,
      urlPattern: '.*(sms|infobip).*',
      status,
      body: { status: 'ERROR', code: status, message: 'SMS provider mocked failure' }
    });
  }

  async stubWhatsappSuccess(): Promise<void> {
    await this.stubPost({
      name: 'whatsapp-provider-success',
      urlPattern: '.*(whatsapp|infobip).*',
      status: 200,
      body: { status: 'ACCEPTED', channel: 'WHATSAPP', providerMessageId: 'wa-mock-ok' }
    });
  }

  async stubWhatsappFailure(status = 500): Promise<void> {
    await this.stubPost({
      name: `whatsapp-provider-failure-${status}`,
      urlPattern: '.*(whatsapp|infobip).*',
      status,
      body: { status: 'REJECTED', code: status, message: 'WhatsApp provider mocked failure' }
    });
  }

  async stubShortenerSuccess(): Promise<void> {
    await this.stubPost({
      name: 'shortener-success',
      urlPattern: '.*(shortener|firebase).*',
      status: 200,
      body: { shortLink: 'https://short.local/abc123', previewLink: 'https://short.local/preview/abc123' }
    });
  }

  async stubShortenerFailure(): Promise<void> {
    await this.stubPost({
      name: 'shortener-failure',
      urlPattern: '.*(shortener|firebase).*',
      status: 500,
      body: { error: { message: 'shortener mocked failure' } }
    });
  }

  async countRequests(urlPattern: string): Promise<number> {
    const api = await this.api();
    const response = await api.post('/__admin/requests/count', {
      data: {
        requestPattern: {
          method: 'POST',
          urlPattern
        }
      }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json() as { count: number };
    return body.count;
  }
}
