# Guia técnico de testes BDD e E2E — fallback para o preço-base no `ms-voucher`

**Projeto alvo:** `ms-voucher`  
**Suíte de automação:** `ms-voucher-playwright-e2e`  
**Tarefa:** `[task] Generate BDD and e2e Playwright test scenarions for the campaing not match criterias`  
**Regra corrigida:** retornar a oferta-base quando nenhuma campanha for aplicável  
**Data:** 03/08/2026  
**Idioma:** português do Brasil

## 1. Resumo executivo

A regressão deve provar que uma campanha é um benefício opcional sobre uma oferta já existente. Quando não houver campanha ativa, quando os filtros da campanha não corresponderem ao contexto ou quando todas as candidatas forem descartadas pelas validações defensivas, `GET /prices` deve continuar respondendo `HTTP 200` com a oferta vigente. A oferta de fallback é `netPriceProduct`, quando preenchido; caso contrário, `priceProduct` no contrato REST (`price` no estado interno). O fluxo não deve responder `422.065` apenas por não existir campanha aplicável.

O código Java atual armazenado no Google Drive já contém o hotfix: `PriceService.findBestPricingRule(...)` retorna `Optional.empty()` quando `validApplications` fica vazio, e `applyPricingRule(...)` preserva o `PriceResponse` original. `GetPricesTest.java` também já possui 37 testes, incluindo regressões para ausência de campanha, preservação do preço líquido, mistura de candidata válida e inválida e catálogo com fallback parcial. O relatório técnico anexo registra `373` testes Maven aprovados; esse resultado foi tratado como evidência do anexo, não reexecutado neste trabalho.

Na suíte Playwright atual, `tests/prices/prices.spec.ts` ainda termina em `PRICE-015` e não contém `PRICE-016` a `PRICE-021`. Portanto, a lacuna desta entrega é principalmente de automação HTTP/E2E e de roteiro manual em HML.

## 2. Contexto e evidências

### 2.1 Decisão de negócio

As páginas do Notion e as conversas do Teams convergem para a mesma regra:

