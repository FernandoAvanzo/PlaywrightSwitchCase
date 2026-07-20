import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

type WireMockCountResponse = {
  count: number;
};

type WireMockRequestJournalResponse = {
  requests: Array<{
    request?: {
      body?: string;
    };
  }>;
};

export class WireMockClient {
  private context?: APIRequestContext;

  constructor(private readonly adminUrl: string) {}

  private async api() {
    if (!this.adminUrl) {
      throw new Error('WIREMOCK admin URL não configurada.');
    }

    if (!this.context) {
      this.context = await playwrightRequest.newContext({
        extraHTTPHeaders: { 'Content-Type': 'application/json' }
      });
    }

    return this.context;
  }

  private url(path: string) {
    return `${this.adminUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  async resetAllToDefaultMappings() {
    const api = await this.api();
    const response = await api.post(this.url('reset'));
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async resetRequests() {
    const api = await this.api();
    const response = await api.post(this.url('requests/reset'));
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async setEndpointFailure(path: string, status = 500) {
    const api = await this.api();
    await api.post(this.url('mappings'), {
      data: {
        priority: 1,
        request: { method: 'POST', urlPath: path },
        response: {
          status,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: `forced failure for ${path}` }
        }
      }
    });
  }

  async countPostRequests(path: string) {
    const api = await this.api();
    const response = await api.post(this.url('requests/count'), {
      data: {
        method: 'POST',
        urlPath: path
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as WireMockCountResponse;
    return body.count;
  }

  async postRequestBodies(path: string) {
    const api = await this.api();
    const response = await api.post(this.url('requests/find'), {
      data: {
        method: 'POST',
        urlPath: path
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as WireMockRequestJournalResponse;
    return body.requests
      .map(entry => entry.request?.body)
      .filter((requestBody): requestBody is string => typeof requestBody === 'string');
  }

  async dispose() {
    await this.context?.dispose();
    this.context = undefined;
  }
}
