export type PricingRuleValue =
  | { novoValor: number; decrescimo?: never; acrescimo?: never }
  | { novoValor?: never; decrescimo?: number; acrescimo?: number };

const BAHIA_TIME_ZONE = 'America/Bahia';

const javaDayOfWeekPlusOneByShortWeekday: Record<string, number | undefined> = {
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7,
  Sun: undefined
};

let pricingRuleSequence = 0;

export function nextPricingRuleCode() {
  pricingRuleSequence = (pricingRuleSequence + 1) % 1000;
  return Date.now() * 1000 + pricingRuleSequence;
}

function currentGestaoVgWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BAHIA_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    hour12: false
  }).formatToParts(now);

  const weekday = parts.find(part => part.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0) % 24;

  return {
    diaDaSemana: javaDayOfWeekPlusOneByShortWeekday[weekday],
    codPeriodo: periodCodeForHour(hour)
  };
}

function periodCodeForHour(hour: number) {
  if (hour >= 6 && hour < 12) {
    return 'MAN';
  }
  if (hour >= 12 && hour < 18) {
    return 'TAR';
  }
  if (hour >= 18) {
    return 'NOI';
  }
  return 'MAD';
}

function hasOverride(overrides: Partial<Record<string, unknown>>, field: string) {
  return Object.prototype.hasOwnProperty.call(overrides, field);
}

export function pricingRule(overrides: Partial<Record<string, unknown>> = {}) {
  const codigoRegra = Number(overrides.codigoRegra ?? nextPricingRuleCode());
  const gestaoVgWindow = currentGestaoVgWindow();
  const diaDaSemana = hasOverride(overrides, 'diaDaSemana')
    ? overrides.diaDaSemana
    : gestaoVgWindow.diaDaSemana;
  const codPeriodo = hasOverride(overrides, 'codPeriodo')
    ? overrides.codPeriodo
    : gestaoVgWindow.codPeriodo;

  const rule: Record<string, unknown> = {
    codigoRegra,
    descricaoRegra: `PW E2E Gestao VG ${codigoRegra}`,
    cnpj: overrides.cnpj ?? '03.282.579/0001-10',
    produto: overrides.produto ?? '0110035',
    cidade: overrides.cidade ?? 'Salvador',
    uf: overrides.uf ?? 'ba',
    micromercado: overrides.micromercado ?? 'MM',
    novoValor: overrides.novoValor ?? 80,
    statusRegra: overrides.statusRegra ?? 'A',
    dataInicio: overrides.dataInicio ?? '2026-01-01',
    dataFim: overrides.dataFim ?? '2027-01-01',
    cia: overrides.cia ?? 'UG'
  };

  if (diaDaSemana !== undefined) {
    rule.diaDaSemana = diaDaSemana;
  }
  if (codPeriodo !== undefined) {
    rule.codPeriodo = codPeriodo;
  }

  return rule;
}

export function percentageDiscountRule(overrides: Partial<Record<string, unknown>> = {}) {
  const base = pricingRule({ ...overrides, novoValor: undefined });
  delete (base as Record<string, unknown>).novoValor;
  return {
    ...base,
    decrescimo: overrides.decrescimo ?? 10
  };
}

export function percentageIncreaseRule(overrides: Partial<Record<string, unknown>> = {}) {
  const base = pricingRule({ ...overrides, novoValor: undefined });
  delete (base as Record<string, unknown>).novoValor;
  return {
    ...base,
    acrescimo: overrides.acrescimo ?? 15
  };
}
