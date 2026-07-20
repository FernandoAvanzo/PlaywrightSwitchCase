import { test } from '@playwright/test';
import { SuiteEnv } from '../config/env.js';

export function skipWhenMutationNotAllowed(env: SuiteEnv, reason = 'Teste mutante bloqueado para este ambiente.') {
  test.skip(!env.allowMutation, reason);
}

export function skipWhenMutatingE2EDisabled(env: SuiteEnv) {
  test.skip(!env.enableMutatingE2E, 'E2E mutante desabilitado. Defina ENABLE_MUTATING_E2E=true conscientemente.');
}

export function skipWhenSetupContractUnsupported(env: SuiteEnv) {
  test.skip(
    env.setupContract !== 'notification-channel',
    'O ms-voucher atual expõe apenas PUT /backoffice/vouchers/setup e não possui o contrato notificationChannel.'
  );
}

export function skipWhenMissing(values: Record<string, string | undefined>, reason = 'Massa obrigatória não configurada.') {
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  test.skip(missing.length > 0, `${reason} Ausentes: ${missing.join(', ')}`);
}

export function blockProdMutation(env: SuiteEnv) {
  if (env.name === 'prod' && env.allowMutation) {
    throw new Error('Proteção de segurança: mutações em PROD não são suportadas por esta suíte.');
  }
}
