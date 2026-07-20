import path from 'node:path';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

export type TestEnvironment = 'local' | 'local-hml' | 'hml' | 'prod';

const HML_MUTATION_CONFIRMATION = 'I_UNDERSTAND_HML_MUTATIONS';

const schema = z.object({
  TEST_ENV: z.enum(['local', 'local-hml', 'hml', 'prod']).default('local'),
  BASE_URL: z.string().url(),
  ACCEPT_LANGUAGE: z.string().default('pt_BR'),
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
  FEPAS_EFFECTIVE_ID: z.string().optional().default('')
});

export type SuiteEnv = ReturnType<typeof loadEnv>;

export function loadEnv(envName: TestEnvironment = (process.env.TEST_ENV ?? 'local') as TestEnvironment) {
  const root = process.cwd();
  const envFile = path.join(root, `.env.${envName}`);
  const exampleFile = path.join(root, `.env.${envName}.example`);

  if (existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true, quiet: true });
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
    acceptLanguage: parsed.ACCEPT_LANGUAGE,
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
    }
  };
}
