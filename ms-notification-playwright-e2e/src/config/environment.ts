import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

export type ExecutionEnvironment = 'local' | 'hml' | 'prod';

export interface EnvironmentConfig {
  name: ExecutionEnvironment;
  baseURL: string;
  mockBaseURL?: string;
  awsEndpoint?: string;
  awsRegion: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  clientId: string;
  credentialsAlias: string;
  testTimeoutMs: number;
  queues: {
    smsRetry: string;
    smsHospital: string;
    whatsappRetry: string;
    whatsappHospital: string;
    routeasyHospital: string;
    notificationRetry: string;
  };
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

export function loadEnvironment(): EnvironmentConfig {
  const name = (process.env.TEST_ENV ?? 'local') as ExecutionEnvironment;
  if (!['local', 'hml', 'prod'].includes(name)) {
    throw new Error(`TEST_ENV inválido: ${name}. Use local, hml ou prod.`);
  }

  dotenv.config({ path: path.resolve(process.cwd(), `.env.${name}`) });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });

  const baseURL = requireEnv('MS_NOTIFICATION_BASE_URL');

  return {
    name,
    baseURL,
    mockBaseURL: process.env.MOCK_BASE_URL || undefined,
    awsEndpoint: process.env.AWS_ENDPOINT || undefined,
    awsRegion: process.env.AWS_REGION ?? 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    clientId: process.env.CLIENT_ID ?? 'client-test-001',
    credentialsAlias: process.env.CREDENTIALS_ALIAS_VOUCHERS ?? 'vouchers',
    testTimeoutMs: Number(process.env.TEST_TIMEOUT_MS ?? 60_000),
    queues: {
      smsRetry: process.env.SQS_SMS_RETRY_QUEUE ?? 'ms-notification-sms-retry',
      smsHospital: process.env.SQS_SMS_HOSPITAL_QUEUE ?? 'ms-notification-sms-hospital',
      whatsappRetry: process.env.SQS_WHATSAPP_RETRY_QUEUE ?? 'ms-notification-whatsapp-retry',
      whatsappHospital: process.env.SQS_WHATSAPP_HOSPITAL_QUEUE ?? 'ms-notification-whatsapp-hospital',
      routeasyHospital: process.env.SQS_ROUTEASY_HOSPITAL_QUEUE ?? 'ms-notification-routeasy-hospital',
      notificationRetry: process.env.SQS_NOTIFICATION_RETRY_QUEUE ?? 'ms-notification-notification-retry'
    }
  };
}

export const env = loadEnvironment();

export function isLocal(): boolean {
  return env.name === 'local';
}

export function isProd(): boolean {
  return env.name === 'prod';
}
