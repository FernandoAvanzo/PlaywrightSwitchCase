import { expect, test } from '@playwright/test';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import { loadEnv } from '../../src/config/env.js';
import { inactivePricingRule, nextPricingRuleCode, pricingRule } from '../../src/data/pricingRules.js';
import {
  expectFunctionalError,
  expectJsonResponse,
  expectNoSetupTechnicalFields
} from '../../src/utils/assertions.js';
import { isSameMonetaryValue } from '../../src/utils/decimal.js';
import {
  blockProdMutation,
  skipWhenMutationNotAllowed,
  skipWhenPricingDiscountContractUnsupported
} from '../../src/utils/guards.js';

const env = loadEnv();

type SetupSnapshot = {
  id?: string | null;
  consumerDataRequiredOnBlock?: string;
  maxPercentageDiscount: string | number;
  maxAbsoluteDiscount: string | number;
};

async function readSetup(client: MsVoucherClient) {
  return expectJsonResponse(await client.getSetup(), 200) as Promise<SetupSnapshot>;
}

async function restoreSetup(client: MsVoucherClient, snapshot: SetupSnapshot) {
  await expectJsonResponse(await client.updateSetup({
    id: snapshot.id ?? env.pricing.setupId,
    consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
    maxPercentageDiscount: snapshot.maxPercentageDiscount,
    maxAbsoluteDiscount: snapshot.maxAbsoluteDiscount
  }), 200);
}

function protectMutation() {
  blockProdMutation(env);
  skipWhenMutationNotAllowed(env);
}

