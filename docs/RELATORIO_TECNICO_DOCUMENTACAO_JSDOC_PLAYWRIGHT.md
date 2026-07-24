# Relatório técnico — documentação JSDoc das suítes Playwright

**Data da análise:** 24/07/2026  
**Subprojetos analisados:**

- `ms-notification-playwright-e2e`
- `ms-payment-playwright-e2e`
- `ms-voucher-playwright-e2e`

## 1. Objetivo

Este trabalho analisou todas as especificações TypeScript existentes nos diretórios `tests` dos
três subprojetos. O objetivo foi identificar declarações de teste sem JSDoc diretamente associado
e documentá-las em português do Brasil, com linguagem orientada ao negócio.

Cada novo bloco informa:

- a finalidade empresarial do cenário;
- o objetivo específico do teste;
- as regras de negócio representadas;
- a cobertura efetivamente comprovada pelos mocks, chamadas, respostas e asserções.

Nenhuma regra executável, payload, mock, asserção, tag ou configuração da suíte foi alterada.

## 2. Resultado executivo

| Subprojeto | Arquivos de teste | Declarações `test(...)` | Casos coletados pelo Playwright | JSDocs existentes | JSDocs incluídos | Cobertura final |
|---|---:|---:|---:|---:|---:|---:|
| `ms-notification-playwright-e2e` | 13 | 63 | 68 | 40 | 23 | 63/63 |
| `ms-payment-playwright-e2e` | 7 | 9 | 9 | 0 | 9 | 9/9 |
| `ms-voucher-playwright-e2e` | 10 | 46 | 48 | 0 | 46 | 46/46 |
| **Total** | **30** | **118** | **125** | **40** | **78** | **118/118** |

A diferença entre declarações e casos coletados ocorre nos testes parametrizados:

- `ms-notification`: matrizes de telefones e de códigos HTTP geram mais de um caso a partir de
  uma única declaração;
- `ms-voucher`: a matriz de setup gera um caso para `SMS`, `WHATSAPP` e `AMBOS`.

O JSDoc foi associado à declaração parametrizada e descreve a regra comum a todos os valores da
matriz.

## 3. Critério de inventário

Foram consideradas declarações de teste executáveis:

- `test(...)`;
- variações executáveis como `test.skip(...)`, `test.only(...)`, `test.fail(...)` ou equivalentes,
  caso existissem como cenário.

Não foram consideradas testes independentes:

- `test.describe(...)`;
- `test.beforeEach(...)` e `test.afterEach(...)`;
- `test.step(...)`;
- a chamada condicional `test.skip(condição, motivo)` usada dentro de um hook somente como guarda
  de ambiente.

Um teste foi considerado documentado somente quando havia um bloco iniciado por `/**` ligado
diretamente à declaração. Isso evita que um comentário de `describe` seja interpretado de forma
ambígua como documentação de todos os cenários internos.

No caso `CT-001` de `ms-notification`, o comentário estava acima do `test.describe`; ele foi
reposicionado e reformulado para documentar diretamente o teste de health check.

## 4. Arquitetura comum das suítes

Os três subprojetos usam o Playwright como executor de testes de API. Não há automação de navegador
nos cenários analisados. A arquitetura recorrente pode ser resumida assim:

```text
playwright.config.ts
        |
        v
tests por domínio e tipo de risco
        |
        +--> clientes HTTP da aplicação alvo
        +--> builders/factories de payload
        +--> configuração tipada por ambiente
        +--> helpers de asserção, polling e segurança
        |
        v
microserviço alvo + WireMock/LocalStack/bancos/mocks locais
        |
        v
relatórios list, HTML, JUnit e, em alguns projetos, JSON
```

Decisões compartilhadas:

- TypeScript em modo estrito para reduzir erros de contrato na suíte;
- `baseURL` e cabeçalhos comuns configurados no Playwright;
- `trace` retido em falhas para diagnóstico;
- cenários organizados por domínio ou propósito;
- `expect.poll` para comportamentos assíncronos;
- infraestrutura externa substituída por mocks determinísticos no ambiente local;
- tags e guardas para separar smoke, contrato, E2E, segurança, resiliência e mutações.

## 5. Estrutura de `ms-notification-playwright-e2e`

### 5.1 Configuração e execução

O projeto usa Node.js 20+, módulos ES e TypeScript com `target ES2022`, resolução `Bundler`,
`strict` e `noEmit`.

O `playwright.config.ts`:

