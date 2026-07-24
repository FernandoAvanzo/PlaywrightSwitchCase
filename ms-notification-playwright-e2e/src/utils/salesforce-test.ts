import { expect } from '@playwright/test';
import {
  requestJson,
  type LoggedRequest,
  type MockInfraClient
} from '../clients/mock-infra-client';
import type { SqsTestClient } from '../clients/sqs-test-client';

export const salesforcePaths = {
  oauth: '/services/oauth2/token',
  voucher: '/services/apexrest/messaging/voucher',
  appAuth: '/services/apexrest/messaging/appAuth',
  sms: '.*(sms|infobip).*'
} as const;

export type SalesforceOutboundRequest = {
  to?: string;
  text?: string;
  templateName?: string;
  [key: string]: unknown;
};

export async function waitForRequestCount(
  mockInfra: MockInfraClient,
  urlPattern: string,
  expected: number,
  timeout = 15_000
): Promise<void> {
  await expect.poll(
    async () => mockInfra.countRequests(urlPattern),
    { timeout }
  ).toBe(expected);
}

export async function waitForAtLeastOneRequest(
  mockInfra: MockInfraClient,
  urlPattern: string,
  timeout = 15_000
): Promise<void> {
  await expect.poll(
    async () => mockInfra.countRequests(urlPattern),
    { timeout }
  ).toBeGreaterThanOrEqual(1);
}

export async function latestSalesforceRequest(
  mockInfra: MockInfraClient,
  path: string
): Promise<{ request: LoggedRequest; body: SalesforceOutboundRequest }> {
  const request = await mockInfra.latestRequest(path);
  expect(request, `Nenhuma chamada foi capturada em ${path}`).toBeDefined();
  return {
    request: request!,
    body: requestJson<SalesforceOutboundRequest>(request!)
  };
}

export async function waitForQueueMessage(
  sqs: SqsTestClient,
  queueName: string,
  timeout = 20_000
): Promise<string> {
  let messages: string[] = [];
  await expect.poll(async () => {
    messages = await sqs.receive(queueName);
    return messages.length;
  }, { timeout }).toBeGreaterThan(0);
  return messages[0];
}

export async function expectQueueEmpty(sqs: SqsTestClient, queueName: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(await sqs.receive(queueName)).toEqual([]);
}

export async function expectNoSms(mockInfra: MockInfraClient): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(await mockInfra.countRequests(salesforcePaths.sms)).toBe(0);
}
