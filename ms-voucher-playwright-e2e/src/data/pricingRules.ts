export type PricingRuleValue =
  | { novoValor: number; decrescimo?: never; acrescimo?: never }
  | { novoValor?: never; decrescimo?: number; acrescimo?: number };

export function pricingRule(overrides: Partial<Record<string, unknown>> = {}) {
  const codigoRegra = Number(overrides.codigoRegra ?? Date.now() % 1_000_000);

  return {
    codigoRegra,
    descricaoRegra: `PW E2E Gestao VG ${codigoRegra}`,
    cnpj: overrides.cnpj ?? '03.282.579/0001-10',
    diaDaSemana: overrides.diaDaSemana ?? 5,
    codPeriodo: overrides.codPeriodo ?? 'MAN',
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
