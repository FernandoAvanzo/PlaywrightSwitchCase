import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  applicationIsHealthy,
  loadLocalHmlRuntime,
  printRuntimeSummary,
  startMsVoucher,
  stopMsVoucher,
  suiteRoot,
  waitForApplication
} from './local-hml-runtime.js';

const runtime = loadLocalHmlRuntime();
printRuntimeSummary(runtime);

let app = undefined as ReturnType<typeof startMsVoucher> | undefined;

try {
  if (await applicationIsHealthy()) {
    console.log('Usando ms-voucher já ativo na porta 8001; ele não será encerrado por este comando.');
  } else {
    app = startMsVoucher(runtime);
    await waitForApplication(app, runtime.startupTimeoutMs);
    console.log('ms-voucher iniciado e saudável; executando Playwright em modo local-hml.');
  }

  const playwrightBin = path.join(suiteRoot, 'node_modules', '.bin', 'playwright');
  const args = ['test', '--project=api-local-hml', ...process.argv.slice(2)];
  const testProcess = spawn(playwrightBin, args, {
    cwd: suiteRoot,
    env: { ...process.env, TEST_ENV: 'local-hml' },
    stdio: 'inherit'
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    testProcess.once('error', reject);
    testProcess.once('exit', code => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  if (app) {
    console.log('Encerrando o ms-voucher iniciado pelo runner.');
    await stopMsVoucher(app);
  }
}
