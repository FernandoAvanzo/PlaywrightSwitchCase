import { loadEnvironment } from '../src/config/environment';
async function check(name: string, url: string) {
  try {
    const response = await fetch(url);
    console.log(`${response.ok ? 'OK' : 'FAIL'} ${name}: ${response.status} ${url}`);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${url}`, error);
    process.exitCode = 1;
  }
}
async function main() {
  const env = loadEnvironment();
  console.log(`Ambiente: ${env.name}`);
  await check('ms-payment', `${env.baseUrl}/actuator/health`);
  if (env.name === 'local') {
    await check('WireMock', `${env.wireMockUrl}/__admin/mappings`);
    await check('Webhook mock', `${env.webhookMockUrl}/health`);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