- A tarefa [Fix the price rule to get the default price when a campaing do not match with the criterias](https://app.notion.com/p/3b1b3def3e7c801684b7eed16af4b530) define que a ausência de campanha aplicável deve manter a oferta anterior à campanha, sem código/hash de regra e sem `422.065`.
- A story [Novo fluxo de precificação — Campanhas](https://app.notion.com/p/37cb3def3e7c8062b73df9c57fb6a4e9) trata a campanha como sobreposição temporária; encerrada a vigência, volta o preço normal.
- Na [conversa com Fábio](https://teams.cloud.microsoft/l/chat/19:124ef588-86b0-48b5-8a69-b29707084de1_4d35ac12-f224-476b-aac8-ef3cf2b78aee@unq.gbl.spaces/conversations?context=%7B%22contextType%22%3A%22chat%22%7D), foi esclarecido que `GET /prices` alimenta a geração do vale e que não retornar preço pode quebrar o fluxo consumidor.
- Na [conversa do grupo com Marcelo e Fábio](https://teams.cloud.microsoft/l/chat/19:567ac97996fb4ef584ceaef0e2025f68@thread.v2/conversations?context=%7B%22contextType%22%3A%22chat%22%7D), Marcelo confirmou que campanha é esporádica e que, sem campanha, deve ser retornado o valor padrão.

### 2.2 Estado atual do código Java

Foram inspecionados a árvore `src` do [projeto `ms-voucher`](https://drive.google.com/drive/folders/184PaSJreDCSOG2iSDO6jlEMTSW_AjnHu) e, em especial:

- [`PriceService.java`](https://drive.google.com/file/d/1kDgEp9KwiOEEKrtql_XEtqkTjDqimlsF/view): consulta preços, busca campanhas candidatas e aplica a vencedora.
- [`GetPricesTest.java`](https://drive.google.com/file/d/1J8javcVXk16UqDCIREoSfQMfsx1oW5ag/view): contém as regressões unitárias/integração do serviço.
- [`PricesController.java`](https://drive.google.com/file/d/1bhlnb7rKAjQnE45Qjf5tdtkrVvcwvCUD/view): apenas delega a consulta; não é a origem do defeito.

O comportamento atual relevante é:

```java
Optional<PricingRuleApplication> application = findBestPricingRule(...);
if (application.isEmpty()) {
    return priceResponse;
}
```

Quando há candidatas, mas nenhuma aplicação válida:

```java
if (validApplications.isEmpty()) {
    log.warn("No valid pricing campaign applies ... Returning the current base offer ...");
    return Optional.empty();
}
```

Assim, o fallback não recalcula nem substitui campos: ele preserva a oferta já montada, inclusive um `netPriceProduct` legítimo.

### 2.3 Estado atual da suíte Playwright

Foram inspecionados a árvore `src`, os testes e os documentos do [projeto `ms-voucher-playwright-e2e`](https://drive.google.com/drive/folders/1n35kKh7M45AYrqNNRI0n4M5sKlZm2Gra), incluindo:

- [`README.md`](https://drive.google.com/file/d/1jFHzEiL1lChk24aHE0vEUhqRQVqmVik3/view);
- [`package.json`](https://drive.google.com/file/d/15ik_F-PLJksXPNosYy7XUaB_tK4_zSx5/view);
- [`playwright.config.ts`](https://drive.google.com/file/d/15CoGAyaZhunStEtmAI5Gi4DfS5nfO27D/view);
- [`src/api/msVoucherClient.ts`](https://drive.google.com/file/d/15xwQAHFMQjAuopf_cjP3jTUq6B1V2KwU/view);
- [`src/data/pricingRules.ts`](https://drive.google.com/file/d/19fgvzaOOdCKbzkLojabaSdljRGJeO5vx/view);
- [`tests/prices/prices.spec.ts`](https://drive.google.com/file/d/19FvYatGCasJD_I4ZbXkHYREoKNZ9wMj4/view);
- [`tests/pricing/import-pricing-rules.spec.ts`](https://drive.google.com/file/d/1ItAR9JcZ7XE6Mv_B43jf1ijVHE2spAWF/view);
- [`tests/e2e/pricing-to-fepas.spec.ts`](https://drive.google.com/file/d/1hY9xoTiu50y4gbuTllX_TpKWu_DOmm_2/view).

A suíte já adota boas proteções: `workers: 1`, mutações bloqueadas por padrão, códigos de regra únicos, limpeza por inativação oficial e relatórios `list`/HTML. O Playwright suporta testes HTTP diretamente com `APIRequestContext`, preparação/limpeza por hooks e seleção por tags com `--grep`, o que é coerente com a arquitetura atual da suíte ([API testing](https://playwright.dev/docs/api-testing), [annotations e tags](https://playwright.dev/docs/test-annotations)).

### 2.4 Expectativa histórica superada

O guia anterior de regras de preço continha um cenário que esperava `422.065` quando todas as campanhas elegíveis fossem inconsistentes. Essa expectativa é incompatível com a tarefa atual e deve ser substituída pelo cenário de fallback. A validação da campanha continua existindo; o que muda é o efeito para a oferta principal.

## 3. Regra de negócio testável

### 3.1 Regra principal

```text
ofertaDeFallback = netPriceProduct ?? priceProduct
```

Se nenhuma campanha produzir uma aplicação válida:

- responder `HTTP 200`;
- manter o produto na lista;
- manter a oferta vigente;
- não retornar o erro funcional `422.065`;
- não expor metadados internos da campanha;
- permitir que os fluxos consumidores continuem, inclusive geração de vale e carga FEPAS quando executados em ambiente autorizado.

### 3.2 Regras que não mudam

- `novoValor` continua sendo desconto absoluto.
- `decrescimo` continua sendo desconto percentual.
- `acrescimo` continua inválido.
- Limites de desconto do setup continuam válidos.
- Resultados nulos, não positivos ou maiores que o preço vigente continuam sendo descartados como aplicações de campanha.
- Entre aplicações válidas, vence o menor preço final; em empate, maior especificidade; persistindo o empate, maior `codigoRegra`.
- O caminho Oracle não deve consultar campanhas locais.

## 4. Estratégia de cobertura

Nem todo estado defensivo pode ser criado pela API oficial. A importação rejeita campanhas inválidas e a atualização do setup bloqueia uma redução que tornaria campanha ativa incompatível. Por isso, a cobertura correta combina camadas.

| ID | Cenário | Camada obrigatória | Automação Playwright | Observação |
|---|---|---|---|---|
| FB-JAVA-001 | Nenhuma candidata retornada | Java | Complementar | Já coberto por `shouldReturnBasePriceWhenNoActivePricingRuleExists` |
| FB-JAVA-002 | Todas as candidatas produzem preço não positivo | Java | Local com fixture, opcional | Já coberto por `shouldReturnBasePriceWhenEveryCandidateProducesNonPositivePrice` |
| FB-JAVA-003 | Campanha excede limite vigente | Java | Local com fixture, opcional | Já coberto por `shouldReturnBasePriceWhenCampaignExceedsCurrentSetupLimit` |
| FB-JAVA-004 | Preservar preço líquido existente | Java | Recomendado | Já coberto por `shouldReturnExistingNetPriceWhenNoCampaignCanBeApplied` |
| FB-JAVA-005 | Candidata inválida + candidata válida | Java | Local com fixture, opcional | Já coberto por `shouldApplyValidCampaignWhenOtherCandidatesAreInvalid` |
| FB-JAVA-006 | Um produto com campanha e outro em fallback | Java | Recomendado | Já coberto por `shouldKeepOtherProductsAvailableWhenOneProductHasNoValidCampaign` |
| PRICE-016 | Sem campanha ativa | API/Playwright | Sim | P0, leitura segura com massa reservada |
| PRICE-017 | Campanha não corresponde aos filtros | API/Playwright | Sim | P0, cenário parametrizado |
| PRICE-018 | Candidatas persistidas, todas inválidas | Java + Playwright local | Condicional | Exige fixture local pré-semeada; proibido montar por SQL em HML |
| PRICE-019 | Inválida junto de válida | Java + Playwright local | Condicional | Exige fixture local pré-semeada |
| PRICE-020 | Campanha inativada/encerrada volta ao preço-base | API/Playwright | Sim | P0, mutante e com limpeza |
| PRICE-021 | Geração de vale funciona usando fallback | E2E/Playwright | Sim, somente local ou janela autorizada | P0 do fluxo consumidor |
| PRICE-022 | Catálogo mantém todos os produtos | API/Playwright | Recomendado | Requer catálogo controlado com dois produtos |
| FEP-010 | FEPAS recebe preço-base após fim da campanha | E2E/Playwright | Condicional | Exige `ENABLE_FEPAS_E2E=true` e massa autorizada |

## 5. Especificação BDD

Os cenários seguem a recomendação do Gherkin de descrever contexto, evento e resultado observável, mantendo detalhes de infraestrutura fora da linguagem de negócio ([referência oficial do Gherkin](https://cucumber.io/docs/gherkin/reference)).

```gherkin
# language: pt
@pricing @fallback @p0
Funcionalidade: Disponibilizar o preço vigente quando nenhuma campanha se aplica
  Como consumidor do Vale Gás
  Quero receber a oferta vigente mesmo sem campanha aplicável
  Para continuar a geração e a venda do vale

  Regra: Campanha é uma transformação opcional da oferta vigente

    Cenário: Retornar o preço-base quando não existe campanha ativa
      Dado que o cliente possui uma oferta vigente para o produto consultado
      E não existe campanha ativa para esse contexto
      Quando o cliente consulta o preço do produto
      Então a API deve responder com sucesso
      E deve retornar a oferta vigente sem o erro 422.065

    Esquema do Cenário: Retornar o preço-base quando um filtro da campanha não corresponde
      Dado que o cliente possui uma oferta vigente para o produto consultado
      E existe uma campanha ativa cujo <filtro> não corresponde ao contexto
      Quando o cliente consulta o preço do produto
      Então a API deve responder com sucesso
      E deve retornar a mesma oferta vigente anterior à campanha

      Exemplos:
        | filtro        |
        | CNPJ          |
        | produto       |
        | cidade        |
        | UF            |
        | micromercado  |
        | dia da semana |
        | período       |
        | companhia     |

    Cenário: Preservar o preço líquido já vigente no fallback
      Dado que a oferta possui preço bruto e preço líquido vigente
      E nenhuma campanha produz uma aplicação válida
      Quando o cliente consulta o preço do produto
      Então a API deve retornar o preço líquido vigente
      E não deve reconstruir a oferta a partir do preço bruto

    Cenário: Preservar a oferta quando todas as candidatas são inválidas
      Dado que existe uma oferta vigente
      E todas as campanhas candidatas são descartadas pelas validações defensivas
      Quando o cliente consulta o preço do produto
      Então a API deve responder com sucesso
      E deve retornar a oferta vigente sem o erro 422.065

    Cenário: Aplicar a candidata válida quando outra candidata é inválida
      Dado que existe uma campanha inválida e uma campanha válida para a mesma oferta
      Quando o cliente consulta o preço do produto
      Então a campanha válida deve ser aplicada
      E a candidata inválida não deve indisponibilizar a oferta

    Cenário: Retornar ao preço-base após a campanha ser inativada
      Dado que uma campanha válida está alterando o preço vigente
      Quando a campanha é inativada pela API oficial
      Então uma nova consulta deve responder com o preço anterior à campanha
      E o preço promocional não deve permanecer residual

    Cenário: Manter o catálogo quando apenas um produto usa fallback
      Dado que o catálogo possui mais de um produto vigente
      E apenas um produto possui campanha válida
      Quando o cliente consulta o catálogo
      Então todos os produtos devem permanecer disponíveis
      E cada produto deve apresentar sua própria oferta efetiva

    Cenário: Gerar vale sem campanha aplicável
      Dado que o cliente possui uma oferta vigente sem campanha aplicável
      Quando o cliente solicita a geração do vale
      Então a operação deve ser aceita
      E o fluxo não deve falhar por ausência de campanha
```

## 6. Implementação recomendada no Playwright

### 6.1 Arquivos a alterar

| Arquivo | Alteração |
|---|---|
| `tests/prices/prices.spec.ts` | Adicionar `PRICE-016`, `PRICE-017`, `PRICE-020` e, se houver catálogo controlado, `PRICE-022` |
| `tests/e2e/critical-flows.spec.ts` ou novo `tests/e2e/pricing-fallback-to-voucher.spec.ts` | Adicionar `PRICE-021` |
| `tests/e2e/pricing-to-fepas.spec.ts` | Adicionar `FEP-010` somente no fluxo opt-in |
| `src/data/pricingRules.ts` | Adicionar helpers para filtro propositalmente divergente, sem datas fixas |
| `src/utils/assertions.ts` | Adicionar comparação reutilizável de oferta, se necessário |
| `docs/matriz-bdd-e2e.md` | Registrar os novos IDs e dependências |
| `README.md` | Documentar comandos focados, massa e restrições |

### 6.2 Helpers sugeridos

```ts
function offerValue(price: Record<string, unknown>) {
  const value = price.netPriceProduct ?? price.priceProduct;
  expect(value, 'A oferta deve conter preço líquido ou preço-base.').toBeDefined();
  return value as number | string;
}

function expectFallbackTo(
  actual: Record<string, unknown>,
  baseline: Record<string, unknown>
) {
  expect(isSameMonetaryValue(offerValue(actual), offerValue(baseline))).toBeTruthy();
  expect(actual).not.toHaveProperty('appliedPricingRuleCode');
  expect(actual).not.toHaveProperty('appliedPricingRulePayloadHash');
}
```

O contrato público atual já não expõe os metadados internos, inclusive quando há campanha. Portanto, a asserção decisiva é a igualdade monetária com uma fotografia-base controlada, não apenas a ausência dos campos internos.

### 6.3 Exemplo compatível para `PRICE-017`

```ts
test('PRICE-017 @mutating @fallback | Campanha com CNPJ divergente mantém a oferta-base', async ({ request }) => {
  blockProdMutation(env);
  skipWhenMutationNotAllowed(env);
  const client = new MsVoucherClient(request, env);

  const baseline = firstPrice(await expectJsonResponse(
    await client.getPrices({ 'code-product': env.data.productCode }),
    200
  ));

  const mismatchedRule = pricingRule({
    codigoRegra: nextPricingRuleCode(),
    cnpj: '99.999.999/9999-99',
    produto: env.data.productCode,
    novoValor: 1
  });
  importedRules.push(mismatchedRule);

  await expectJsonResponse(
    await client.importGestaoVgPricingRules([mismatchedRule]),
    200
  );

  const actual = firstPrice(await expectJsonResponse(
    await client.getPrices({ 'code-product': env.data.productCode }),
    200
  ));

  expectFallbackTo(actual, baseline);
});
```

Usar CNPJ válido, mas reservado e diferente do cliente de teste, se a validação do importador rejeitar o valor sintético. Não inventar CNPJ em HML sem aprovação da massa.

### 6.4 Exemplo compatível para `PRICE-020`

```ts
test('PRICE-020 @mutating @fallback | Inativar campanha restaura a oferta-base', async ({ request }) => {
  blockProdMutation(env);
  skipWhenMutationNotAllowed(env);
  const client = new MsVoucherClient(request, env);
  const baseline = firstPrice(await expectJsonResponse(
    await client.getPrices({ 'code-product': env.data.productCode }),
    200
  ));
  const rule = pricingRule({
    codigoRegra: nextPricingRuleCode(),
    cnpj: env.data.cnpjDistribuidor,
    produto: env.data.productCode,
    novoValor: 1
  });
  importedRules.push(rule);

  await expectJsonResponse(await client.importGestaoVgPricingRules([rule]), 200);
  const promoted = firstPrice(await expectJsonResponse(
    await client.getPrices({ 'code-product': env.data.productCode }), 200
  ));
  expect(isSameMonetaryValue(offerValue(promoted), offerValue(baseline))).toBeFalsy();

  await expectJsonResponse(
    await client.importGestaoVgPricingRules([inactivePricingRule(rule)]), 200
  );
  const fallback = firstPrice(await expectJsonResponse(
    await client.getPrices({ 'code-product': env.data.productCode }), 200
  ));
  expectFallbackTo(fallback, baseline);
});
```

O `afterEach` atual continuará inativando a última fotografia de cada `codigoRegra`, tornando a limpeza idempotente.

### 6.5 `PRICE-018` e `PRICE-019`: fixture defensiva local

Não é possível criar pela API oficial uma campanha que o próprio importador deve rejeitar. Também não é possível reduzir o limite abaixo de uma campanha ativa, pois o setup responde `409.001`. Para provar o ramo defensivo de produção sem violar a API:

1. manter os testes Java como cobertura obrigatória;
2. opcionalmente, criar uma migration/seed exclusiva do Docker local que insira uma campanha historicamente inconsistente;
3. identificar a fixture por código reservado e documentação explícita;
4. iniciar o serviço somente depois da fixture;
5. executar `GET /prices` pela interface pública;
6. nunca inserir essa massa diretamente em HML ou produção.

O teste Playwright deve ser marcado `@local-fixture` e ignorado fora de `env.name === 'local'`.

### 6.6 `PRICE-021`: geração de vale

Esse caso é mutante e pode produzir vale/notificação. Deve usar `blockProdMutation`, `skipWhenMutationNotAllowed`, `skipWhenMutatingE2EDisabled` e `test.skip(env.name !== 'local', ...)`, salvo janela formalmente autorizada em HML. O fluxo mínimo é:

1. importar campanha ativa deliberadamente não correspondente;
2. consultar `GET /prices` e guardar o preço de fallback;
3. chamar `sellVoucherBackoffice(backofficeSellVoucherPayload(env))`;
4. exigir sucesso da venda;
5. validar logs/correlação para confirmar que a ausência de campanha não originou `422.065`;
6. inativar a campanha no `finally`/`afterEach`.

### 6.7 `FEP-010`: propagação do fallback

Executar somente com `ENABLE_MUTATING_E2E=true`, `ENABLE_FEPAS_E2E=true` e documento FEPAS autorizado. Após inativar uma campanha que já havia sido carregada:

- a descoberta deve anunciar versão nova quando o preço efetivo mudar;
- a carga deve trazer o preço-base nos três campos monetários da tag `404`;
- a repetição sem nova mudança não deve anunciar outra versão.

## 7. Guia de execução automatizada

### 7.1 Pré-requisitos

- Node.js 20 ou superior.
- Docker e Docker Compose para o ambiente local.
- JDK 25 e Maven quando o `ms-voucher` for compilado/iniciado localmente.
- Projeto `ms-voucher` disponível no caminho indicado por `MS_VOUCHER_PROJECT_DIR`.
- Massa exclusiva de cliente, endereço, CNPJ e produto.
- Tokens/segredos somente em arquivos locais ignorados pelo Git, com permissão restrita.

### 7.2 Validação estática

```bash
npm ci
npm run lint
npx playwright test --list tests/prices/prices.spec.ts
```

Critério: os novos IDs aparecem uma única vez, sem `test.only` e sem erro TypeScript.

### 7.3 Execução local recomendada

```bash
cp .env.local.example .env.local
npm run infra:up:app
npm run doctor:env
npm run test:prices
npm run test:pricing-fix
npm run report
npm run infra:down
```

Para os fluxos mutantes/E2E locais:

```bash
ALLOW_MUTATION=true \
ENABLE_MUTATING_E2E=true \
PW_PROCESS_ENV_OVERRIDES=true \
npx playwright test --grep "PRICE-020|PRICE-021"
```

Para a fixture defensiva local:

```bash
ALLOW_MUTATION=true \
PW_PROCESS_ENV_OVERRIDES=true \
npx playwright test --grep @local-fixture
```

### 7.4 Regressão Java

No projeto `ms-voucher`:

```bash
mvn -q -Dtest=GetPricesTest,PricesControllerTest test
mvn -q -Dtest=EffectivePriceStateServiceTest,SeFepasServicePricingTest,SeFepasUtilsTest test
mvn -q test
mvn -q -DskipTests compile
```

Critério: nenhum teste pode voltar a esperar `PRICING_RULE_WITHOUT_VALID_RESULT`/`422.065` para o simples estado “sem campanha aplicável”.

### 7.5 Execução em HML

Começar pelo modo seguro:

```bash
cp .env.local-hml.example .env.local-hml
cp .env.ms-voucher-hml.example .env.ms-voucher-hml.local
chmod 600 .env.local-hml .env.ms-voucher-hml.local
npm run doctor:local-hml
npm run e2e:local-hml
```

Ou, contra a API HML já implantada:

```bash
npm run test:hml -- --grep "PRICE-001|PRICE-016"
```

Não liberar mutações em HML sem massa reservada e janela aprovada. Quando autorizado, o projeto exige simultaneamente:

```dotenv
ALLOW_MUTATION=true
MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS
```

`ENABLE_MUTATING_E2E=true` continua obrigatório para geração de vale/FEPAS.

## 8. Roteiro manual com `curl`

### 8.1 Preparação

Definir os valores sem gravar tokens no histórico do shell:

```bash
export VOUCHER_BASE_URL="https://api-sandbox.ultragaz.com.br/residential/voucher/v1"
export CUSTOMER_ID="4756"
export CUSTOMER_SITE_ID="5953124"
export PRODUCT_CODE="0110035"
```

Se o gateway exigir autenticação, usar um token temporário pelo mecanismo seguro do ambiente e não anexá-lo às evidências.

### 8.2 Caso manual M-001 — consulta sem campanha aplicável

```bash
curl --silent --show-error \
  --header "customerId: ${CUSTOMER_ID}" \
  --header "customerSiteId: ${CUSTOMER_SITE_ID}" \
  --header "Accept-Language: pt-br" \
  "${VOUCHER_BASE_URL}/prices?code-product=${PRODUCT_CODE}"
```

Validar:

- status `200`;
- resposta é uma lista não vazia;
- produto `0110035` presente;
- `netPriceProduct` ou `priceProduct` positivo;
- corpo não contém `422.065`;
- valor corresponde ao baseline aprovado para a massa.

### 8.3 Caso manual M-002 — campanha com critério divergente

1. Registrar o baseline de M-001.
2. Pela API oficial do backoffice, importar uma campanha ativa com `codigoRegra` exclusivo e CNPJ/produto reservados que não correspondam ao cliente consultado.
3. Repetir M-001.
4. Confirmar `HTTP 200` e igualdade monetária com o baseline.
5. Inativar a campanha pela mesma API, enviando nova fotografia com `statusRegra=I`.

Não manipular diretamente tabelas de HML para esse caso.

### 8.4 Caso manual M-003 — retorno ao baseline após inativação

1. Registrar o baseline.
2. Importar campanha válida de baixo impacto para a massa reservada.
3. Confirmar que o preço promocional foi aplicado.
4. Inativar a regra pela API oficial.
5. Confirmar que o preço retornou exatamente ao baseline.
6. Confirmar ausência de `422.065` em todas as respostas.

### 8.5 Caso manual M-004 — geração de vale

1. Garantir que apenas uma campanha não correspondente esteja ativa para a massa.
2. Consultar o preço e registrar o `correlationId`.
3. Gerar um vale pelo fluxo do Gestão VG/backoffice autorizado.
4. Confirmar sucesso da geração.
5. Pesquisar logs do `ms-voucher` pelo `correlationId`.
6. Confirmar ausência de `422.065` e presença do preço efetivo esperado.
7. Inativar a campanha de teste e liberar a massa.

### 8.6 Caso manual M-005 — FEPAS controlado

1. Executar somente com simulador/captura FEPAS e janela autorizada.
2. Carregar uma versão promocional.
3. Inativar a campanha.
4. Solicitar nova descoberta/carga.
5. Confirmar que os três campos monetários da tag `404` contêm o preço-base em centavos.
6. Repetir a descoberta sem mudança e confirmar que não há nova versão.

## 9. Evidências obrigatórias

Para cada caso executado, registrar:

| Evidência | Conteúdo mínimo |
|---|---|
| Identificação | ID do caso, ambiente, data/hora e versão/commit implantado |
| Requisição | Endpoint, headers não sensíveis e parâmetros |
| Resposta | Status, corpo mascarado e tempo de resposta |
| Massa | Cliente/endereço/produto; mascarar CNPJ quando necessário |
| Campanha | `codigoRegra`, status, vigência e critério divergente |
| Comparação | Baseline, preço promocional e preço após fallback |
| Observabilidade | `correlationId` e evento de fallback/log agregado |
| Limpeza | Confirmação de inativação e restauração do setup |
| FEPAS | Versão, tag `404` e campos monetários, quando aplicável |

Não considerar um caso aprovado apenas por retornar `HTTP 200`. O preço, a continuidade do produto e as pós-condições do fluxo consumidor também precisam estar corretos.

## 10. Critérios de aceite

- `GET /prices` responde `HTTP 200` quando existe oferta vigente e nenhuma campanha é aplicável.
- O produto permanece no retorno.
- `netPriceProduct` prevalece sobre `priceProduct` no fallback.
- `422.065` não é emitido somente porque nenhuma campanha se aplicou.
- Campanha com qualquer filtro divergente não altera a oferta.
- Todas as candidatas inválidas resultam em fallback, com observabilidade, e não em indisponibilidade.
- Uma candidata inválida não impede outra candidata válida de vencer.
- Campanha válida continua usando cálculo e precedência anteriores.
- Inativação/fim da campanha restaura o baseline.
- Catálogo multiproduto não perde itens por fallback de apenas um produto.
- Geração de vale continua sem campanha aplicável.
- FEPAS recebe o preço efetivo correto quando o cenário for executado.
- Importação e setup continuam rejeitando estados inválidos.
- Testes Java, Playwright focado e validação TypeScript passam.
- Toda campanha criada pela rodada é inativada ao final.

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Campanha preexistente competir com a massa | Usar cliente/CNPJ/produto reservados e conferir baseline antes da execução |
| Falso positivo por comparar somente status | Comparar valor monetário, produto e continuidade do fluxo |
| Falso negativo por arredondamento JavaScript | Reutilizar `isSameMonetaryValue` e helpers decimais existentes |
| Estado defensivo impossível pela API | Cobrir obrigatoriamente em Java e opcionalmente por fixture local |
| Alteração acidental de HML | Manter guardas, `workers: 1`, confirmação explícita e limpeza em `finally` |
| Geração de vale/notificação produzir efeitos reais | Executar localmente ou apenas em janela aprovada com massa exclusiva |
| Fallback ocultar dados ruins | Validar log `warn`, códigos de regra e métrica operacional sem dados sensíveis |
| Teste temporal flutuar | Preferir `Clock` controlado em Java e inativação explícita no E2E |
| Reintrodução da expectativa antiga | Remover `422.065` da matriz BDD anterior para este estado funcional |

## 12. Conclusão

A cobertura deve separar duas responsabilidades: campanhas inválidas continuam sendo rejeitadas ou descartadas; a oferta-base, porém, continua disponível. A suíte Java já prova os ramos internos mais difíceis. A suíte Playwright deve complementar essa proteção pelos contratos observáveis: `GET /prices`, retorno ao baseline, geração do vale e, em execução controlada, propagação FEPAS.

O aceite em HML deve priorizar `PRICE-016`, `PRICE-017` e `PRICE-020` com massa exclusiva. `PRICE-018` e `PRICE-019` não devem ser forçados por SQL em ambiente compartilhado; a cobertura Java existente e uma fixture local opcional são a abordagem segura e determinística.

## 13. Fontes

### Fontes corporativas

- [Notion — Generate BDD and e2e Playwright test scenarions for the campaing not match criterias](https://app.notion.com/p/3b1b3def3e7c80d3a538d6dfccec6c57)
- [Notion — Fix the price rule to get the default price when a campaing do not match with the criterias](https://app.notion.com/p/3b1b3def3e7c801684b7eed16af4b530)
- [Notion — Novo fluxo de precificação — Campanhas](https://app.notion.com/p/37cb3def3e7c8062b73df9c57fb6a4e9)
- [Notion — Generate BDD and E2E Playwright test scenario for Price Rules](https://app.notion.com/p/3adb3def3e7c800fa5daf0445786e710)
- [Google Drive — `ms-voucher`](https://drive.google.com/drive/folders/184PaSJreDCSOG2iSDO6jlEMTSW_AjnHu)
- [Google Drive — `ms-voucher-playwright-e2e`](https://drive.google.com/drive/folders/1n35kKh7M45AYrqNNRI0n4M5sKlZm2Gra)
- [Teams — conversa com Fábio](https://teams.cloud.microsoft/l/chat/19:124ef588-86b0-48b5-8a69-b29707084de1_4d35ac12-f224-476b-aac8-ef3cf2b78aee@unq.gbl.spaces/conversations?context=%7B%22contextType%22%3A%22chat%22%7D)
- [Teams — conversa do grupo com Marcelo e Fábio](https://teams.cloud.microsoft/l/chat/19:567ac97996fb4ef584ceaef0e2025f68@thread.v2/conversations?context=%7B%22contextType%22%3A%22chat%22%7D)
- Anexo `relatorio_desenvolvimento_fallback_preco_base_ms-voucher_2026-08-03(1).md`
- Anexo `relatorio_tecnico_correcao_fallback_preco_base_ms-voucher_2026-08-03.md`
- Anexo `Playright-Github-Repository.txt` — [FernandoAvanzo/PlaywrightSwitchCase](https://github.com/FernandoAvanzo/PlaywrightSwitchCase)

### Fontes técnicas externas

- [Playwright — API testing](https://playwright.dev/docs/api-testing)
- [Playwright — annotations e tags](https://playwright.dev/docs/test-annotations)
- [Cucumber — referência Gherkin](https://cucumber.io/docs/gherkin/reference)
- [RFC 9110 — semântica do método GET](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.1)
- [RFC 9110 — 422 Unprocessable Content](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.21)
- [Java SE 25 — `Optional`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Optional.html)
- [Java SE 25 — `Stream.min`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Stream.html#min(java.util.Comparator))

## Glossário

| Termo | Significado | Explicação |
|---|---|---|
| API | Interface de Programação de Aplicações | Contrato HTTP usado pelos sistemas para trocar requisições e respostas. |
| BDD | Desenvolvimento Orientado por Comportamento | Descreve regras por exemplos em linguagem de negócio, normalmente Dado/Quando/Então. |
| E2E | Ponta a ponta | Valida um fluxo atravessando a API e dependências relevantes. |
| FEPAS | Fluxo/protocolo corporativo de distribuição de preços | Transporta ao terminal a tabela de preços efetivos do `ms-voucher`. |
| PDV | Ponto de Venda | Terminal que utiliza o preço distribuído na operação do vale. |
| Fallback | Comportamento alternativo seguro | Preserva a oferta-base quando nenhuma campanha pode ser aplicada. |
| Fixture | Massa controlada de teste | Estado preparado para tornar um cenário determinístico. |
| HML | Homologação | Ambiente compartilhado usado para validação antes de produção. |
| `Optional.empty()` | Ausência explícita de valor no Java | Representa “sem campanha aplicável”, sem significar “sem preço”. |
| `correlationId` | Identificador de correlação | Permite relacionar requisição, resposta e logs do mesmo fluxo. |
