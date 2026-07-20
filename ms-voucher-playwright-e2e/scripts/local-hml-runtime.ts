import { spawn, type ChildProcess, type SpawnOptions, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const suiteRoot = path.resolve(scriptDir, '..');
export const localHmlSuiteEnvFile = path.join(suiteRoot, '.env.local-hml');
export const defaultAppEnvFile = path.join(suiteRoot, '.env.ms-voucher-hml.local');
export const healthUrls = [
  'http://127.0.0.1:8001/voucher/v1/actuator/health',
  'http://127.0.0.1:8001/actuator/health'
];

const BACKGROUND_WORKERS_CONFIRMATION = 'I_UNDERSTAND_HML_BACKGROUND_SIDE_EFFECTS';
const runnerKeys = new Set([
  'MS_VOUCHER_PROJECT_DIR',
  'LOCAL_HML_STARTUP_TIMEOUT_MS',
  'ALLOW_HML_BACKGROUND_WORKERS'
]);

const requiredProperties = [
  'server.port',
  'spring.datasource.primary.url',
  'spring.datasource.primary.username',
  'spring.datasource.primary.password',
  'spring.datasource.primary.maximum-pool-size',
  'spring.datasource.secondary.wallet',
  'spring.datasource.secondary.tnsname',
  'spring.datasource.secondary.username',
  'spring.datasource.secondary.password',
  'spring.datasource.secondary.maximum-pool-size',
  'spring.datasource.secondary.max-life-time',
  'aws.voucher-soa.sqs',
  'transaction-integrations.strategy',
  'transaction-integrations.soap.endpoint',
  'transaction-integrations.soap.generated-classes-package',
  'transaction-integrations.soap.connection-timeout',
  'transaction-integrations.soap.read-timeout',
  'transaction-integrations.soap.username',
  'transaction-integrations.soap.password',
  'notification.endpoint',
  'notification.credentials-alias',
  'notification.queue.hospital',
  'auth.endpoint',
  'auth.client-id',
  'auth.client-secret',
  'jobs.generated-authorization-code.is-enabled',
  'jobs.generated-authorization-code.minimum-codes-quantity',
  'jobs.generated-authorization-code.generate-codes-quantity',
  'voucher.max-sale-voucher-allowed',
  'cache.voucher.get-store',
  'aws.voucher-store.bucket',
  'aws.voucher-store.key',
  'aws.voucher-store.download-expiration-hours',
  'aws.voucher-store.default-file-name',
  'spring.redis.host',
  'spring.redis.port',
  'aws.sell-voucher-sqs-msg',
  'aws.sqs.notify-distributor-voucher',
  'legacy.integration.rest.block-voucher-endpoint',
  'legacy.integration.rest.authentication.client_id',
  'legacy.integration.rest.authentication.client_secret',
  'jobs.expire-vouchers.is-enabled',
  'jobs.start-voucher-validity.is-enabled',
  'events-hub.baseUrl',
  'events-hub.voucher-handler',
  'events-hub.topics.transaction',
  'events-hub.topics.sms-callback',
  'aws.secret-name',
  'aws.region',
  'aws.access-key',
  'aws.secret-key',
  'spring.redis.is-stand-alone',
  'aws.access-key-ses',
  'aws.secret-key-ses',
  'aws.region-ses',
  'event.listeners.sqs.integration-events.queue-name'
] as const;

export interface LocalHmlRuntime {
  appEnvFile: string;
  appProjectDir: string;
  startupTimeoutMs: number;
  backgroundWorkersEnabled: boolean;
  propertyCount: number;
  childEnvironment: NodeJS.ProcessEnv;
}

function isPlaceholder(value: string | undefined) {
  if (!value?.trim()) return true;
  return /^(<secret>|HML_|REPLACE_)/i.test(value.trim()) || value.includes('REPLACE_WITH');
}

function assertPrivateFile(file: string) {
  if (process.platform === 'win32') return;
  const permissions = statSync(file).mode & 0o777;
  if ((permissions & 0o077) !== 0) {
    throw new Error(`Arquivo de segredos com permissões inseguras (${permissions.toString(8)}). Execute: chmod 600 ${path.basename(file)}`);
  }
}

function toNestedJson(properties: Record<string, string>) {
  const root: Record<string, unknown> = {};

  for (const [property, value] of Object.entries(properties)) {
    const parts = property.split('.');
    let cursor = root;

    for (const part of parts.slice(0, -1)) {
      const existing = cursor[part];
      if (existing !== undefined && (typeof existing !== 'object' || existing === null || Array.isArray(existing))) {
        throw new Error(`Conflito ao montar SPRING_APPLICATION_JSON na propriedade ${property}.`);
      }
      cursor[part] = existing ?? {};
      cursor = cursor[part] as Record<string, unknown>;
    }

    cursor[parts.at(-1)!] = value;
  }

  return root;
}

export function loadLocalHmlRuntime(): LocalHmlRuntime {
  const configuredFile = process.env.MS_VOUCHER_HML_ENV_FILE;
  const appEnvFile = configuredFile
    ? path.resolve(suiteRoot, configuredFile)
    : defaultAppEnvFile;

  if (!existsSync(appEnvFile)) {
    throw new Error(
      `Configuração local ausente: ${appEnvFile}. Copie .env.ms-voucher-hml.example para .env.ms-voucher-hml.local e preencha os segredos.`
    );
  }

  assertPrivateFile(appEnvFile);
  const parsed = dotenv.parse(readFileSync(appEnvFile));
  const missing = requiredProperties.filter(key => isPlaceholder(parsed[key]));
  if (missing.length > 0) {
    throw new Error(`Configuração HML incompleta. Propriedades ausentes ou com placeholder: ${missing.join(', ')}`);
  }

  const projectSetting = parsed.MS_VOUCHER_PROJECT_DIR ?? '../../ms-voucher';
  const appProjectDir = path.resolve(suiteRoot, projectSetting);
  if (!existsSync(path.join(appProjectDir, 'pom.xml'))) {
    throw new Error(`Projeto ms-voucher não encontrado em ${appProjectDir}. Ajuste MS_VOUCHER_PROJECT_DIR.`);
  }

  const backgroundWorkersEnabled = parsed.ALLOW_HML_BACKGROUND_WORKERS === BACKGROUND_WORKERS_CONFIRMATION;
  const properties = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !runnerKeys.has(key))
  );

  if (!backgroundWorkersEnabled) {
    Object.assign(properties, {
      'spring.flyway.enabled': 'false',
      'spring.jpa.hibernate.ddl-auto': 'none',
      'spring.task.scheduling.enabled': 'false',
      'jobs.generated-authorization-code.is-enabled': 'false',
      'jobs.expire-vouchers.is-enabled': 'false',
      'jobs.start-voucher-validity.is-enabled': 'false',
      'event.listeners.enabled': 'false'
    });
  }

  const startupTimeoutMs = Number(parsed.LOCAL_HML_STARTUP_TIMEOUT_MS ?? 240_000);
  if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs < 10_000) {
    throw new Error('LOCAL_HML_STARTUP_TIMEOUT_MS deve ser um número maior ou igual a 10000.');
  }

  return {
    appEnvFile,
    appProjectDir,
    startupTimeoutMs,
    backgroundWorkersEnabled,
    propertyCount: Object.keys(properties).length,
    childEnvironment: {
      ...process.env,
      SPRING_APPLICATION_JSON: JSON.stringify(toNestedJson(properties))
    }
  };
}