- aponta `testDir` para `tests`;
- carrega timeout, URL e ambiente por `src/config/environment.ts`;
- desabilita paralelismo total;
- usa um worker em local e produção;
- aplica uma retentativa no CI;
- configura `Accept`, `Content-Type` e `Accept-Language: pt-BR`;
- mantém trace em falhas;
- gera relatórios `list`, HTML, JUnit e JSON separados por ambiente;
- cria um projeto de API com nome derivado de `local`, `hml` ou `prod`.

Os scripts selecionam cenários por tags:

- `@smoke` para disponibilidade;
- `@contract` para fronteiras de entrada;
- `@local` e `@local-only` para integrações com mocks;
- `@e2e` para jornadas completas;
- produção fica limitada a smoke e contrato não destrutivos.

### 5.2 Camadas de apoio

```text
src/
├── clients/
│   ├── ms-notification-client.ts  # API do serviço alvo
│   ├── mock-infra-client.ts       # stubs e journal do WireMock
│   └── sqs-test-client.ts         # leitura e limpeza das filas SQS
├── config/
│   └── environment.ts             # local, hml e prod
├── data/
│   └── payloads.ts                # massas de SMS, WhatsApp, voucher e Routeasy
├── fixtures/
│   └── api.ts                     # apiClient, salesforceApiClient, mockInfra e sqs
└── utils/
    ├── response.ts                # status e JSON opcional
    └── salesforce-test.ts         # polling e asserções reutilizáveis
```

O fixture central estende o `test` do Playwright e injeta:

- cliente da instância BLiP;
- cliente da instância Salesforce;
- cliente administrativo do WireMock;
- cliente SQS.

No ambiente local, mappings, requisições capturadas e filas conhecidas são limpos para reduzir
interferência entre cenários. O cliente do Salesforce usa contexto HTTP próprio e aguarda a
expiração curta do token sintético para isolar testes de cache e renovação.

### 5.3 Organização dos testes

Os arquivos `00` a `09` separam health, SMS, WhatsApp, Voucher adhoc, Routeasy, notificações
persistidas, observabilidade, integração Salesforce, resiliência e contingência. `tests/e2e`
concentra fluxos completos.

As principais estratégias de cobertura são:

- journal do WireMock para validar quantidade, headers e corpo de chamadas;
- filas SQS para distinguir retry de hospital;
- respostas sintéticas do BLiP, Salesforce, SMS e encurtador;
- ausência explícita de chamadas para validar não duplicidade;
- polling para efeitos assíncronos.

### 5.4 JSDocs incluídos

Foram adicionados 23 blocos nos arquivos:

- `tests/00-health.spec.ts`;
- `tests/02-whatsapp.spec.ts`;
- `tests/03-voucher-adhoc.spec.ts`;
- `tests/e2e/voucher-flows.spec.ts`.

Os cenários documentados cobrem disponibilidade, contrato do WhatsApp, resolução de destino BLiP,
templates, filas de retry/hospital, prioridade WhatsApp, fallback SMS, falha total e regras de
canal do Voucher adhoc.

Os outros 40 testes já possuíam JSDoc diretamente associado e foram preservados.

## 6. Estrutura de `ms-payment-playwright-e2e`

### 6.1 Configuração e execução

O projeto usa TypeScript `ES2022` em CommonJS, resolução Node, modo `strict` e
`noUncheckedIndexedAccess`.

O `playwright.config.ts`:

- executa os testes de forma não paralela;
- usa um worker local e dois no CI;
- aplica duas retentativas no CI;
- define timeout de 60 segundos e timeout de asserção de 15 segundos;
- usa `Accept-Language: pt-BR` e JSON;
- retém trace e screenshot somente em falhas;
- gera relatórios `list`, HTML e JUnit.

Os testes podem ser executados por diretório: smoke, contrato, E2E, resiliência e segurança.
Produção seleciona apenas `@prod-safe`.

### 6.2 Camadas de apoio

```text
src/
├── clients/
│   ├── ms-payment.client.ts       # payments, split receivers, capture e consulta
│   └── wiremock.client.ts         # journal e cenários dinâmicos
├── config/
│   └── environment.ts             # schema Zod e arquivos .env
├── fixtures/
│   └── payment.factory.ts         # crédito, PIX e recebedor de split
├── helpers/
│   └── json.ts                    # leitura dos corpos capturados
└── types/
    └── payment.ts                 # contratos de entrada e resposta
```

