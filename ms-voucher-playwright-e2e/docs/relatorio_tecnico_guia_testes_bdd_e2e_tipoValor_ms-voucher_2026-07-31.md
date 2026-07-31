# Relatório técnico — Guia de testes BDD e E2E da compatibilidade de `tipoValor`

**Projeto alvo:** `ms-voucher`  
**Projeto de automação:** `PlaywrightSwitchCase/ms-voucher-playwright-e2e`  
**Data:** 31/07/2026  
**Idioma:** Português (Brasil)  
**Escopo:** validar o hotfix que torna `tipoValor` opcional na importação de campanhas do Gestão VG, preservando inferência, validações comerciais, idempotência, cálculo de preço e integração FEPAS.

## 1. Resumo executivo

O hotfix está coerente no código atual do `ms-voucher`: o endpoint aceita campanhas sem `tipoValor`, infere `ABSOLUTO` quando existe `novoValor` e `PERCENTUAL` quando existe `decrescimo`, mas continua rejeitando enum inválido, divergência de modalidade, ambiguidade, acréscimo e descontos fora dos limites do setup.

O principal risco de regressão encontrado está na automação atual. O teste Playwright `PRIC-008` ainda afirma que a ausência de `tipoValor` deve retornar HTTP 400. Essa expectativa precisa ser substituída antes de usar a suíte como evidência do hotfix. O builder de campanhas também preenche `tipoValor` por padrão, portanto os caminhos legados precisam ser construídos deliberadamente sem o campo.

A estratégia recomendada combina quatro níveis de evidência:

1. contrato OpenAPI alinhado ao comportamento;
2. importação HTTP e persistência inferida;
3. aplicação da campanha em `GET /prices`;
4. preservação do preço e do estado efetivo no fluxo FEPAS.

## 2. Fontes e metodologia

### 2.1 Fontes internas analisadas

