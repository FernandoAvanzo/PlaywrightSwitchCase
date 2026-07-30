import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import {
  inactivePricingRule,
  pricingRule,
  percentageDiscountRule,
  percentageIncreaseRule,
  nextPricingRuleCode
} from '../../src/data/pricingRules.js';
import { expectFunctionalError, expectJsonResponse } from '../../src/utils/assertions.js';
import {
  blockProdMutation,
  skipWhenMissing,
  skipWhenMutationNotAllowed,
  skipWhenPricingDiscountContractUnsupported
} from '../../src/utils/guards.js';

const env = loadEnv();
let importedRules: Record<string, unknown>[] = [];

test.describe('Importação Gestão VG | PRIC-001..PRIC-013 @pricing @contract', () => {
  test.beforeEach(() => {
    importedRules = [];
    blockProdMutation(env);
    skipWhenMutationNotAllowed(env);
    skipWhenMissing({
      CNPJ_DISTRIBUIDOR: env.data.cnpjDistribuidor,
      PRODUCT_CODE: env.data.productCode
    });
  });

  test.afterEach(async ({ request }) => {
    if (importedRules.length === 0 || !env.allowMutation || env.name === 'prod') {
      return;
    }

    const client = new MsVoucherClient(request, env);
    const latestByCode = new Map(
      importedRules.map(rule => [String(rule.codigoRegra), rule])
    );
    for (const rule of latestByCode.values()) {
      await expectJsonResponse(
        await client.importGestaoVgPricingRules([inactivePricingRule(rule)]),
        200
      );
    }
  });

  /**
   * Aceita uma regra comercial válida e a contabiliza no processamento da Gestão VG.
   *
   * Objetivo do teste: validar o caminho positivo de importação com dados normalizáveis, como
   * UF em minúsculas, para o CNPJ e produto configurados.
   *
   * Regras de negócio e cobertura:
   * - Um lote com uma regra válida deve responder HTTP 200.
   * - O total recebido deve ser um e o item deve ser criado, atualizado ou ignorado de forma controlada.
   * - A entrada normalizável não pode ser rejeitada por diferença de caixa.
   */
  test('PRIC-001 | Importar regra válida com normalizações', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      uf: 'ba'
    });
    importedRules.push(rule);

    const response = await client.importGestaoVgPricingRules([rule]);
    const body = await expectJsonResponse(response, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalCriado + body.totalAtualizado + body.totalIgnorado).toBeGreaterThanOrEqual(1);
  });

  /**
   * Evita duplicidade de regra comercial quando o mesmo lote é reenviado.
   *
   * Objetivo do teste: comprovar a idempotência da importação diante de uma segunda requisição
   * com o mesmo `codigoRegra` e conteúdo.
   *
   * Regras de negócio e cobertura:
   * - A primeira importação deve ser aceita normalmente.
   * - A reimportação deve responder HTTP 200 e contabilizar o item como ignorado.
   * - Repetições idênticas não devem provocar erro nem nova alteração comercial.
   */
  test('PRIC-002 | Reimportar payload idêntico deve ser idempotente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode
    });
    importedRules.push(rule);

    const first = await client.importGestaoVgPricingRules([rule]);
    await expectJsonResponse(first, 200);

    const second = await client.importGestaoVgPricingRules([rule]);
    const body = await expectJsonResponse(second, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalIgnorado).toBeGreaterThanOrEqual(1);
  });

  /**
   * Permite alterar o valor de uma regra identificada pelo mesmo código de negócio.
   *
   * Objetivo do teste: validar que uma nova versão com `novoValor` diferente seja processada
   * após a importação inicial, preservando `codigoRegra` como chave funcional.
   *
   * Regras de negócio e cobertura:
   * - A regra original com desconto de R$ 10 deve ser aceita.
   * - O reenvio do mesmo código com desconto de R$ 11 deve ser reconhecido como item processável.
   * - O resumo deve contabilizar uma criação ou atualização, sem rejeitar a mudança.
   */
  test('PRIC-003 | Atualizar regra existente pelo mesmo codigoRegra', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const codigoRegra = nextPricingRuleCode();
    const original = pricingRule({
      codigoRegra,
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 10
    });
    importedRules.push(original);

    await expectJsonResponse(await client.importGestaoVgPricingRules([original]), 200);

    const changed = { ...original, novoValor: 11 };
    importedRules.push(changed);
    const response = await client.importGestaoVgPricingRules([changed]);
    const body = await expectJsonResponse(response, 200);

    expect(body.totalRecebido).toBe(1);
    expect(body.totalAtualizado + body.totalCriado).toBeGreaterThanOrEqual(1);
  });

  /**
   * Impede definições conflitantes para a mesma regra dentro de uma única importação.
   *
   * Objetivo do teste: assegurar que dois itens com o mesmo `codigoRegra` e valores diferentes
   * não sejam aplicados em ordem arbitrária.
   *
   * Regras de negócio e cobertura:
   * - Cada código de regra deve aparecer no máximo uma vez por lote.
   * - A duplicidade torna ambígua a condição comercial a persistir.
   * - O lote conflitante deve ser rejeitado com HTTP 400.
   */
  test('PRIC-004 | Duplicidade de codigoRegra no lote deve falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const codigoRegra = nextPricingRuleCode();
    const ruleA = pricingRule({ codigoRegra, cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode });
    const ruleB = pricingRule({ codigoRegra, cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode, novoValor: 90 });

    const response = await client.importGestaoVgPricingRules([ruleA, ruleB]);
    expect(response.status(), await response.text()).toBe(400);
  });

  /**
   * Impede importações sem qualquer regra comercial para processar.
   *
   * Objetivo do teste: validar a cardinalidade mínima do contrato e evitar operações vazias
   * que poderiam ser registradas como sucesso sem efeito de negócio.
   *
   * Regras de negócio e cobertura:
   * - O corpo da importação deve conter ao menos uma regra.
   * - Uma lista vazia não representa uma solicitação válida da Gestão VG.
   * - A API deve responder HTTP 400 para o lote vazio.
   */
  test('PRIC-005 | Lote vazio deve falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);

    const response = await client.importGestaoVgPricingRules([]);
    expect(response.status(), await response.text()).toBe(400);
  });

  /**
   * Protege a Gestão VG contra domínios e formatos que não podem compor uma regra comercial válida.
   *
   * Objetivo do teste: validar em matriz as fronteiras de status, período, dia da semana, CNPJ
   * e UF antes da persistência.
   *
   * Regras de negócio e cobertura:
   * - Status e período devem pertencer aos enums reconhecidos pela aplicação.
   * - Dia da semana, CNPJ e UF devem respeitar seus formatos e intervalos.
   * - Cada payload inválido deve ser rejeitado individualmente com HTTP 400.
   */
  test('PRIC-006 | Enums e formatos inválidos devem falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const invalidPayloads = [
      pricingRule({ statusRegra: 'X', cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode }),
      pricingRule({ codPeriodo: 'XYZ', cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode }),
      pricingRule({ diaDaSemana: 8, cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode }),
      pricingRule({ cnpj: '123', produto: env.data.productCode }),
      pricingRule({ uf: 'BAH', cnpj: env.data.cnpjDistribuidor, produto: env.data.productCode })
    ];

    for (const payload of invalidPayloads) {
      const response = await client.importGestaoVgPricingRules([payload]);
      expect(response.status(), await response.text()).toBe(400);
    }
  });

  /**
   * Garante coerência temporal no período de vigência da regra de preço.
   *
   * Objetivo do teste: impedir a importação de uma regra cujo término ocorre antes do início,
   * condição que tornaria sua aplicação comercial impossível ou ambígua.
   *
   * Regras de negócio e cobertura:
   * - `dataFim` deve ser igual ou posterior a `dataInicio`.
   * - O período de 17/12/2026 a 16/12/2026 viola a ordem cronológica.
   * - A API deve rejeitar a regra com HTTP 400.
   */
  test('PRIC-007 | dataFim anterior a dataInicio deve falhar', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const response = await client.importGestaoVgPricingRules([
      pricingRule({
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        dataInicio: '2026-12-17',
        dataFim: '2026-12-16'
      })
    ]);

    expect(response.status(), await response.text()).toBe(400);
  });

  /**
   * Exige que a modalidade comercial seja declarada de forma explícita pelo Gestão VG.
   *
   * Objetivo do teste: impedir que uma campanha sem `tipoValor` seja persistida com uma
   * interpretação implícita diferente da intenção do consumidor.
   *
   * Regras de negócio e cobertura:
   * - Toda campanha deve declarar `ABSOLUTO` ou `PERCENTUAL`.
   * - A ausência do campo obrigatório deve retornar HTTP 400.
   * - Nenhuma regra incompleta pode entrar no catálogo de campanhas.
   */
  test('PRIC-008 | tipoValor ausente deve ser rejeitado', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const rule = percentageDiscountRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      decrescimo: 10
    });
    delete (rule as Record<string, unknown>).tipoValor;

    const response = await client.importGestaoVgPricingRules([rule]);
    await expectFunctionalError(response, 400, '400.001');
  });

  /**
   * Impede que uma mesma regra combine substituição absoluta e redução percentual.
   *
   * Objetivo do teste: eliminar ambiguidade sobre qual cálculo deve determinar o preço quando
   * `novoValor` e `decrescimo` são informados simultaneamente.
   *
   * Regras de negócio e cobertura:
   * - A regra deve escolher uma única modalidade de alteração de valor.
   * - Valor absoluto 80 combinado com redução de 10% é um contrato inválido.
   * - A importação ambígua deve ser rejeitada com HTTP 400.
   */
  test('PRIC-009 | novoValor junto com decrescimo deve falhar por ambiguidade', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const ambiguous = {
      ...pricingRule({
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: 80
      }),
      decrescimo: 10
    };

    const response = await client.importGestaoVgPricingRules([ambiguous]);
    await expectFunctionalError(response, 400, '400.036');
  });

  /**
   * Impede que campanhas comerciais elevem o preço cobrado do consumidor.
   *
   * Objetivo do teste: validar que `acrescimo` seja recusado tanto isoladamente quanto junto
   * de um desconto, pois o domínio atual admite exclusivamente benefícios redutores.
   *
   * Regras de negócio e cobertura:
   * - Nenhum percentual de aumento pode ser importado.
   * - A presença simultânea de aumento e desconto continua sendo uma violação.
   * - A rejeição deve retornar o código funcional 400.037 sem persistência.
   */
  test('PRIC-010 | acrescimo deve ser sempre rejeitado', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const increaseOnly = percentageIncreaseRule({
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      acrescimo: 5
    });
    const increaseWithDiscount = {
      ...percentageDiscountRule({
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        decrescimo: 5
      }),
      acrescimo: 2
    };

    for (const payload of [increaseOnly, increaseWithDiscount]) {
      await expectFunctionalError(
        await client.importGestaoVgPricingRules([payload]),
        400,
        '400.037'
      );
    }
  });

  /**
   * Faz a política do setup controlar a exposição máxima aceita na entrada de campanhas.
   *
   * Objetivo do teste: exercitar as fronteiras inclusiva e imediatamente superior dos limites
   * absoluto e percentual configurados para a execução.
   *
   * Regras de negócio e cobertura:
   * - Um desconto exatamente igual ao limite deve ser aceito.
   * - Um centavo ou centésimo percentual acima do limite deve ser rejeitado.
   * - A rejeição deve informar o código funcional 400.038.
   */
  test('PRIC-011 | respeitar as fronteiras dos limites dinâmicos', async ({ request }) => {
    skipWhenPricingDiscountContractUnsupported(env);
    const client = new MsVoucherClient(request, env);
    const setup = await expectJsonResponse(await client.getSetup(), 200);
    const absoluteLimit = Number(setup.maxAbsoluteDiscount);
    const percentageLimit = Number(setup.maxPercentageDiscount);
    const acceptedAbsolute = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: absoluteLimit
    });
    const acceptedPercentage = percentageDiscountRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      decrescimo: percentageLimit
    });
    importedRules.push(acceptedAbsolute, acceptedPercentage);

    const accepted = await expectJsonResponse(
      await client.importGestaoVgPricingRules([acceptedAbsolute, acceptedPercentage]),
      200
    );
    expect(accepted.totalCriado + accepted.totalAtualizado + accepted.totalIgnorado).toBe(2);

    const aboveAbsolute = pricingRule({
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: (absoluteLimit + 0.01).toFixed(2)
    });
    const abovePercentage = percentageDiscountRule({
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      decrescimo: (percentageLimit + 0.01).toFixed(2)
    });
    for (const payload of [aboveAbsolute, abovePercentage]) {
      await expectFunctionalError(
        await client.importGestaoVgPricingRules([payload]),
        400,
        '400.038'
      );
    }
  });

  /**
   * Evita que filtros ainda não avaliados no runtime ampliem silenciosamente uma campanha.
   *
   * Objetivo do teste: comprovar separadamente que código de PZ, mercado e núcleo não são
   * aceitos até participarem efetivamente da elegibilidade da cotação.
   *
   * Regras de negócio e cobertura:
   * - Cada filtro sem suporte deve provocar 400.040.
   * - O backend não pode simplesmente ignorar uma segmentação enviada pelo Gestão VG.
   * - Nenhuma das variações rejeitadas pode ser persistida.
   */
  test('PRIC-012 | filtros sem suporte devem ser rejeitados explicitamente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const unsupportedFilters = [
      { codigoPz: '3786' },
      { mercado: 'DOMICILIAR' },
      { nucleo: 'SALVADOR' }
    ];

    for (const filter of unsupportedFilters) {
      await expectFunctionalError(
        await client.importGestaoVgPricingRules([
          pricingRule({
            cnpj: env.data.cnpjDistribuidor,
            produto: env.data.productCode,
            ...filter
          })
        ]),
        400,
        '400.040'
      );
    }
  });

  /**
   * Mantém a importação transacional quando um lote combina campanhas válidas e inválidas.
   *
   * Objetivo do teste: demonstrar pela reimportação que o item válido não foi criado quando
   * outro item do mesmo lote violou a política de descontos.
   *
   * Regras de negócio e cobertura:
   * - A validação deve ocorrer para o lote completo antes de qualquer gravação.
   * - Um item acima do limite rejeita toda a operação com 400.038.
   * - O item válido deve ser criado, e não ignorado, quando reenviado sozinho após a falha.
   */
  test('PRIC-013 | rejeitar lote inteiro quando um item é inválido', async ({ request }) => {
    skipWhenPricingDiscountContractUnsupported(env);
    const client = new MsVoucherClient(request, env);
    const setup = await expectJsonResponse(await client.getSetup(), 200);
    const validRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 1
    });
    const invalidRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: (Number(setup.maxAbsoluteDiscount) + 0.01).toFixed(2)
    });

    await expectFunctionalError(
      await client.importGestaoVgPricingRules([validRule, invalidRule]),
      400,
      '400.038'
    );

    importedRules.push(validRule);
    const retry = await expectJsonResponse(
      await client.importGestaoVgPricingRules([validRule]),
      200
    );
    expect(retry.totalCriado).toBe(1);
  });
});
