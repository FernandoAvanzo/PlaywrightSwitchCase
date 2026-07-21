import path from 'node:path';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

export type TestEnvironment = 'local' | 'local-hml' | 'hml' | 'prod';

const HML_MUTATION_CONFIRMATION = 'I_UNDERSTAND_HML_MUTATIONS';

const schema = z.object({
  TEST_ENV: z.enum(['local', 'local-hml', 'hml', 'prod']).default('local'),
  BASE_URL: z.string().url(),
  ACCEPT_LANGUAGE: z.string().default('pt-BR'),
  ALLOW_MUTATION: z.string().default('false'),
  ENABLE_MUTATING_E2E: z.string().default('false'),
  MUTATION_CONFIRMATION: z.string().optional().default(''),
  SETUP_CONTRACT: z.enum(['legacy', 'notification-channel']).default('legacy'),
  WIREMOCK_NOTIFICATION_ADMIN_URL: z.string().optional().default(''),
  WIREMOCK_SOA_ADMIN_URL: z.string().optional().default(''),
  CUSTOMER_ID: z.string().optional().default(''),
  CUSTOMER_SITE_ID: z.string().optional().default(''),
  CNPJ_DISTRIBUIDOR: z.string().optional().default(''),
  PRODUCT_CODE: z.string().optional().default(''),
  PRODUCT_CODE_BARCODE: z.string().optional().default(''),
  PHONE_DDD: z.string().optional().default(''),
  PHONE_NUMBER: z.string().optional().default(''),
  NSU_VENDA: z.string().optional().default(''),
  AUTH_CODE: z.string().optional().default(''),
  FEPAS_EFFECTIVE_ID: z.string().optional().default(''),
  BATCH_CASE_ID_PREFIX: z.string().default('PW-422007'),
  BATCH_VALIDATION_CHANNEL: z.string().default('APP'),
  BATCH_CODE_RESALE: z.string().optional().default(''),
  BATCH_ADDRESS_VALIDATION: z.string().optional().default(''),
  BATCH_DOCUMENT_RESALE: z.string().optional().default(''),
  BATCH_USER_TYPE: z.string().default('CONSUMIDOR_FINAL'),
  BATCH_PRODUCT_CODE: z.string().optional().default(''),
  BATCH_CONSUMER_DOCUMENT: z.string().optional().default(''),
  BATCH_CONSUMER_PHONE_NUMBER: z.string().optional().default(''),
  BATCH_DESTINATION_COMPANY: z.string().optional().default(''),
  BATCH_VOUCHER_INSUFFICIENT_STOCK: z.string().optional().default(''),
  BATCH_VOUCHER_SUCCESS: z.string().optional().default(''),
  BATCH_VOUCHER_MISSING_COORDINATES: z.string().optional().default(''),
  BATCH_VOUCHER_COORDINATE_PROPAGATION: z.string().optional().default(''),
  BATCH_VOUCHER_NOT_FOUND: z.string().optional().default(''),
  BATCH_MIXED_VOUCHER_SUCCESS: z.string().optional().default(''),
  BATCH_MIXED_VOUCHER_INSUFFICIENT_STOCK: z.string().optional().default(''),
  BATCH_WEBHOOK_URL: z.string().optional().default(''),
  BATCH_VOUCHER_WEBHOOK_INSUFFICIENT_STOCK: z.string().optional().default(''),
  BATCH_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  BATCH_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000)
});

export type SuiteEnv = ReturnType<typeof loadEnv>;

