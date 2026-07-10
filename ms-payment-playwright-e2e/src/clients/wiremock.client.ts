import { APIRequestContext, expect } from '@playwright/test';
import { loadEnvironment } from '../config/environment';
const env = loadEnvironment();
export class WireMockClient {
  constructor(private readonly request: APIRequestContext) {}
  async reset() { await this.request.post(`${env.wireMockUrl}/__admin/reset`); }
  async requests(method: string, urlPath: string) {
    const response = await this.request.post(`${env.wireMockUrl}/__admin/requests/find`, {
      data: { method, urlPath }
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as { requests: Array<{ body?: string; headers?: Record<string, unknown> }> };
  }
  async setScenario(mapping: Record<string, unknown>) {
    const response = await this.request.post(`${env.wireMockUrl}/__admin/mappings`, { data: mapping });
    expect(response.ok()).toBeTruthy();
  }
}
