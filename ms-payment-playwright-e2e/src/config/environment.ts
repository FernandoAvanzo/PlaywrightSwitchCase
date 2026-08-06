import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const testEnv = process.env.TEST_ENV ?? 'local';
const candidates = [`.env.${testEnv}`, testEnv === 'local' ? '.env.local' : '', '.env'].filter(Boolean);
for (const file of candidates) {
  const fullPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false, quiet: true });
    break;
  }
}

const schema = z.object({
  TEST_ENV: z.enum(['local', 'hml', 'prod']).default('local'),
  MS_PAYMENT_BASE_URL: z.string().url().default('http://localhost:8001/payment/v1'),
  WIREMOCK_URL: z.string().url().default('http://localhost:8089'),
  WEBHOOK_MOCK_URL: z.string().url().default('http://localhost:8090'),
  WEBHOOK_CALLBACK_URL: z.string().url().default('http://webhook-mock:8080'),
  MALGA_MERCHANT_ID: z.string().default('merchant-local'),
  ACCESS_TOKEN: z.string().optional(),
  CLIENT_ID: z.string().optional(),
  POLL_TIMEOUT_MS: z.coerce.number().positive().default(30_000),
  ALLOW_DESTRUCTIVE_TESTS: z.string().default('false'),
  ORACLE_EVIDENCE_MODE: z.string().default('false'),
  PAYMENT_EVENTS_QUEUE_URL: z.string().url().optional(),
  PAYMENT_START_RECONCILIATION_QUEUE_URL: z.string().url().optional()
});

export type TestEnvironment = {
  name: 'local' | 'hml' | 'prod';
  baseUrl: string;
  wireMockUrl: string;
  webhookMockUrl: string;
  webhookCallbackUrl: string;
  merchantId: string;
  authHeaders: Record<string, string>;
  pollTimeoutMs: number;
  allowDestructiveTests: boolean;
  oracleEvidenceMode: boolean;
  paymentEventsQueueUrl?: string;
  paymentStartReconciliationQueueUrl?: string;
};

export function loadEnvironment(): TestEnvironment {
  const parsed = schema.parse(process.env);
  const authHeaders: Record<string, string> = {};
  if (parsed.ACCESS_TOKEN) authHeaders.access_token = parsed.ACCESS_TOKEN;
  if (parsed.CLIENT_ID) authHeaders.client_id = parsed.CLIENT_ID;
  return {
    name: parsed.TEST_ENV,
    baseUrl: parsed.MS_PAYMENT_BASE_URL.replace(/\/$/, ''),
    wireMockUrl: parsed.WIREMOCK_URL.replace(/\/$/, ''),
    webhookMockUrl: parsed.WEBHOOK_MOCK_URL.replace(/\/$/, ''),
    webhookCallbackUrl: parsed.WEBHOOK_CALLBACK_URL.replace(/\/$/, ''),
    merchantId: parsed.MALGA_MERCHANT_ID,
    authHeaders,
    pollTimeoutMs: parsed.POLL_TIMEOUT_MS,
    allowDestructiveTests: parsed.ALLOW_DESTRUCTIVE_TESTS === 'true',
    oracleEvidenceMode: parsed.ORACLE_EVIDENCE_MODE === 'true',
    paymentEventsQueueUrl: parsed.PAYMENT_EVENTS_QUEUE_URL,
    paymentStartReconciliationQueueUrl: parsed.PAYMENT_START_RECONCILIATION_QUEUE_URL
  };
}
