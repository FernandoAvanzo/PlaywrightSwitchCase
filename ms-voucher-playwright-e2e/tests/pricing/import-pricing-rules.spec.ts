import { test, expect } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { MsVoucherClient } from '../../src/api/msVoucherClient.js';
import {
  inactivePricingRule,
  legacyAbsoluteRule,
  legacyPercentageRule,
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

test.describe('Importação Gestão VG | PRIC-001..PRIC-021 @pricing @contract', () => {
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
   * Mantém a compatibilidade das campanhas legadas sem exigir a repetição da modalidade.
   *
   * Objetivo do teste: comprovar que o próprio campo de benefício comunica a intenção comercial
   * nas modalidades absoluta e percentual quando `tipoValor` não faz parte do payload.
   *
   * Regras de negócio e cobertura:
   * - `novoValor` sem `tipoValor` deve ser aceito como desconto absoluto.
   * - `decrescimo` sem `tipoValor` deve ser aceito como desconto percentual.
   * - Cada campanha inédita deve ser criada sem erro de campo obrigatório.
   */
  test('PRIC-008 | Inferir tipoValor ausente nas duas modalidades', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const legacyRules = [
      legacyAbsoluteRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: 10
      }),
      legacyPercentageRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        decrescimo: 10
      })
    ];
    importedRules.push(...legacyRules);

    for (const rule of legacyRules) {
      const body = await expectJsonResponse(
        await client.importGestaoVgPricingRules([rule]),
        200
      );
      expect(body.totalRecebido).toBe(1);
      expect(body.totalCriado).toBe(1);
      expect(body.totalAtualizado).toBe(0);
      expect(body.totalIgnorado).toBe(0);
    }
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
    const acceptedAbsolute = legacyAbsoluteRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: absoluteLimit
    });
    const acceptedPercentage = legacyPercentageRule({
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

    const aboveAbsolute = legacyAbsoluteRule({
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: (absoluteLimit + 0.01).toFixed(2)
    });
    const abovePercentage = legacyPercentageRule({
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

  /**
   * Preserva o domínio fechado de modalidades quando o campo opcional é efetivamente informado.
   *
   * Objetivo do teste: impedir que um valor desconhecido seja aceito apenas porque `tipoValor`
   * deixou de ser obrigatório para contratos legados.
   *
   * Regras de negócio e cobertura:
   * - A opcionalidade permite ausência, mas não amplia o enum comercial.
   * - Um valor diferente de `ABSOLUTO` e `PERCENTUAL` deve retornar 400.004.
   * - A campanha inválida não pode ser contabilizada como criada ou atualizada.
   */
  test('PRIC-014 | Rejeitar tipoValor fora do domínio conhecido', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const invalidRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 10,
      tipoValor: 'OUTRO'
    });

    await expectFunctionalError(
      await client.importGestaoVgPricingRules([invalidRule]),
      400,
      '400.004'
    );
  });

  /**
   * Impede que a modalidade declarada contradiga o benefício que determina o cálculo da campanha.
   *
   * Objetivo do teste: proteger as duas direções de divergência para que nenhum consumidor consiga
   * rotular um desconto monetário como percentual, nem um percentual como absoluto.
   *
   * Regras de negócio e cobertura:
   * - `novoValor` combinado com `PERCENTUAL` deve retornar 400.039.
   * - `decrescimo` combinado com `ABSOLUTO` deve retornar 400.039.
   * - A inferência do backend continua sendo a fonte de verdade da modalidade.
   */
  test('PRIC-015 | Rejeitar tipoValor divergente do campo de desconto', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const mismatchedRules = [
      pricingRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: 10,
        tipoValor: 'PERCENTUAL'
      }),
      percentageDiscountRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        decrescimo: 10,
        tipoValor: 'ABSOLUTO'
      })
    ];

    for (const rule of mismatchedRules) {
      await expectFunctionalError(
        await client.importGestaoVgPricingRules([rule]),
        400,
        '400.039'
      );
    }
  });

  /**
   * Trata o contrato legado e a declaração explícita compatível como a mesma intenção comercial.
   *
   * Objetivo do teste: comprovar que acrescentar `tipoValor=ABSOLUTO` a uma campanha já importada
   * sem o campo não produz atualização artificial nem altera sua identidade canônica.
   *
   * Regras de negócio e cobertura:
   * - A primeira fotografia legada deve criar a campanha.
   * - O reenvio semanticamente equivalente deve ser ignorado.
   * - Os contadores de criação e atualização devem permanecer zerados no segundo envio.
   */
  test('PRIC-016 | Ignorar presença compatível de tipoValor após payload legado', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const legacyRule = legacyAbsoluteRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 10
    });
    const explicitRule = { ...legacyRule, tipoValor: 'ABSOLUTO' };
    importedRules.push(legacyRule, explicitRule);

    const first = await expectJsonResponse(
      await client.importGestaoVgPricingRules([legacyRule]),
      200
    );
    expect(first.totalCriado).toBe(1);

    const second = await expectJsonResponse(
      await client.importGestaoVgPricingRules([explicitRule]),
      200
    );
    expect(second.totalRecebido).toBe(1);
    expect(second.totalCriado).toBe(0);
    expect(second.totalAtualizado).toBe(0);
    expect(second.totalIgnorado).toBe(1);
  });

  /**
   * Processa em uma única transação campanhas legadas de modalidades comerciais diferentes.
   *
   * Objetivo do teste: demonstrar que a inferência é aplicada item a item sem exigir que todo o
   * lote use uma única modalidade ou uma declaração redundante de `tipoValor`.
   *
   * Regras de negócio e cobertura:
   * - Um lote pode combinar desconto absoluto e percentual válidos.
   * - Os dois itens sem `tipoValor` devem ser criados na mesma chamada.
   * - O resumo deve refletir exatamente os dois itens recebidos e processados.
   */
  test('PRIC-017 | Aceitar lote misto legado nas modalidades absoluta e percentual', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const legacyRules = [
      legacyAbsoluteRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: 8
      }),
      legacyPercentageRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        decrescimo: 8
      })
    ];
    importedRules.push(...legacyRules);

    const body = await expectJsonResponse(
      await client.importGestaoVgPricingRules(legacyRules),
      200
    );
    expect(body.totalRecebido).toBe(2);
    expect(body.totalCriado).toBe(2);
    expect(body.totalAtualizado).toBe(0);
    expect(body.totalIgnorado).toBe(0);
  });

  /**
   * Mantém a atomicidade quando uma campanha legada válida divide o lote com uma declaração divergente.
   *
   * Objetivo do teste: provar por reenvio que a validação de todos os itens acontece antes de
   * qualquer persistência, mesmo quando o primeiro item seria individualmente aceito.
   *
   * Regras de negócio e cobertura:
   * - A divergência do segundo item deve rejeitar o lote com 400.039.
   * - A campanha legada válida não pode ser salva parcialmente.
   * - Ao ser reenviada sozinha, ela deve ser criada, e não ignorada.
   */
  test('PRIC-018 | Reverter lote com item legado válido e tipoValor divergente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const validLegacyRule = legacyAbsoluteRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 7
    });
    const invalidRule = pricingRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      novoValor: 7,
      tipoValor: 'PERCENTUAL'
    });

    await expectFunctionalError(
      await client.importGestaoVgPricingRules([validLegacyRule, invalidRule]),
      400,
      '400.039'
    );

    importedRules.push(validLegacyRule);
    const retry = await expectJsonResponse(
      await client.importGestaoVgPricingRules([validLegacyRule]),
      200
    );
    expect(retry.totalCriado).toBe(1);
    expect(retry.totalAtualizado).toBe(0);
    expect(retry.totalIgnorado).toBe(0);
  });

  /**
   * Interpreta valores nulo e em branco como ausência do campo opcional de compatibilidade.
   *
   * Objetivo do teste: cobrir consumidores que serializam `tipoValor` sem conteúdo, preservando
   * a modalidade derivada do benefício e evitando uma regressão para obrigatoriedade implícita.
   *
   * Regras de negócio e cobertura:
   * - `null` com `novoValor` deve ser aceito como modalidade absoluta.
   * - Espaços com `decrescimo` devem ser aceitos como modalidade percentual.
   * - Ambos os itens inéditos devem ser criados na mesma importação.
   */
  test('PRIC-019 | Tratar tipoValor nulo ou em branco como campo ausente', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const nullableAbsolute = {
      ...legacyAbsoluteRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        novoValor: 6
      }),
      tipoValor: null
    };
    const blankPercentage = {
      ...legacyPercentageRule({
        codigoRegra: nextPricingRuleCode(),
        cnpj: env.data.cnpjDistribuidor,
        produto: env.data.productCode,
        decrescimo: 6
      }),
      tipoValor: '   '
    };
    importedRules.push(nullableAbsolute, blankPercentage);

    const body = await expectJsonResponse(
      await client.importGestaoVgPricingRules([nullableAbsolute, blankPercentage]),
      200
    );
    expect(body.totalRecebido).toBe(2);
    expect(body.totalCriado).toBe(2);
    expect(body.totalAtualizado).toBe(0);
    expect(body.totalIgnorado).toBe(0);
  });

  /**
   * Exige que a campanha informe exatamente um benefício mesmo quando `tipoValor` é opcional.
   *
   * Objetivo do teste: impedir que a compatibilidade do campo de modalidade transforme uma
   * campanha sem valor absoluto nem percentual em uma condição comercial válida.
   *
   * Regras de negócio e cobertura:
   * - A ausência simultânea de `novoValor` e `decrescimo` deve retornar 400.033.
   * - A inferência somente existe quando há um campo de desconto reconhecido.
   * - Nenhuma campanha sem benefício pode alcançar a persistência.
   */
  test('PRIC-020 | Rejeitar campanha sem campo de desconto inferível', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const ruleWithoutDiscount = legacyAbsoluteRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode
    });
    delete ruleWithoutDiscount.novoValor;

    await expectFunctionalError(
      await client.importGestaoVgPricingRules([ruleWithoutDiscount]),
      400,
      '400.033'
    );
  });

  /**
   * Mantém a idempotência quando um consumidor deixa de enviar uma modalidade antes explícita.
   *
   * Objetivo do teste: validar a equivalência canônica também na direção contrato atual para
   * contrato legado, sem depender da ordem em que as versões do consumidor chegam ao serviço.
   *
   * Regras de negócio e cobertura:
   * - A campanha percentual explícita deve ser criada normalmente.
   * - O reenvio sem `tipoValor` deve representar o mesmo benefício.
   * - A segunda fotografia deve ser ignorada, sem criação ou atualização.
   */
  test('PRIC-021 | Ignorar ausência de tipoValor após payload explícito compatível', async ({ request }) => {
    const client = new MsVoucherClient(request, env);
    const explicitRule = percentageDiscountRule({
      codigoRegra: nextPricingRuleCode(),
      cnpj: env.data.cnpjDistribuidor,
      produto: env.data.productCode,
      decrescimo: 5,
      tipoValor: 'PERCENTUAL'
    });
    const legacyRule = legacyPercentageRule(explicitRule);
    importedRules.push(explicitRule, legacyRule);

    const first = await expectJsonResponse(
      await client.importGestaoVgPricingRules([explicitRule]),
      200
    );
    expect(first.totalCriado).toBe(1);

    const second = await expectJsonResponse(
      await client.importGestaoVgPricingRules([legacyRule]),
      200
    );
    expect(second.totalRecebido).toBe(1);
    expect(second.totalCriado).toBe(0);
    expect(second.totalAtualizado).toBe(0);
    expect(second.totalIgnorado).toBe(1);
  });
});