export function loadEnv(envName: TestEnvironment = (process.env.TEST_ENV ?? 'local') as TestEnvironment) {
  const root = process.cwd();
  const envFile = path.join(root, `.env.${envName}`);
  const exampleFile = path.join(root, `.env.${envName}.example`);
  const preferProcessEnv = process.env.PW_PROCESS_ENV_OVERRIDES === 'true';

  if (existsSync(envFile)) {
    // O arquivo do ambiente protege a suíte de variáveis genéricas da estação, como BASE_URL.
    // CI e validações pontuais podem optar explicitamente por valores do processo.
    dotenv.config({ path: envFile, override: !preferProcessEnv, quiet: true });
  } else if (existsSync(exampleFile)) {
    dotenv.config({ path: exampleFile, override: false, quiet: true });
  }

  const parsed = schema.parse({
    ...process.env,
    TEST_ENV: envName
  });

  const mutationRequested = parsed.ALLOW_MUTATION === 'true';
  const targetsSharedHml = parsed.TEST_ENV === 'hml' || parsed.TEST_ENV === 'local-hml';
  const mutationConfirmationValid = !targetsSharedHml || parsed.MUTATION_CONFIRMATION === HML_MUTATION_CONFIRMATION;

  return {
    name: parsed.TEST_ENV,
    baseUrl: parsed.BASE_URL,
    acceptLanguage: parsed.ACCEPT_LANGUAGE.replace('_', '-'),
    allowMutation: mutationRequested && mutationConfirmationValid && parsed.TEST_ENV !== 'prod',
    mutationRequested,
    mutationConfirmationValid,
    setupContract: parsed.SETUP_CONTRACT,
    enableMutatingE2E: parsed.ENABLE_MUTATING_E2E === 'true',
    wiremockNotificationAdminUrl: parsed.WIREMOCK_NOTIFICATION_ADMIN_URL,
    wiremockSoaAdminUrl: parsed.WIREMOCK_SOA_ADMIN_URL,
    data: {
      customerId: parsed.CUSTOMER_ID,
      customerSiteId: parsed.CUSTOMER_SITE_ID,
      cnpjDistribuidor: parsed.CNPJ_DISTRIBUIDOR,
      productCode: parsed.PRODUCT_CODE,
      productCodeBarcode: parsed.PRODUCT_CODE_BARCODE,
      phoneDdd: parsed.PHONE_DDD,
      phoneNumber: parsed.PHONE_NUMBER,
      nsuVenda: parsed.NSU_VENDA,
      authCode: parsed.AUTH_CODE,
      fepasEffectiveId: parsed.FEPAS_EFFECTIVE_ID
    },
    batch: {
      caseIdPrefix: parsed.BATCH_CASE_ID_PREFIX,
      validationChannel: parsed.BATCH_VALIDATION_CHANNEL,
      codeResale: parsed.BATCH_CODE_RESALE,
      addressValidation: parsed.BATCH_ADDRESS_VALIDATION,
      documentResale: parsed.BATCH_DOCUMENT_RESALE,
      userType: parsed.BATCH_USER_TYPE,
      productCode: parsed.BATCH_PRODUCT_CODE,
      consumerDocument: parsed.BATCH_CONSUMER_DOCUMENT,
      consumerPhoneNumber: parsed.BATCH_CONSUMER_PHONE_NUMBER,
      destinationCompany: parsed.BATCH_DESTINATION_COMPANY,
      voucherInsufficientStock: parsed.BATCH_VOUCHER_INSUFFICIENT_STOCK,
      voucherSuccess: parsed.BATCH_VOUCHER_SUCCESS,
      voucherMissingCoordinates: parsed.BATCH_VOUCHER_MISSING_COORDINATES,
      voucherCoordinatePropagation: parsed.BATCH_VOUCHER_COORDINATE_PROPAGATION,
      voucherNotFound: parsed.BATCH_VOUCHER_NOT_FOUND,
      mixedVoucherSuccess: parsed.BATCH_MIXED_VOUCHER_SUCCESS,
      mixedVoucherInsufficientStock: parsed.BATCH_MIXED_VOUCHER_INSUFFICIENT_STOCK,
      webhookUrl: parsed.BATCH_WEBHOOK_URL,
      voucherWebhookInsufficientStock: parsed.BATCH_VOUCHER_WEBHOOK_INSUFFICIENT_STOCK,
      pollTimeoutMs: parsed.BATCH_POLL_TIMEOUT_MS,
      pollIntervalMs: parsed.BATCH_POLL_INTERVAL_MS
    }
  };
}
