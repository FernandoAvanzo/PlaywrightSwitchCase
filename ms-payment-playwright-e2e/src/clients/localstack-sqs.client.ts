import { APIRequestContext, expect } from '@playwright/test';
import { loadEnvironment } from '../config/environment';

const env = loadEnvironment();

/** Leitura read-only da fila local; a suíte nunca publica nem remove mensagens. */
export class LocalStackSqsClient {
  constructor(private readonly request: APIRequestContext) {}

  async receive(queueUrl = env.paymentStartReconciliationQueueUrl ?? '') {
    expect(queueUrl, 'configure PAYMENT_START_RECONCILIATION_QUEUE_URL para observar a fila').toBeTruthy();
    const response = await this.request.post(`${queueUrl}/`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'Action=ReceiveMessage&MaxNumberOfMessages=10&VisibilityTimeout=0&WaitTimeSeconds=1'
    });
    expect(response.ok()).toBeTruthy();
    return response.text();
  }
}
