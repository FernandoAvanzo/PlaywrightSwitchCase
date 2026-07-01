import { loadEnv } from '../src/config/env';

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

console.log(`Ambiente: ${env.name}`);
console.log(`Base URL: ${env.baseUrl}`);
console.log(`Mutação habilitada: ${env.allowMutation}`);
console.log(`E2E mutante habilitado: ${env.enableMutatingE2E}`);

if (missingSmoke.length) {
  console.error(`Variáveis obrigatórias para smoke ausentes: ${missingSmoke.join(', ')}`);
  process.exitCode = 1;
}

if (env.allowMutation && missingMutation.length) {
  console.error(`Variáveis obrigatórias para testes mutantes ausentes: ${missingMutation.join(', ')}`);
  process.exitCode = 1;
}

if (env.name === 'prod' && env.allowMutation) {
  console.error('Configuração insegura: ALLOW_MUTATION=true em PROD.');
  process.exitCode = 1;
}
