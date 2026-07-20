import { loadEnv } from '../src/config/env.js';

const env = loadEnv();

const requiredForSmoke = ['BASE_URL'];
const requiredForMutation = [
  'CUSTOMER_ID',
  'CUSTOMER_SITE_ID',
  'CNPJ_DISTRIBUIDOR',
  'PRODUCT_CODE',
  'PHONE_DDD',
  'PHONE_NUMBER'
];

const missingSmoke = requiredForSmoke.filter(name => !process.env[name]);
const missingMutation = requiredForMutation.filter(name => !process.env[name]);
const missingBatchMass = Object.entries({
  BATCH_CODE_RESALE: env.batch.codeResale,
  BATCH_ADDRESS_VALIDATION: env.batch.addressValidation,
  BATCH_DOCUMENT_RESALE: env.batch.documentResale,
  BATCH_PRODUCT_CODE: env.batch.productCode,
  BATCH_CONSUMER_DOCUMENT: env.batch.consumerDocument,
  BATCH_CONSUMER_PHONE_NUMBER: env.batch.consumerPhoneNumber,
  BATCH_VOUCHER_INSUFFICIENT_STOCK: env.batch.voucherInsufficientStock,
  BATCH_VOUCHER_SUCCESS: env.batch.voucherSuccess,
  BATCH_VOUCHER_MISSING_COORDINATES: env.batch.voucherMissingCoordinates,
  BATCH_VOUCHER_COORDINATE_PROPAGATION: env.batch.voucherCoordinatePropagation,
  BATCH_VOUCHER_NOT_FOUND: env.batch.voucherNotFound,
  BATCH_MIXED_VOUCHER_SUCCESS: env.batch.mixedVoucherSuccess,
  BATCH_MIXED_VOUCHER_INSUFFICIENT_STOCK: env.batch.mixedVoucherInsufficientStock
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

console.log(`Ambiente: ${env.name}`);
console.log(`Base URL: ${env.baseUrl}`);
console.log(`Mutação habilitada: ${env.allowMutation}`);
console.log(`E2E mutante habilitado: ${env.enableMutatingE2E}`);
console.log(`Contrato de setup: ${env.setupContract}`);

if (missingSmoke.length) {
  console.error(`Variáveis obrigatórias para smoke ausentes: ${missingSmoke.join(', ')}`);
  process.exitCode = 1;
}

if (env.allowMutation && missingMutation.length) {
  console.error(`Variáveis obrigatórias para testes mutantes ausentes: ${missingMutation.join(', ')}`);
  process.exitCode = 1;
}

if (env.enableMutatingE2E && missingBatchMass.length) {
  console.warn(`Cenários de lote sem massa serão ignorados. Variáveis ausentes: ${missingBatchMass.join(', ')}`);
}

if (env.name === 'prod' && env.allowMutation) {
  console.error('Configuração insegura: ALLOW_MUTATION=true em PROD.');
  process.exitCode = 1;
}

if (env.mutationRequested && !env.mutationConfirmationValid) {
  console.error('Configuração insegura: mutação em HML exige MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS.');
  process.exitCode = 1;
}
