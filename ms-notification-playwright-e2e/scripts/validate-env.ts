import { env } from '../src/config/environment';

const requiredForAll = ['MS_NOTIFICATION_BASE_URL'];
const requiredForLocal = [
  'SALESFORCE_MS_NOTIFICATION_BASE_URL',
  'MOCK_BASE_URL',
  'AWS_ENDPOINT',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY'
];

const missing = requiredForAll.filter((key) => !process.env[key]);
if (env.name === 'local') {
  missing.push(...requiredForLocal.filter((key) => !process.env[key]));
}

if (missing.length > 0) {
  throw new Error(`Variáveis ausentes para ${env.name}: ${missing.join(', ')}`);
}

console.log(
  `Ambiente ${env.name} validado com baseURL=${env.baseURL} e salesforceBaseURL=${env.salesforceBaseURL}`
);