test.describe('Limites globais de desconto | SET-001..SET-008 @setup @pricing @contract', () => {
  test.beforeEach(() => {
    skipWhenPricingDiscountContractUnsupported(env);
  });

  /**
   * Disponibiliza ao Gestão VG uma única fotografia dos limites que governam todas as campanhas.
   *
   * Regras de negócio representadas:
   * - A consulta deve expor os limites absoluto e percentual efetivamente usados na importação e na cotação.
   * - O contrato deve preservar a configuração de dados do consumidor sem revelar campos internos.
   * - Nenhum consumidor administrativo deve precisar duplicar os limites definidos pelo backend.
   */
  test('SET-001 @smoke | Consultar a política efetiva de descontos', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const setup = await readSetup(client);

    expect(setup).toHaveProperty('consumerDataRequiredOnBlock');
    expect(Number(setup.maxAbsoluteDiscount)).toBeGreaterThan(0);
    expect(Number(setup.maxPercentageDiscount)).toBeGreaterThan(0);
    expect(Number(setup.maxAbsoluteDiscount)).toBeLessThanOrEqual(Number(env.pricing.technicalCeiling));
    expect(Number(setup.maxPercentageDiscount)).toBeLessThanOrEqual(Number(env.pricing.technicalCeiling));
    if (setup.id !== undefined && setup.id !== null) {
      expect(setup.id).not.toHaveLength(0);
    }
    expectNoSetupTechnicalFields(setup);
  });

  /**
   * Permite que a administração altere conjuntamente os limites das duas modalidades de benefício.
   *
   * Regras de negócio representadas:
   * - A atualização deve aplicar uma fotografia completa, sem misturar valores antigos e novos.
   * - A resposta do PUT e uma consulta posterior devem apresentar exatamente a mesma política.
   * - A suíte deve restaurar a política anterior ao final para não afetar outras jornadas.
   */
  test('SET-002 @mutating | Atualizar e consultar os limites globais', async ({ request }) => {
    protectMutation();
    const client = new MsVoucherClient(request, env);
    const snapshot = await readSetup(client);

    try {
      const update = await expectJsonResponse(await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
        maxAbsoluteDiscount: env.pricing.maxAbsoluteDiscount,
        maxPercentageDiscount: env.pricing.maxPercentageDiscount
      }), 200);
      const persisted = await readSetup(client);

      expect(isSameMonetaryValue(update.maxAbsoluteDiscount, env.pricing.maxAbsoluteDiscount)).toBeTruthy();
      expect(isSameMonetaryValue(update.maxPercentageDiscount, env.pricing.maxPercentageDiscount)).toBeTruthy();
      expect(isSameMonetaryValue(persisted.maxAbsoluteDiscount, env.pricing.maxAbsoluteDiscount)).toBeTruthy();
      expect(isSameMonetaryValue(persisted.maxPercentageDiscount, env.pricing.maxPercentageDiscount)).toBeTruthy();
    } finally {
      await restoreSetup(client, snapshot);
    }
  });

  /**
   * Preserva a política comercial quando um consumidor legado atualiza somente dados de bloqueio.
   *
   * Regras de negócio representadas:
   * - A ausência dos novos campos não pode redefinir os limites para o teto técnico.
   * - Integrações anteriores à parametrização continuam podendo alterar o campo legado.
   * - Os dois limites devem permanecer iguais à fotografia existente antes da chamada.
   */
  test('SET-003 @mutating | Payload legado não deve apagar os limites vigentes', async ({ request }) => {
    protectMutation();
    const client = new MsVoucherClient(request, env);
    const snapshot = await readSetup(client);

    try {
      await expectJsonResponse(await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: 'phone'
      }), 200);
      const persisted = await readSetup(client);

      expect(isSameMonetaryValue(persisted.maxAbsoluteDiscount, snapshot.maxAbsoluteDiscount)).toBeTruthy();
      expect(isSameMonetaryValue(persisted.maxPercentageDiscount, snapshot.maxPercentageDiscount)).toBeTruthy();
    } finally {
      await restoreSetup(client, snapshot);
    }
  });

  /**
   * Autoriza a fronteira superior aprovada sem reduzir indevidamente a capacidade comercial.
   *
   * Regras de negócio representadas:
   * - Um limite exatamente igual ao teto técnico é válido.
   * - A comparação deve ser inclusiva e manter precisão decimal.
   * - A política aceita deve ser observável em uma nova consulta.
   */
  test('SET-004 @mutating | Aceitar limite exatamente igual ao teto técnico', async ({ request }) => {
    protectMutation();
    const client = new MsVoucherClient(request, env);
    const snapshot = await readSetup(client);

    try {
      const response = await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
        maxAbsoluteDiscount: env.pricing.technicalCeiling,
        maxPercentageDiscount: env.pricing.technicalCeiling
      });
      await expectJsonResponse(response, 200);

      const persisted = await readSetup(client);
      expect(isSameMonetaryValue(persisted.maxAbsoluteDiscount, env.pricing.technicalCeiling)).toBeTruthy();
      expect(isSameMonetaryValue(persisted.maxPercentageDiscount, env.pricing.technicalCeiling)).toBeTruthy();
    } finally {
      await restoreSetup(client, snapshot);
    }
  });

  /**
   * Impede que limites nulos, negativos ou superiores à governança alterem a exposição financeira.
   *
   * Regras de negócio representadas:
   * - Zero e valores negativos não desativam campanhas e devem ser recusados.
   * - Valores acima do teto absoluto também devem ser recusados.
   * - Cada tentativa inválida deve ser atômica e preservar integralmente a fotografia anterior.
   */
  test('SET-005 @mutating | Rejeitar limites fora da faixa sem persistência parcial', async ({ request }) => {
    protectMutation();
    const client = new MsVoucherClient(request, env);
    const snapshot = await readSetup(client);
    const invalidValues = ['0', '-0.01', '50.01'];

    for (const invalidValue of invalidValues) {
      await test.step(`Quando o limite absoluto é ${invalidValue}`, async () => {
        const response = await client.updateSetup({
          id: snapshot.id ?? env.pricing.setupId,
          consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
          maxAbsoluteDiscount: invalidValue,
          maxPercentageDiscount: snapshot.maxPercentageDiscount
        });
        expect(response.status(), await response.text()).toBe(400);

        const persisted = await readSetup(client);
        expect(isSameMonetaryValue(persisted.maxAbsoluteDiscount, snapshot.maxAbsoluteDiscount)).toBeTruthy();
        expect(isSameMonetaryValue(persisted.maxPercentageDiscount, snapshot.maxPercentageDiscount)).toBeTruthy();
      });
    }
  });

  /**
   * Protege campanhas ativas contra uma redução administrativa que as tornaria inválidas.
   *
   * Regras de negócio representadas:
   * - Uma campanha no limite vigente precisa ser saneada antes que o limite seja reduzido.
   * - O conflito deve responder 409.001 e identificar a condição comercial incompatível.
   * - O setup deve permanecer no valor anterior após a rejeição.
   */
  test('SET-006 @mutating | Bloquear redução incompatível com campanha ativa', async ({ request }) => {
    protectMutation();
    const client = new MsVoucherClient(request, env);
    const snapshot = await readSetup(client);
    const activeRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 30
    });

    try {
      await expectJsonResponse(await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
        maxAbsoluteDiscount: 30,
        maxPercentageDiscount: 40
      }), 200);
      await expectJsonResponse(await client.importGestaoVgPricingRules([activeRule]), 200);

      const conflict = await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
        maxAbsoluteDiscount: 29.99,
        maxPercentageDiscount: 40
      });
      await expectFunctionalError(conflict, 409, '409.001');

      const persisted = await readSetup(client);
      expect(isSameMonetaryValue(persisted.maxAbsoluteDiscount, 30)).toBeTruthy();
      expect(JSON.stringify(await conflict.json())).toContain(String(activeRule.codigoRegra));
    } finally {
      await expectJsonResponse(
        await client.importGestaoVgPricingRules([inactivePricingRule(activeRule)]),
        200
      );
      await restoreSetup(client, snapshot);
    }
  });

  /**
   * Mantém válida uma campanha cujo benefício coincide exatamente com o novo limite.
   *
   * Regras de negócio representadas:
   * - A verificação de conflito deve aceitar igualdade, bloqueando apenas valores superiores.
   * - Uma campanha no valor de R$ 30 pode coexistir com limite absoluto de R$ 30.
   * - O ajuste bem-sucedido deve permanecer consultável até a restauração controlada da suíte.
   */
  test('SET-008 @mutating | Aceitar limite igual à maior campanha ativa', async ({ request }) => {
    protectMutation();
    const client = new MsVoucherClient(request, env);
    const snapshot = await readSetup(client);
    const activeRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 30
    });

    try {
      await expectJsonResponse(await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
        maxAbsoluteDiscount: 30,
        maxPercentageDiscount: 40
      }), 200);
      await expectJsonResponse(await client.importGestaoVgPricingRules([activeRule]), 200);

      const accepted = await expectJsonResponse(await client.updateSetup({
        id: snapshot.id ?? env.pricing.setupId,
        consumerDataRequiredOnBlock: snapshot.consumerDataRequiredOnBlock ?? 'none',
        maxAbsoluteDiscount: 30,
        maxPercentageDiscount: 40
      }), 200);
      expect(isSameMonetaryValue(accepted.maxAbsoluteDiscount, 30)).toBeTruthy();
    } finally {
      await expectJsonResponse(
        await client.importGestaoVgPricingRules([inactivePricingRule(activeRule)]),
        200
      );
      await restoreSetup(client, snapshot);
    }
  });
});