export function commandAvailable(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

export function startMsVoucher(runtime: LocalHmlRuntime) {
  const options: SpawnOptions = {
    cwd: runtime.appProjectDir,
    env: runtime.childEnvironment,
    stdio: 'inherit',
    detached: process.platform !== 'win32'
  };

  return spawn('mvn', ['-DskipTests', 'spring-boot:run'], options);
}

async function urlIsHealthy(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function applicationIsHealthy() {
  for (const url of healthUrls) {
    if (await urlIsHealthy(url)) return true;
  }
  return false;
}

export async function waitForApplication(child: ChildProcess | undefined, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`ms-voucher encerrou antes de ficar saudável (código ${child.exitCode}).`);
    }
    if (await applicationIsHealthy()) return;
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }

  throw new Error(`ms-voucher não ficou saudável em ${timeoutMs} ms. Verifique acesso à VPN e às dependências HML.`);
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') throw error;
  }
}

export async function stopMsVoucher(child: ChildProcess) {
  signalProcess(child, 'SIGTERM');
  if (!(await waitForExit(child, 10_000))) {
    signalProcess(child, 'SIGKILL');
    await waitForExit(child, 2_000);
  }
}

export function printRuntimeSummary(runtime: LocalHmlRuntime) {
  console.log(`Projeto ms-voucher: ${runtime.appProjectDir}`);
  console.log(`Arquivo de configuração: ${path.basename(runtime.appEnvFile)} (valores não exibidos)`);
  console.log(`Propriedades validadas: ${runtime.propertyCount}`);
  console.log(`Consumers/jobs HML: ${runtime.backgroundWorkersEnabled ? 'HABILITADOS COM CONFIRMAÇÃO' : 'desabilitados pelo modo seguro'}`);
  console.log('Flyway/DDL em HML: desabilitados pelo modo seguro');
}