A configuração de ambiente é validada com Zod. As factories criam IDs únicos, webhook em Base64,
dados de cliente, cartão, antifraude, cobrança e split. O cliente da aplicação usa paths relativos
para preservar o prefixo `/payment/v1` configurado na URL base.

O WireMock representa o provedor Malga e permite:

- consultar quantas chamadas foram feitas para customer, card e charge;
- inspecionar o payload enviado;
- registrar cenários com transição de estado, como falhar a primeira charge e aceitar a segunda.

A infraestrutura local inclui MySQL, LocalStack, WireMock e mock de webhook.

### 6.3 Organização e cobertura

Os nove testes validam:

- disponibilidade da API;
- obrigatoriedade do contexto de faturamento/antifraude;
- separação de contrato entre PIX e cartão;
- valor financeiro maior que zero;
- jornada `customer -> card -> charge`;
- criação e ausência de regras de split;
- roteamento direto do PIX;
- retry sem duplicar customer ou card;
- sanitização da resposta pública.

### 6.4 JSDocs incluídos

Foram adicionados nove blocos nos sete arquivos de teste:

- `tests/contract/payment-contract.spec.ts`;
- `tests/e2e/credit-split.spec.ts`;
- `tests/e2e/credit-without-split.spec.ts`;
- `tests/e2e/pix-regression.spec.ts`;
- `tests/resilience/retry.spec.ts`;
- `tests/security/sensitive-data.spec.ts`;
- `tests/smoke/health.spec.ts`.

Na documentação do teste intitulado “crédito sem billing”, foi descrito o comportamento realmente
executado: o código remove `fraud_analysis`, estrutura que contém `billing_address` e demais dados
antifraude. O título não foi alterado para evitar mudança fora do escopo.

## 7. Estrutura de `ms-voucher-playwright-e2e`

### 7.1 Configuração e segurança por ambiente

O projeto usa módulos ES, TypeScript `ES2022`, `NodeNext`, modo estrito e `noEmit`.

Há quatro perfis:

- `local`;
- `local-hml`;
- `hml`;
- `prod`.

O `playwright.config.ts` filtra dinamicamente apenas o projeto correspondente a `TEST_ENV`, usa um
worker e desabilita paralelismo total. Essa escolha evita colisões entre testes que compartilham
setup, regras de preço e massa no banco.

A configuração também:

- define headers JSON, idioma e `x-correlation-id`;
- retém trace e screenshot em falhas;
- desliga vídeo;
- gera relatórios `list`, HTML, JUnit e JSON;
- aplica uma retentativa no CI.

O carregamento do ambiente usa Zod e possui controles específicos para mutações:

- produção nunca permite mutação;
- HML e local-hml exigem `ALLOW_MUTATION=true` e confirmação textual;
- cenários E2E mutantes também exigem `ENABLE_MUTATING_E2E=true`;
- massa ausente ignora somente o teste dependente;
- o contrato de setup pode ser bloqueado quando a versão alvo ainda é legada.

### 7.2 Camadas de apoio

```text
src/
├── api/
│   ├── msVoucherClient.ts             # endpoints do ms-voucher
│   ├── voucherBatchOperations.ts      # schemas e tipos do lote
│   └── wiremockClient.ts              # notificação e SOA/EBS
├── config/
│   └── env.ts                          # ambiente e proteções de mutação
├── data/
│   ├── payloadBuilders.ts              # venda, cancelamento e lote
│   └── pricingRules.ts                 # regras absolutas e percentuais
└── utils/
    ├── assertions.ts                   # contrato JSON e sanitização
    ├── guards.ts                       # bloqueios e skips seguros
    └── voucherBatch.ts                 # polling e invariantes do lote
```

As escolhas técnicas mais relevantes são:

- schemas Zod para validar o DTO público de operações e itens;
- polling até operação e todos os itens alcançarem estado terminal;
- IDs de caso e de regra gerados de forma única;
- janela comercial da Gestão VG calculada no fuso `America/Bahia`;
- verificação recursiva para impedir campos técnicos no DTO público;
- comparação de representações localizadas ignorando somente a mensagem traduzida;
- WireMock capaz de simular resposta SOAP de sucesso, erro HTTP e SOAP Fault por código de Vale;
- restauração de mappings após cenários determinísticos do SOA.

### 7.3 Organização dos testes

Os testes são separados em:

- `batch`: contrato, processamento assíncrono, 422.007, 422.062, 422.064, i18n e webhook;
- `e2e`: jornadas críticas de pricing, venda e notificação;
- `health`: disponibilidade;
- `messages`: mensagens funcionais e placeholders;
- `notification`: SMS, WhatsApp e fallback;
- `prices` e `pricing`: aplicação e importação de regras;
- `setup`: contrato e persistência de canais.