- <mention-page url="https://app.notion.com/p/3aeb3def3e7c80d88e4dd1c06f7c84e8">[task] Generate BDD and e2e Playwright test scenario for issue with the new Campain Price</mention-page>.
- <mention-page url="https://app.notion.com/p/3aeb3def3e7c80a3996efd49777e9137">[task] Analyze issue with the new Campain Price</mention-page>.
- Projeto [`ms-voucher`](https://drive.google.com/drive/folders/184PaSJreDCSOG2iSDO6jlEMTSW_AjnHu) no Google Drive, incluindo árvore `src`, Swagger, testes Java e relatórios de precificação/setup.
- Relatório anexado `relatorio_tecnico_correcao_tipo_valor_ms-voucher_2026-07-31.md`.
- Repositório [`FernandoAvanzo/PlaywrightSwitchCase`](https://github.com/FernandoAvanzo/PlaywrightSwitchCase), especialmente o módulo `ms-voucher-playwright-e2e`.

### 2.2 Referências técnicas externas

- [Playwright — API testing](https://playwright.dev/docs/api-testing): uso do `APIRequestContext`, preparação de estado e validação de pós-condições.
- [Playwright — Fixtures](https://playwright.dev/docs/test-fixtures): isolamento de contexto e composição de fixtures.
- [Playwright — Trace Viewer](https://playwright.dev/docs/trace-viewer): captura e inspeção de traces; o projeto já usa `retain-on-failure`.
- [Cucumber — Gherkin Reference](https://cucumber.io/docs/gherkin/reference/): `Rule` para agrupar regras de negócio e `Scenario Outline` para matrizes de exemplos.
- [OpenAPI 3.0.4](https://spec.openapis.org/oas/v3.0.4.html): obrigatoriedade definida em `required` e nulidade definida separadamente por `nullable`.

### 2.3 Abordagem de qualidade

- Rastreabilidade bidirecional entre regra, cenário BDD, teste Playwright e evidência manual.
- Particionamento por equivalência: omitido, `null`, vazio, enum válido, enum inválido e enum divergente.
- Análise de fronteira: valor positivo mínimo, limite exato e valor imediatamente superior.
- Testes de transação e idempotência para impedir persistência parcial ou atualizações artificiais.
- Regressão de integração para preço público e FEPAS.
- Execução serial, pois setup, campanhas e estado FEPAS compartilham dados.

## 3. Estado atual confirmado no código

| Componente | Evidência observada | Consequência para os testes |
|---|---|---|
| `GestaoVgPricingRuleImportService` | `validateEnumField(..., "tipoValor", ..., false)` | ausência, `null` ou valor em branco não devem gerar `400.001` |
| `GestaoVgPricingRuleImportService` | compara `tipoValor` apenas quando não está em branco e pertence ao enum | enum inválido gera `400.004`; divergência válida gera `400.039` |
| `GestaoVgPricingRuleMapper` | `novoValor -> ABSOLUTO`; `decrescimo -> PERCENTUAL` | persistência e cálculo não dependem da declaração externa |
| `GestaoVgPricingRuleMapper` | snapshot canônico grava o tipo inferido | ausência e presença compatível devem produzir o mesmo hash |
| `GestaoVgPricingRuleRequest` | `tipoValor` possui apenas `@Size(max=20)` | não existe obrigatoriedade por Bean Validation |
| `GestaoVgPricingRuleController` | recebe `List<@NotNull @Valid ...>` | o body deve ser um array e cada item deve ser válido |
| Swagger | `required` contém apenas `codigoRegra` e `statusRegra` | `tipoValor` deve continuar fora da lista de obrigatórios |
| Swagger | `tipoValor` é `nullable` e enum `[ABSOLUTO, PERCENTUAL]` | `null` é aceito; valor não nulo continua restrito ao enum |
| `PriceService` | lê uma fotografia de limites e aplica a melhor campanha | o teste deve validar o preço final, não somente o HTTP da importação |
| `EffectivePriceStateService` | hash inclui preço final, código e hash da campanha | alternar campo redundante não deve criar nova versão |
| `SeFepasService` | usa o estado efetivo na carga | a tag `404` deve manter o preço promocional |

### 3.1 Códigos funcionais relevantes

| Código | Condição |
|---|---|
| `400.004` | formato/enum inválido, incluindo `tipoValor=OUTRO` |
| `400.033` | ausência de `novoValor` e `decrescimo` |
| `400.036` | `novoValor` e `decrescimo` simultâneos |
| `400.037` | presença de `acrescimo` |
| `400.038` | desconto não positivo ou superior ao limite efetivo |
| `400.039` | `tipoValor` válido, mas divergente da modalidade inferida |
| `400.040` | filtro ainda não suportado |
| `409.001` | tentativa de reduzir setup abaixo de campanha ativa |
| `422.065` | regras elegíveis sem resultado válido na cotação |

## 4. Gap encontrado na suíte Playwright

O arquivo `../tests/pricing/import-pricing-rules.spec.ts` contém atualmente:

```text
PRIC-008 | tipoValor ausente deve ser rejeitado
```

Esse caso representa o comportamento anterior ao hotfix e deve ser alterado. Se permanecer como está, uma execução correta do backend fará o teste falhar e poderá induzir rollback indevido da correção.

Também foram encontrados estes pontos:

- `pricingRule(...)` sempre inclui `tipoValor: ABSOLUTO` por padrão;
- `percentageDiscountRule(...)` sempre inclui `tipoValor: PERCENTUAL`;
- `PRICE-002`, `PRICE-003` e os casos FEPAS exercitam a regra com `tipoValor` explícito;
- não existe teste Playwright que compare a mesma campanha sem o campo e depois com o campo compatível;
- a idempotência atual `PRIC-002` cobre payload byte/semanticamente igual, mas não a equivalência entre contratos legado e novo.

## 5. Estratégia de cobertura

| Camada | Objetivo | Prioridade |
|---|---|---|
| Contrato | impedir que Swagger ou cliente gerado volte a exigir `tipoValor` | P0 |
| Importação | validar inferência e todas as combinações do campo opcional | P0 |
| Persistência | comprovar enum inferido, hash e ausência de gravação parcial | P0 |
| Setup | proteger limites dinâmicos e compatibilidade do setup | P0 |
| Preço | comprovar cálculo absoluto/percentual com payload legado | P0 |
| FEPAS | comprovar preço na tag `404` e versionamento sem ruído | P1 |
| Observabilidade | comprovar contadores, correlação e ausência de erro obrigatório | P1 |

## 6. Pré-condições e massa de teste

Antes de qualquer execução mutante:

1. Usar ambiente local descartável ou HML formalmente autorizado.
2. Confirmar `GET ${BASE_URL}/actuator/health` com HTTP 200 e status `UP`.
3. Registrar a fotografia de `GET ${BASE_URL}/backoffice/vouchers/setup`.
4. Reservar um CNPJ, um produto e códigos de regra exclusivos para a rodada.
5. Confirmar que o preço líquido base do produto é maior que o maior desconto usado.
6. Garantir que não existam campanhas concorrentes para a mesma combinação, ou documentá-las.
7. Definir `x-correlation-id` exclusivo por cenário.
8. Não usar credenciais em comandos versionados, relatório ou evidências públicas.

Variáveis recomendadas:

```dotenv
TEST_ENV=local
BASE_URL=http://127.0.0.1:8001/voucher/v1
SETUP_CONTRACT=pricing-discount-limits
ALLOW_MUTATION=true
ENABLE_MUTATING_E2E=true
CNPJ_DISTRIBUIDOR=<cnpj_reservado>
PRODUCT_CODE=<produto_reservado>
CUSTOMER_ID=<customer_id>
CUSTOMER_SITE_ID=<customer_site_id>
```

Para HML, acrescentar somente após autorização:

```dotenv
TEST_ENV=hml
MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS
```

Para FEPAS controlado:

```dotenv
ENABLE_FEPAS_E2E=true
FEPAS_DISTRIBUTOR_DOCUMENT=<documento_reservado>
```

## 7. Especificação BDD

```gherkin
# language: pt
Funcionalidade: Compatibilidade de campanhas do Gestão VG sem tipoValor
  Como consumidor da API de campanhas
  Quero informar novoValor ou decrescimo sem duplicar a modalidade
  Para manter o contrato histórico sem perder validações comerciais

  Contexto:
    Dado que o ms-voucher está saudável
    E que o setup possui limites absoluto e percentual positivos
    E que utilizo codigoRegra exclusivo, CNPJ e produto elegíveis

  Regra: A modalidade é inferida quando tipoValor está ausente

    Esquema do Cenário: Aceitar contrato legado e persistir a modalidade inferida
      Dado uma campanha ativa com <campoDesconto> igual a <valor>
      E sem a propriedade tipoValor
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 200
      E totalCriado deve ser 1
      E a modalidade persistida deve ser <modalidade>

      Exemplos:
        | campoDesconto | valor | modalidade |
        | novoValor     | 10.00 | ABSOLUTO   |
        | decrescimo    | 10.00 | PERCENTUAL |

    Cenário: Aceitar tipoValor explicitamente nulo
      Dado uma campanha absoluta com tipoValor igual a null
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 200
      E a modalidade persistida deve ser ABSOLUTO

    Cenário: Tratar tipoValor em branco como ausência compatível
      Dado uma campanha percentual com tipoValor contendo apenas espaços
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 200
      E a modalidade persistida deve ser PERCENTUAL

  Regra: Quando informado, tipoValor deve ser válido e concordante

    Esquema do Cenário: Aceitar declaração explícita compatível
      Dado uma campanha com <campoDesconto> igual a 10.00
      E tipoValor igual a <tipoValor>
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 200
      E a modalidade persistida deve ser <tipoValor>

      Exemplos:
        | campoDesconto | tipoValor |
        | novoValor     | ABSOLUTO  |
        | decrescimo    | PERCENTUAL|

    Cenário: Rejeitar enum desconhecido
      Dado uma campanha absoluta com tipoValor igual a OUTRO
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 400
      E o código funcional deve ser 400.004
      E nenhuma campanha deve ser persistida

    Esquema do Cenário: Rejeitar declaração divergente
      Dado uma campanha com <campoDesconto> igual a 10.00
      E tipoValor igual a <tipoValorDivergente>
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 400
      E o código funcional deve ser 400.039
      E nenhuma campanha deve ser persistida

      Exemplos:
        | campoDesconto | tipoValorDivergente |
        | novoValor     | PERCENTUAL           |
        | decrescimo    | ABSOLUTO             |

  Regra: A campanha deve conter exatamente um desconto e nunca um aumento

    Esquema do Cenário: Rejeitar definição de valor inválida
      Dado uma campanha com <combinacao>
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 400
      E o código funcional deve ser <codigo>

      Exemplos:
        | combinacao                         | codigo  |
        | novoValor e decrescimo preenchidos | 400.036 |
        | nenhum desconto preenchido         | 400.033 |
        | acrescimo preenchido                | 400.037 |

  Regra: Os limites do setup governam as duas modalidades

    Esquema do Cenário: Aceitar o limite exato
      Dado que o limite de <modalidade> no setup é <limite>
      E uma campanha sem tipoValor usa desconto igual a <limite>
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 200

    Esquema do Cenário: Rejeitar valor acima do limite
      Dado que o limite de <modalidade> no setup é <limite>
      E uma campanha sem tipoValor usa desconto igual a <acimaDoLimite>
      Quando eu importar a campanha
      Então a resposta deve ser HTTP 400
      E o código funcional deve ser 400.038

  Regra: Contratos semanticamente equivalentes são idempotentes

    Cenário: Reenviar a mesma campanha sem tipoValor
      Dado que uma campanha legado foi criada sem tipoValor
      Quando eu reenviar o mesmo payload
      Então a resposta deve ser HTTP 200
      E totalIgnorado deve ser 1

    Cenário: Alternar ausência e presença compatível de tipoValor
      Dado que uma campanha absoluta foi criada sem tipoValor
      Quando eu reenviar o mesmo codigoRegra com tipoValor igual a ABSOLUTO
      Então a resposta deve ser HTTP 200
      E totalIgnorado deve ser 1
      E o payloadHash e updatedAt persistidos não devem mudar

  Regra: A validação do lote é atômica

    Cenário: Aceitar lote misto válido sem tipoValor
      Dado um lote com uma campanha absoluta e outra percentual
      E ambas omitem tipoValor
      Quando eu importar o lote
      Então a resposta deve ser HTTP 200
      E duas campanhas devem ser processadas

    Cenário: Rejeitar todo o lote quando um item é inválido
      Dado um lote com uma campanha válida sem tipoValor
      E outra campanha com tipoValor divergente
      Quando eu importar o lote
      Então a resposta deve ser HTTP 400
      E nenhuma das campanhas deve ser persistida

  Regra: A inferência deve alcançar preço e FEPAS

    Esquema do Cenário: Aplicar campanha legado na consulta de preços
      Dado um preço líquido base conhecido
      E uma campanha sem tipoValor com <campoDesconto> igual a <valor>
      Quando eu consultar GET /prices para o produto elegível
      Então o preço líquido deve ser <calculoEsperado>
      E o JSON não deve expor metadados internos da campanha

      Exemplos:
        | campoDesconto | valor | calculoEsperado                |
        | novoValor     | 10.00 | preço base menos 10.00         |
        | decrescimo    | 10.00 | preço base menos 10 por cento  |

    Cenário: Não versionar FEPAS por presença de campo redundante
      Dado uma campanha sem tipoValor já refletida no estado FEPAS
      Quando eu reenviar a campanha com tipoValor compatível
      E o PDV consultar novamente a versão
      Então nenhuma nova versão deve ser anunciada
      E a tag 404 deve preservar o mesmo preço final
```

## 8. Matriz completa de testes

| ID | Prioridade | Camada | Entrada/ação | Resultado esperado |
|---|---:|---|---|---|
| TV-CON-001 | P0 | OpenAPI | inspecionar `GestaoVgPricingRuleRequest.required` | contém `codigoRegra` e `statusRegra`; não contém `tipoValor` |
| TV-CON-002 | P0 | OpenAPI | inspecionar schema de `tipoValor` | `nullable: true`, enum com dois valores e descrição da inferência |
| TV-IMP-001 | P0 | API/DB | `novoValor=10`, propriedade omitida | 200; `tipo_valor=ABSOLUTO` |
| TV-IMP-002 | P0 | API/DB | `decrescimo=10`, propriedade omitida | 200; `tipo_valor=PERCENTUAL` |
| TV-IMP-003 | P1 | API/DB | `novoValor=10`, `tipoValor=null` | 200; `ABSOLUTO` |
| TV-IMP-004 | P1 | API/DB | `decrescimo=10`, `tipoValor="   "` | 200; `PERCENTUAL` |
| TV-IMP-005 | P0 | API/DB | `novoValor=10`, `tipoValor=ABSOLUTO` | 200 |
| TV-IMP-006 | P0 | API/DB | `decrescimo=10`, `tipoValor=PERCENTUAL` | 200 |
| TV-IMP-007 | P0 | API/DB | `tipoValor=OUTRO` | 400 / `400.004`; sem persistência |
| TV-IMP-008 | P0 | API/DB | `novoValor=10`, `tipoValor=PERCENTUAL` | 400 / `400.039` |
| TV-IMP-009 | P0 | API/DB | `decrescimo=10`, `tipoValor=ABSOLUTO` | 400 / `400.039` |
| TV-IMP-010 | P0 | API/DB | `novoValor` e `decrescimo` | 400 / `400.036` |
| TV-IMP-011 | P0 | API/DB | sem ambos os descontos | 400 / `400.033` |
| TV-IMP-012 | P0 | API/DB | `acrescimo` presente | 400 / `400.037` |
| TV-IMP-013 | P0 | API/DB | absoluto igual ao setup | 200 |
| TV-IMP-014 | P0 | API/DB | percentual igual ao setup | 200 |
| TV-IMP-015 | P0 | API/DB | absoluto `limite + 0,01` | 400 / `400.038` |
| TV-IMP-016 | P0 | API/DB | percentual `limite + 0,01` | 400 / `400.038` |
| TV-IDEM-001 | P0 | API/DB | repetir payload omitido | 200; `totalIgnorado=1` |
| TV-IDEM-002 | P0 | API/DB | omitido -> explícito compatível | 200; `totalIgnorado=1`; mesmo hash |
| TV-IDEM-003 | P1 | API/DB | explícito compatível -> omitido | 200; `totalIgnorado=1`; mesmo hash |
| TV-LOT-001 | P0 | API/DB | duas modalidades válidas sem campo | 200; ambos processados |
| TV-LOT-002 | P0 | API/DB | item válido + divergente | 400; rollback integral |
| TV-PRICE-001 | P0 | E2E | absoluta sem campo + `GET /prices` | preço base menos desconto |
| TV-PRICE-002 | P0 | E2E | percentual sem campo + `GET /prices` | redução percentual com `HALF_EVEN` |
| TV-PRICE-003 | P1 | Contrato | consultar preço após aplicar campanha | sem `appliedPricingRuleCode` e sem `appliedPricingRulePayloadHash` |
| TV-FEP-001 | P1 | E2E/FEPAS | absoluta sem campo + carga | três valores da tag `404` iguais ao preço final |
| TV-FEP-002 | P1 | E2E/FEPAS | alternar ausência/presença compatível | não anunciar nova versão |
| TV-SET-001 | P0 | Regressão | payload legado de setup | limites atuais preservados |
| TV-OBS-001 | P1 | Logs | importação válida sem campo | log com contadores e sem mensagem de obrigatoriedade |

## 9. Payloads de referência

Substituir código, CNPJ, produto e datas antes da execução.

### 9.1 Absoluto legado

```json
[
  {
    "codigoRegra": 910001,
    "descricaoRegra": "E2E tipoValor ausente - absoluto",
    "cnpj": "03282579000110",
    "produto": "0110035",
    "novoValor": 10.00,
    "statusRegra": "A",
    "dataInicio": "2026-07-31",
    "dataFim": "2026-08-07"
  }
]
```

### 9.2 Percentual legado

```json
[
  {
    "codigoRegra": 910002,
    "descricaoRegra": "E2E tipoValor ausente - percentual",
    "cnpj": "03282579000110",
    "produto": "0110035",
    "decrescimo": 10.00,
    "statusRegra": "A",
    "dataInicio": "2026-07-31",
    "dataFim": "2026-08-07"
  }
]
```

### 9.3 Divergência

```json
[
  {
    "codigoRegra": 910003,
    "cnpj": "03282579000110",
    "produto": "0110035",
    "novoValor": 10.00,
    "tipoValor": "PERCENTUAL",
    "statusRegra": "A",
    "dataInicio": "2026-07-31",
    "dataFim": "2026-08-07"
  }
]
```

## 10. Ajustes recomendados na automação Playwright

### 10.1 Builder de massa

Adicionar helpers explícitos para o contrato legado. Evitar alterar o default de todos os testes existentes de uma vez.

```ts
export function withoutTipoValor(rule: Record<string, unknown>) {
  const legacyRule = { ...rule };
  delete legacyRule.tipoValor;
  return legacyRule;
}

export function legacyAbsoluteRule(overrides: Partial<Record<string, unknown>> = {}) {
  return withoutTipoValor(pricingRule(overrides));
}

export function legacyPercentageRule(overrides: Partial<Record<string, unknown>> = {}) {
  return withoutTipoValor(percentageDiscountRule(overrides));
}
```

### 10.2 Substituir `PRIC-008`

Novo objetivo:

```ts
test('PRIC-008 | tipoValor ausente deve ser inferido para as duas modalidades', async ({ request }) => {
  const client = new MsVoucherClient(request, env);
  const absolute = legacyAbsoluteRule({
    codigoRegra: nextPricingRuleCode(),
    cnpj: env.data.cnpjDistribuidor,
    produto: env.data.productCode,
    novoValor: 10
  });
  const percentage = legacyPercentageRule({
    codigoRegra: nextPricingRuleCode(),
    cnpj: env.data.cnpjDistribuidor,
    produto: env.data.productCode,
    decrescimo: 10
  });
  importedRules.push(absolute, percentage);

  const body = await expectJsonResponse(
    await client.importGestaoVgPricingRules([absolute, percentage]),
    200
  );

  expect(body.totalRecebido).toBe(2);
  expect(body.totalCriado + body.totalAtualizado + body.totalIgnorado).toBe(2);
});
```

### 10.3 Novos casos de importação

Adicionar ao mesmo spec:

- `PRIC-014`: enum `OUTRO` retorna `400.004`;
- `PRIC-015`: matriz de divergências retorna `400.039`;
- `PRIC-016`: omitido e explícito compatível resultam em `totalIgnorado=1`;
- `PRIC-017`: lote válido misto sem `tipoValor`;
- `PRIC-018`: item válido sem campo + item divergente provoca rollback integral;
- `PRIC-019`: `null` e espaços seguem a semântica opcional observada no serviço.

### 10.4 Preço e FEPAS

- Alterar `PRICE-002` para usar `legacyAbsoluteRule`.
- Alterar `PRICE-003` para usar `legacyPercentageRule`.
- Adicionar `FEP-009`: carregar estado com campo omitido, reenviar campo compatível e confirmar que o terminal não recebe anúncio de nova versão.

### 10.5 Contrato OpenAPI

Adicionar um teste de contrato que leia o Swagger empacotado ou publicado e confirme:

```ts
expect(schema.required).not.toContain('tipoValor');
expect(schema.properties.tipoValor.nullable).toBe(true);
expect(schema.properties.tipoValor.enum).toEqual(['ABSOLUTO', 'PERCENTUAL']);
```

## 11. Execução automatizada

### 11.1 Preparação local

```bash
git clone https://github.com/FernandoAvanzo/PlaywrightSwitchCase.git
cd PlaywrightSwitchCase/ms-voucher-playwright-e2e
npm install
cp .env.local.example .env.local
```

Configurar `MS_VOUCHER_PROJECT_DIR` para o checkout do backend e preencher somente dados não secretos no arquivo local.

### 11.2 Subir ambiente descartável

```bash
npm run infra:config
npm run infra:up:app
npm run doctor:env
```

Confirmar os containers:

```bash
npm run infra:ps
npm run infra:logs:app
```

### 11.3 Validar compilação da suíte

```bash
npm run lint
npx playwright test --list
```

### 11.4 Executar por domínio

```bash
npm run test:setup
npm run test:pricing
npm run test:prices
```

FEPAS somente com opt-in e massa controlada:

```bash
npm run test:fepas
```

Regressão consolidada:

```bash
npm run test:pricing-fix
```

Execução direcionada dos novos casos:

```bash
npx playwright test tests/pricing/import-pricing-rules.spec.ts --grep "PRIC-008|PRIC-014|PRIC-015|PRIC-016|PRIC-017|PRIC-018|PRIC-019"
npx playwright test tests/prices/prices.spec.ts --grep "PRICE-002|PRICE-003"
npx playwright test tests/e2e/pricing-to-fepas.spec.ts --grep "FEP-009"
```

Em caso de falha, repetir uma única vez com trace integral:

```bash
npx playwright test <arquivo> --grep "<ID>" --trace on
npm run report
```

Não mascarar flakiness com retries locais. Investigar estado residual, campanhas concorrentes, vigência, fuso e dados de setup.

### 11.5 Encerramento local

```bash
npm run infra:down
```

O comando remove volumes do projeto local; não deve ser apontado para uma stack compartilhada.

## 12. Roteiro manual de homologação

### 12.1 Registrar baseline

1. Gerar um `correlationId` da rodada.
2. Consultar health e salvar status/data/hora.
3. Consultar setup e registrar `maxAbsoluteDiscount` e `maxPercentageDiscount`.
4. Consultar `GET /prices?code-product=<produto>` com headers `customerId` e `customerSiteId`.
5. Registrar o preço líquido base.
6. Consultar o banco para confirmar ausência dos códigos de regra reservados.

Consulta de apoio:

```sql
SELECT codigo_regra,
       novo_valor,
       decrescimo,
       tipo_valor,
       payload_hash,
       status_regra,
       updated_at
  FROM gestao_vg_pricing_rule
 WHERE codigo_regra IN (910001, 910002, 910003);
```

### 12.2 Executar caminho feliz absoluto

1. Enviar o payload 9.1 sem `tipoValor`.
2. Confirmar HTTP 200.
3. Confirmar `totalRecebido=1` e `totalCriado=1` para código novo.
4. Consultar a tabela e confirmar `tipo_valor='ABSOLUTO'`.
5. Salvar `payload_hash` e `updated_at`.
6. Consultar `GET /prices` e confirmar `preço final = preço base - novoValor`.

### 12.3 Executar caminho feliz percentual

1. Enviar o payload 9.2 sem `tipoValor`.
2. Confirmar HTTP 200 e criação.
3. Confirmar `tipo_valor='PERCENTUAL'`.
4. Consultar preço.
5. Calcular `preço base - (preço base × decrescimo / 100)`.
6. Arredondar para duas casas com `HALF_EVEN` e comparar.

### 12.4 Validar idempotência semântica

Para o código absoluto criado:

1. Reenviar o mesmo payload ainda sem `tipoValor`.
2. Confirmar `totalIgnorado=1`.
3. Adicionar `"tipoValor":"ABSOLUTO"` sem alterar outro campo.
4. Reenviar.
5. Confirmar novamente `totalIgnorado=1`.
6. Confirmar que `payload_hash` e `updated_at` permanecem iguais ao baseline salvo.
7. Repetir na modalidade percentual com `PERCENTUAL`.

### 12.5 Validar rejeições

Executar cada variação com código exclusivo e confirmar ausência no banco:

| Variação | Esperado |
|---|---|
| `tipoValor=OUTRO` | 400 / `400.004` |
| `novoValor` + `PERCENTUAL` | 400 / `400.039` |
| `decrescimo` + `ABSOLUTO` | 400 / `400.039` |
| `novoValor` + `decrescimo` | 400 / `400.036` |
| sem os dois descontos | 400 / `400.033` |
| `acrescimo` presente | 400 / `400.037` |
| desconto igual a zero | 400; Bean Validation ou `400.038`, conforme fronteira atingida |
| desconto acima do setup | 400 / `400.038` |

Para erros que podem ser agregados, verificar que o código funcional esperado está presente; não depender da ordem textual das mensagens.

### 12.6 Validar atomicidade

1. Montar um array com dois códigos inéditos.
2. Primeiro item: absoluto válido sem `tipoValor`.
3. Segundo item: absoluto com `tipoValor=PERCENTUAL`.
4. Enviar o lote e confirmar HTTP 400 / `400.039`.
5. Consultar os dois códigos no banco; nenhum deve existir.
6. Reenviar somente o primeiro item.
7. Confirmar `totalCriado=1`, provando que não foi salvo no lote rejeitado.

### 12.7 Validar FEPAS

Somente em ambiente autorizado:

1. Importar campanha sem `tipoValor`.
2. Confirmar o preço promocional em `GET /prices`.
3. Iniciar descoberta FEPAS com versão `00000000`.
4. Ler a versão anunciada.
5. Solicitar a carga.
6. Decodificar a primeira tag `404`.
7. Confirmar que os três campos monetários têm o preço final em centavos.
8. Reenviar a campanha com `tipoValor` compatível.
9. Fazer nova descoberta com a versão já carregada.
10. Confirmar que não há anúncio de nova versão.

### 12.8 Observabilidade

Pesquisar pelo `x-correlation-id` e pelo evento `GESTAO_VG_PRICING_RULE_IMPORT`.

Validar:

- `received`, `created`, `updated` e `ignored` coerentes;
- ausência de “O campo tipoValor é obrigatório” nos casos compatíveis;
- existência de erro funcional nos negativos;
- nenhuma gravação de payload completo ou credencial;
- ausência de versão FEPAS inesperada no caso idempotente.

## 13. Evidências obrigatórias

Para cada caso P0, guardar:

- ID do teste e ambiente;
- data/hora e commit/build do backend;
- `correlationId`;
- request sanitizado;
- status HTTP e body;
- linha do banco ou prova de ausência;
- preço antes/depois quando aplicável;
- trace/relatório Playwright em falha;
- resultado da limpeza.

Modelo:

| Campo | Valor |
|---|---|
| Caso | TV-IMP-001 |
| Ambiente | local/HML |
| Build | `<versão>` |
| Correlation ID | `<uuid>` |
| Resultado | PASS/FAIL/BLOCKED |
| Evidência HTTP | `<arquivo/link>` |
| Evidência DB | `<arquivo/link>` |
| Observação | `<texto>` |

## 14. Limpeza

1. Inativar pela API todas as campanhas criadas, usando o mesmo conteúdo e `statusRegra=I`.
2. Não excluir registros diretamente; preservar histórico e auditoria.
3. Restaurar a fotografia inicial do setup em bloco `finally`/procedimento equivalente.
4. Reconsultar preços e confirmar retorno ao baseline.
5. Em local, encerrar a stack e os volumes do projeto.
6. Em HML, registrar os códigos inativados e confirmar que não restou campanha ativa de teste.

## 15. Critérios de aceite

- `tipoValor` omitido, `null` ou em branco não gera obrigatoriedade.
- `novoValor` sem `tipoValor` persiste `ABSOLUTO`.
- `decrescimo` sem `tipoValor` persiste `PERCENTUAL`.
- enum inválido continua retornando `400.004`.
- divergência continua retornando `400.039`.
- ambiguidade, ausência de desconto, acréscimo e limites permanecem protegidos.
- lote inválido não produz persistência parcial.
- payloads semanticamente equivalentes são ignorados e mantêm o mesmo hash.
- preço absoluto e percentual são calculados sobre o preço líquido vigente.
- metadados internos não vazam no JSON público.
- FEPAS recebe o preço final e não cria versão por presença de campo redundante.
- Swagger não marca `tipoValor` como obrigatório.
- `npm run lint`, testes focados e `npm run test:pricing-fix` passam sem falhas.
- o caso antigo `PRIC-008` foi substituído e não documenta mais o comportamento removido.

## 16. Riscos e decisões pendentes

| Risco | Tratamento |
|---|---|
| Campanha concorrente altera o preço esperado | usar massa exclusiva ou base descartável |
| Setup compartilhado muda durante a execução | capturar/restaurar snapshot e manter `workers: 1` |
| Datas fixas envelhecem | gerar vigência relativa no fuso `America/Bahia` |
| HML é mutável e compartilhado | guards, confirmação textual e códigos exclusivos |
| FEPAS muda estado do distribuidor | manter opt-in e usar documento reservado |
| Mensagens agregadas mudam de ordem | validar código funcional, não texto integral |
| Campo vazio pode ser futuramente tratado de modo diferente | manter TV-IMP-004 como contrato explícito ou classificar como exploratório |

## 17. Glossário

| Termo | Significado |
|---|---|
| BDD | Desenvolvimento orientado por comportamento; descreve regras com exemplos observáveis |
| E2E | Teste de ponta a ponta que atravessa componentes reais do fluxo |
| DTO | Objeto que representa o JSON recebido pela API |
| HML | Ambiente de homologação |
| FEPAS | Integração que distribui a tabela efetiva de preços ao PDV |
| PDV | Ponto de venda |
| Hash canônico | Assinatura calculada sobre conteúdo normalizado e semanticamente relevante |
| Idempotência | Repetir a mesma intenção sem criar novo efeito |
| OpenAPI | Especificação do contrato da API e fonte do Swagger |
| Fixture | Recurso de preparação/isolamento fornecido ao teste Playwright |

## 18. Conclusão

O hotfix deve ser aceito somente quando o contrato legado for comprovado nas duas modalidades e a equivalência semântica for observada até o FEPAS. A simples obtenção de HTTP 200 não é evidência suficiente: a validação precisa confirmar o enum persistido, o hash estável, o preço calculado e a ausência de versão artificial.

O ajuste mais urgente na automação é inverter o comportamento de `PRIC-008` e usar campanhas sem `tipoValor` também nos testes de preço. Com esses ajustes e os novos casos propostos, a suíte passa a proteger tanto a compatibilidade histórica quanto as barreiras comerciais introduzidas pela nova precificação.
