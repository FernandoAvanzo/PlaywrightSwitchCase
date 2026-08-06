import fs from 'node:fs';
import path from 'node:path';
import { loadEnvironment } from '../src/config/environment';

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause as { code?: string; message?: string } | undefined;
    return [cause?.code, cause?.message ?? error.message].filter(Boolean).join(' - ');
  }
  return String(error);
}

async function check(name: string, url: string, attempts = 30) {
  let lastError = 'sem resposta';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`OK ${name}: ${response.status} ${url}`);
        return true;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = describeError(error);
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  console.error(`FAIL ${name}: ${url} (${lastError}; readiness excedeu ${attempts}s)`);
  process.exitCode = 1;
  return false;
}

async function main() {
  const env = loadEnvironment();
  console.log(`Ambiente: ${env.name}`);
  if (env.name === 'local') {
    const targetDir = process.env.MS_PAYMENT_PROJECT_DIR ?? '../ms-payment';
    const resolvedTargetDir = path.resolve(process.cwd(), targetDir);
    if (!fs.existsSync(resolvedTargetDir)) {
      console.error(`FAIL ms-payment source dir: ${resolvedTargetDir} does not exist.`);
      console.error('Hint: clone ms-payment there or set MS_PAYMENT_PROJECT_DIR in .env.local.');
      process.exitCode = 1;
    }
  }
  await check('ms-payment', `${env.baseUrl}/actuator/health`);
  if (env.name === 'local') {
    await check('WireMock', `${env.wireMockUrl}/__admin/mappings`);
    await check('Webhook mock', `${env.webhookMockUrl}/health`);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