### 7.4 JSDocs incluídos

Foram adicionados 46 blocos nos dez arquivos:

- `tests/batch/voucher-batch-business-rules.spec.ts`;
- `tests/batch/voucher-batch-contract.spec.ts`;
- `tests/batch/voucher-not-found-boundaries.spec.ts`;
- `tests/e2e/critical-flows.spec.ts`;
- `tests/health/health.spec.ts`;
- `tests/messages/functional-messages.spec.ts`;
- `tests/notification/notification-fallback.spec.ts`;
- `tests/prices/prices.spec.ts`;
- `tests/pricing/import-pricing-rules.spec.ts`;
- `tests/setup/setup.spec.ts`.

A documentação cobre limites contratuais, processamento isolado de itens, mensagens funcionais,
localização, callback, concorrência, regras de preço, compatibilidade legada e roteamento de
notificações.

## 8. Padrão de JSDoc adotado

O formato escolhido foi:

```ts
/**
 * <resultado de negócio protegido pelo cenário>.
 *
 * Objetivo do teste: <risco ou comportamento que o teste pretende validar>.
 *
 * Regras de negócio e cobertura:
 * - <regra observável 1>.
 * - <regra observável 2>.
 * - <integração, ausência, status ou contrato comprovado>.
 */
test('...', async (...) => {
```

Motivos da escolha:

1. **Leitura orientada ao negócio:** a primeira frase explica por que o cenário importa para o
   produto, não apenas qual endpoint é chamado.
2. **Objetivo explícito:** separa a intenção do teste das condições verificadas.
3. **Cobertura auditável:** os itens correspondem a asserções ou efeitos observáveis no código.
4. **Proximidade:** o comentário fica imediatamente acima da declaração que documenta.
5. **Consistência:** o mesmo vocabulário foi aplicado aos três subprojetos.
6. **Precisão:** a documentação não afirma garantias além das que o teste atual consegue provar.
7. **Sem efeito em runtime:** JSDoc é removido ou ignorado na execução e não modifica o
   comportamento da suíte.

Foram usados nomes técnicos entre crases somente quando representam parte relevante do contrato,
como `FALLBACK_SENT`, `splitRules`, `Accept-Language` ou campos obrigatórios.

## 9. Validações realizadas

### 9.1 Verificação automatizada de JSDoc

Um inventário textual percorreu todos os arquivos TypeScript em `tests`, localizou declarações
executáveis e verificou a presença de um bloco `/** ... */` imediatamente anterior.

Resultado:

```text
ms-notification-playwright-e2e: total=63 com_jsdoc=63 sem_jsdoc=0
ms-payment-playwright-e2e:      total=9  com_jsdoc=9  sem_jsdoc=0
ms-voucher-playwright-e2e:      total=46 com_jsdoc=46 sem_jsdoc=0
```

### 9.2 Compilação TypeScript

Comandos executados:

```bash
# ms-notification
npx tsc --noEmit

# ms-payment
npm run typecheck

# ms-voucher
npm run lint
```

Todos concluíram com código de saída zero.

### 9.3 Coleta do Playwright

Foi executado `npx playwright test --list` em cada subprojeto.

Resultados:

- `ms-notification`: 68 casos em 13 arquivos;
- `ms-payment`: 9 casos em 7 arquivos;
- `ms-voucher`: 48 casos em 10 arquivos.

Todos os projetos foram carregados e coletados sem erro. A única mensagem adicional foi um aviso
do npm sobre a configuração externa `min-release-age`, sem impacto na compilação ou na coleta.

Os testes integrados não foram executados contra os serviços, pois dependem de containers,
filas, bancos, mocks ativos e, em parte, autorização explícita para mutações. Como a alteração é
exclusivamente documental, a combinação de typecheck, inventário de JSDoc e coleta do Playwright
valida o risco introduzido de forma proporcional.

## 10. Conclusão

As três suítes agora possuem documentação JSDoc diretamente associada a todas as declarações de
teste. Foram incluídos 78 blocos em português do Brasil, elevando a cobertura documental para
118 de 118 declarações e abrangendo 125 casos coletados pelo Playwright.

O código executável permaneceu inalterado. A documentação passou a explicitar objetivo, regra de
negócio e cobertura observável, tornando os testes mais úteis como fonte de rastreabilidade
funcional, apoio à manutenção e evidência técnica.
