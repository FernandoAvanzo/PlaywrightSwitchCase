import { loadLocalHmlRuntime, printRuntimeSummary, startMsVoucher, stopMsVoucher, waitForApplication } from './local-hml-runtime.js';

const runtime = loadLocalHmlRuntime();
printRuntimeSummary(runtime);

const child = startMsVoucher(runtime);
let stopping = false;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await stopMsVoucher(child);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

try {
  await waitForApplication(child, runtime.startupTimeoutMs);
  console.log('ms-voucher local está saudável em http://127.0.0.1:8001/voucher/v1');
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => {
      if (!stopping && code !== 0) reject(new Error(`ms-voucher encerrou com código ${code}.`));
      else resolve();
    });
  });
} catch (error) {
  await shutdown();
  throw error;
}
