import { APIRequestContext, expect } from '@playwright/test';
import { loadEnvironment } from '../config/environment';
import { CreatePaymentPayload, PaymentResponse } from '../types/payment';

const env = loadEnvironment();
export class MsPaymentClient {
  constructor(private readonly request: APIRequestContext) {}
  async health() { return this.request.get('actuator/health', { headers: env.authHeaders }); }
  async createPayment(payload: CreatePaymentPayload) {
    return this.request.post('payments', { data: payload, headers: env.authHeaders });
  }
  async getPayment(id: string) {
    return this.request.get(`payments/${id}`, { headers: env.authHeaders });
  }
  async capture(id: string, amount?: number, key?: string) {
    return this.request.post(`payments/${id}/capture`, {
      data: amount ? { amount } : {},
      headers: { ...env.authHeaders, ...(key ? { 'X-Idempotency-Key': key } : {}) }
    });
  }
  async waitForStatus(id: string, accepted: string[]): Promise<PaymentResponse> {
    await expect.poll(async () => {
      const response = await this.getPayment(id);
      if (!response.ok()) return false;
      const status = ((await response.json()) as PaymentResponse).status;
      return accepted.includes(status);
    }, { timeout: env.pollTimeoutMs }).toBe(true);
    return (await (await this.getPayment(id)).json()) as PaymentResponse;
  }
}
