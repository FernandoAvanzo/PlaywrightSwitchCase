# Relatório técnico — automação do fallback para o preço-base

**Projeto:** `ms-voucher-playwright-e2e`  
**Projeto alvo:** `ms-voucher`  
**Data:** 03/08/2026  
**Idioma:** português do Brasil

## 1. Objetivo

Esta entrega amplia a cobertura Playwright da regra de negócio segundo a qual uma campanha é um benefício opcional sobre uma oferta vigente. Quando nenhuma campanha pode ser aplicada, o consumidor deve continuar recebendo `HTTP 200` e o preço efetivo deve ser `netPriceProduct`, quando disponível, ou `priceProduct`.

A implementação foi orientada pelo [guia técnico anexado](./guia_tecnico_testes_bdd_e2e_fallback_preco_base_ms-voucher_2026-08-03.md) e pela página da tarefa no [Notion](https://app.notion.com/p/3b1b3def3e7c80d3a538d6dfccec6c57). A página confirma como critérios de aceite a continuidade de `GET /prices`, a preservação do preço líquido, o descarte de campanhas inelegíveis, o retorno ao baseline após inativação e a continuidade dos fluxos consumidores.

## 2. Estrutura do projeto

```text
ms-voucher-playwright-e2e/
├── src/
│   ├── api/       clientes HTTP do ms-voucher
│   ├── config/    leitura e validação dos ambientes
│   ├── data/      builders de regras e payloads
│   └── utils/     guards, asserções, decimais e FEPAS
├── tests/
│   ├── prices/    contrato e comportamento de GET /prices
│   ├── pricing/   importação e validação de campanhas
│   ├── setup/     limites globais de desconto
│   └── e2e/       fluxos integrados e propagação FEPAS
├── docker/        dependências e WireMocks da execução local
├── scripts/       diagnóstico, seed e launchers locais
└── docs/          guias, matriz BDD e relatórios técnicos
```

O `playwright.config.ts` mantém execução serial (`workers: 1`) porque os cenários mutantes compartilham o estado de campanhas. Os ambientes continuam isolados por projeto Playwright, com mutações bloqueadas por padrão e rastreamento por relatório HTML, JUnit e JSON.

## 3. Implementações realizadas

### 3.1 Novos cenários de preços

Em [`tests/prices/prices.spec.ts`](../tests/prices/prices.spec.ts) foram adicionados:

- `PRICE-016`: consulta segura da oferta vigente, verificando status `200`, preço positivo, produto disponível e ausência de `422.065`/metadados internos;
- `PRICE-017`: importa uma regra ativa com CNPJ divergente e comprova que o valor monetário permanece igual ao baseline;
- `PRICE-020`: aplica uma campanha válida, inativa a regra pela API oficial e comprova a restauração exata do preço-base;
- `PRICE-022`: valida uma segunda oferta de catálogo quando `PRODUCT_CODE_SECOND` estiver configurado.

No fluxo integrado [`tests/e2e/critical-flows.spec.ts`](../tests/e2e/critical-flows.spec.ts), `PRICE-021` consulta a oferta e confirma que a geração de vale é aceita sem campanha aplicável. Como é um fluxo mutante, permanece protegido por massa, WireMock e autorização explícita.

Cada teste possui Javadoc em português-BR imediatamente acima da declaração, descrevendo a regra de negócio em linguagem orientada ao negócio. Os testes reutilizam `MsVoucherClient`, `expectJsonResponse`, `isSameMonetaryValue`, `applyAbsoluteDiscount`, builders de campanha e os guards existentes.

### 3.2 Massa opcional multiproduto

Foi adicionada a variável `PRODUCT_CODE_SECOND` ao schema de ambiente e aos arquivos `.env.*.example`. O caso `PRICE-022` é ignorado quando a massa não está configurada; isso evita inventar produto ou alterar catálogo compartilhado.

### 3.3 Estratégia de segurança

Os casos mutantes continuam protegidos por `blockProdMutation` e `skipWhenMutationNotAllowed`. Todas as campanhas criadas são registradas em `importedRules` e inativadas no `afterEach` pela API oficial. Não foi introduzida manipulação direta de banco nem abertura implícita de mutações em HML.

Os estados defensivos de “todas as candidatas inválidas” continuam pertencendo à camada Java/fixture local, pois a API oficial rejeita alguns payloads inválidos antes de eles alcançarem o algoritmo de seleção. O Playwright cobre os contratos observáveis e não força esse estado por SQL em ambiente compartilhado.

## 4. Rastreabilidade BDD

| Regra | Caso automatizado | Evidência |
|---|---|---|
| Sem campanha aplicável mantém a oferta | `PRICE-016` | `GET /prices` com `200` e preço positivo |
| Filtro divergente não altera a oferta | `PRICE-017` | igualdade monetária com baseline |
| Inativação encerra o benefício | `PRICE-020` | preço promocional seguido de restauração |
| Fallback não remove produto do catálogo | `PRICE-022` | massa opcional `PRODUCT_CODE_SECOND` |
| Geração de vale continua disponível | `PRICE-021` | venda E2E mutante autorizada |
| FEPAS deve receber preço-base após fim | `FEP-008` existente | `tests/e2e/pricing-to-fepas.spec.ts` |

Os cenários `PRICE-018` e `PRICE-019` permanecem explicitamente dependentes de fixture local pré-semeada, conforme o guia, e não foram simulados com uma mutação insegura em HML.

## 5. Validação

| Verificação | Resultado |
|---|---|
| `npm run lint` | Aprovado; TypeScript sem erros |
| `mvn -q -DskipTests compile` em `ms-voucher` | Aprovado |
| Execução focada Playwright | Bloqueada pela infraestrutura: `ECONNREFUSED ::1:8001` |
| `PRICE-022` sem massa secundária | Ignorado por guard, conforme esperado |

Para a validação HTTP completa, iniciar o alvo e as dependências locais e executar:

```bash
npm run infra:up:app
npm run test:prices -- --grep 'PRICE-016|PRICE-017|PRICE-020|PRICE-022'
npm run test:fepas -- --grep 'FEP-008'
```

Em HML, preencher massa exclusiva e manter as confirmações de mutação exigidas pelo README. O cenário `PRICE-022` só deve ser habilitado quando o segundo produto estiver previamente aprovado para a rodada.

## 6. Conclusão

A suíte agora traduz a correção de fallback em contratos HTTP observáveis, preserva os padrões de isolamento e limpeza do projeto e mantém separadas as responsabilidades entre testes Java, API Playwright e E2E/FEPAS. A compilação do projeto alvo foi confirmada; a execução funcional contra a aplicação depende apenas da inicialização do serviço local, que não estava ativo durante esta rodada.
