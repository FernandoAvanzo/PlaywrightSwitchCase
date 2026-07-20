import { existsSync } from 'node:fs';
import { commandAvailable, loadLocalHmlRuntime, localHmlSuiteEnvFile, printRuntimeSummary } from './local-hml-runtime.js';

try {
  const runtime = loadLocalHmlRuntime();
  const errors: string[] = [];

  if (!existsSync(localHmlSuiteEnvFile)) errors.push('.env.local-hml não encontrado');
  if (!commandAvailable('java', ['-version'])) errors.push('Java não encontrado');
  if (!commandAvailable('mvn', ['-version'])) errors.push('Maven não encontrado');
  if (!commandAvailable('node', ['--version'])) errors.push('Node.js não encontrado');

  printRuntimeSummary(runtime);
  console.log(`Playwright local-hml: ${existsSync(localHmlSuiteEnvFile) ? 'configurado' : 'ausente'}`);

  if (errors.length > 0) {
    console.error(`Diagnóstico falhou: ${errors.join('; ')}.`);
    process.exitCode = 1;
  } else {
    console.log('Diagnóstico local-hml concluído sem expor segredos.');
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
