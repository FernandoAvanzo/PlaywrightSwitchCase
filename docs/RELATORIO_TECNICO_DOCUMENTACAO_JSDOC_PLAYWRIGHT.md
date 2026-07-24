# Relatório técnico — análise do monorepo e documentação JSDoc Playwright

**Data da análise:** 24/07/2026

**Projeto lógico:** `PlaywrightTestCase`

**Diretório analisado:** `PlaywrightSwitchCase`

**Idioma:** português do Brasil

## 1. Objetivo

Este relatório consolida a análise técnica da raiz e dos subprojetos:

- `ms-notification-playwright-e2e`;
- `ms-payment-playwright-e2e`;
- `ms-voucher-playwright-e2e`;
- documentação central em `docs`;
- documentação, configuração, código de apoio e testes mantidos em cada módulo.

Os objetivos foram:

1. explicar o que o projeto raiz faz;
2. descrever a organização do monorepo e o grau de autonomia dos subprojetos;
3. inventariar arquitetura, cobertura, ambientes, infraestrutura e documentação;
4. verificar a documentação JSDoc das declarações de teste;
5. registrar validações, riscos, inconsistências e oportunidades de evolução;
6. fornecer a base técnica para o novo `README.md` da raiz.

Não foram alterados testes, payloads, mocks, configurações de ambiente ou código executável. As
mudanças desta atividade são exclusivamente documentais.

## 2. Resumo executivo

O repositório é um monorepo de suítes Playwright para testes de API. Ele concentra três projetos
Node.js/TypeScript independentes em uma raiz Git e os declara como subprojetos do projeto Gradle
`PlaywrightTestCase`.

Os testes atuais não usam navegador. O Playwright atua como:

- executor de specs;
- cliente HTTP por meio de `APIRequestContext`;
- mecanismo de fixtures, hooks, steps, tags e polling;
- gerador de relatórios e artefatos de diagnóstico.

O inventário e a coleta do Playwright confirmaram:

| Métrica | Notification | Payment | Voucher | Total |
|---|---:|---:|---:|---:|
| Arquivos `.spec.ts` | 13 | 7 | 10 | 30 |
| Declarações executáveis `test(...)` | 63 | 9 | 46 | 118 |
| Casos coletados pelo Playwright | 68 | 9 | 48 | 125 |
| Arquivos TypeScript em `src` | 8 | 6 | 9 | 23 |
| Linhas nos arquivos de teste | 2.024 | 232 | 1.814 | 4.070 |
| Documentos Markdown em `docs` do módulo | 6 | 5 | 9 | 20 |
| Linhas nesses documentos | 1.732 | 723 | 3.128 | 5.583 |
| Declarações com JSDoc associado | 63 | 9 | 46 | 118 |

Os 118 testes declarados possuem JSDoc em português-BR diretamente associado. A diferença para
os 125 casos coletados é causada por matrizes parametrizadas.

Principais conclusões:

- a separação por microserviço está clara e reduz acoplamento entre as suítes;
- os três módulos compartilham bons padrões de teste de API, mas não formam um npm workspace;
- o Gradle funciona hoje como catálogo estrutural, não como orquestrador dos comandos npm;
- o ambiente local é rico e reproduzível, desde que cada stack seja executada isoladamente;
- a documentação interna é extensa, porém fragmentada em relatórios históricos e sem índice
  único por módulo;
- há diferenças de versionamento e lockfiles que afetam a reprodutibilidade;
- o módulo de payment apresenta divergência entre a matriz documental de 18 cenários e os nove
  casos atualmente coletados;
- não foi encontrada uma automação de CI ou um comando raiz para validar os três módulos.

## 3. Escopo e metodologia

### 3.1 Fontes inspecionadas

Foram analisados:

- `README.md` e `settings.gradle.kts` da raiz;
- `package.json`, `package-lock.json`, `tsconfig.json` e `playwright.config.ts`;
- clientes HTTP, fixtures, factories, builders, schemas, guards e helpers em `src`;
- scripts operacionais e de diagnóstico;
- 30 arquivos `.spec.ts`;
- três arquivos Docker Compose e seus recursos locais;
- 20 documentos Markdown nos diretórios `docs` dos subprojetos;
- o relatório que já existia em `docs` na raiz;
- os três READMEs de módulo.

Arquivos locais com tokens, credenciais ou configuração real não tiveram seu conteúdo reproduzido
neste relatório. A análise de ambientes se limitou aos schemas, nomes de variáveis, exemplos
versionados, regras de carregamento e caminhos necessários para compreender a arquitetura.

### 3.2 Verificações executadas

Foram usados:

- inventário de arquivos e diretórios;
- busca de símbolos, endpoints, tags e declarações de teste;
- leitura de configuração TypeScript, Playwright, npm, Gradle e Docker Compose;
- `docker compose config --format json`, sem iniciar containers;
- `npx tsc --noEmit` ou o script equivalente de cada módulo;
- `npx playwright test --list`;
- `./gradlew projects`;
- verificação textual da associação entre JSDoc e `test(...)`;
- verificação de links Markdown locais.

Os testes integrados não foram executados contra as aplicações porque exigem containers, massa,
filas e, em alguns cenários, autorização explícita para mutações. Para uma alteração documental,
compilação, coleta, renderização do Compose e inspeção estática oferecem validação proporcional.

## 4. O que é o `PlaywrightTestCase`

`PlaywrightTestCase` é a identidade lógica definida por:

```kotlin
rootProject.name = "PlaywrightTestCase"
include("ms-notification-playwright-e2e")
include("ms-voucher-playwright-e2e")
include("ms-payment-playwright-e2e")
```

O diretório físico do checkout é `PlaywrightSwitchCase`. A diferença de nomes não impede o uso,
mas é relevante para documentação, automações e onboarding. O README da raiz passou a usar o nome
lógico e registra explicitamente a divergência.

O projeto fornece uma única visão para três domínios de teste:

```text
PlaywrightTestCase
├── suíte do ms-notification
├── suíte do ms-payment
└── suíte do ms-voucher
```

Seu valor não é criar uma suíte única. O valor está em:

- reunir iniciativas de qualidade relacionadas;
- permitir navegação e governança comuns;
- manter documentação consolidada;
- comparar padrões entre serviços;
- preservar execução, dependências e ciclos de evolução por domínio.

## 5. Modelo de monorepo implementado

### 5.1 Características presentes

O repositório atende ao conceito de monorepo porque:

- existe uma raiz Git compartilhada;
- os três projetos são versionados juntos;
- a raiz conhece os módulos por `settings.gradle.kts`;
- padrões e documentação podem ser mantidos de forma transversal;
- uma alteração pode atualizar mais de uma suíte de forma atômica.

Cada módulo, porém, continua autônomo:

- possui `package.json` próprio;
- carrega dependências dentro do próprio diretório;
- possui `playwright.config.ts` e `tsconfig.json` próprios;
- seleciona ambientes e variáveis de forma própria;
- possui infraestrutura Compose e documentação próprias;
- gera seus próprios relatórios.

Esse desenho pode ser descrito como **monorepo com pacotes independentes**.

### 5.2 O que a raiz não implementa

Não foram encontrados:

- `package.json` raiz com npm workspaces;
- `pnpm-workspace.yaml`, Nx, Turborepo ou Yarn workspaces;
- script raiz `test:all`, `lint:all` ou `install:all`;
- `build.gradle` com tarefas que chamem npm;
- configuração compartilhada de Playwright ou TypeScript;
- workflow de CI versionado na raiz.

Portanto:

```text
settings.gradle.kts -> registra e exibe os módulos
Gradle              -> não instala dependências nem executa Playwright
npm                 -> deve ser usado dentro de cada subprojeto
```

`./gradlew projects` confirmou a hierarquia:

```text
Root project 'PlaywrightTestCase'
+--- Project ':ms-notification-playwright-e2e'
+--- Project ':ms-payment-playwright-e2e'
\--- Project ':ms-voucher-playwright-e2e'
```

### 5.3 Estrutura física

```text
PlaywrightTestCase/
├── README.md
├── settings.gradle.kts
├── gradlew
├── docs/
│   └── RELATORIO_TECNICO_DOCUMENTACAO_JSDOC_PLAYWRIGHT.md
├── ms-notification-playwright-e2e/
│   ├── infra/
│   ├── scripts/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   ├── package.json
│   ├── package-lock.json
│   └── playwright.config.ts
├── ms-payment-playwright-e2e/
│   ├── docker/
│   ├── scripts/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   ├── docker-compose.yml
│   ├── package.json
│   ├── package-lock.json
│   └── playwright.config.ts
└── ms-voucher-playwright-e2e/
    ├── docker/
    ├── fixtures/
    ├── postman/
    ├── scripts/
    ├── src/
    ├── tests/
    ├── docs/
    ├── package.json
    └── playwright.config.ts
```

### 5.4 Papel do Gradle

O Gradle 9.4.0 está configurado somente na raiz. Não existem scripts de build nos módulos. Sua
função observada é permitir que IDEs e ferramentas reconheçam a hierarquia multiprojeto.

Há um ponto de reprodutibilidade: `gradlew` está versionado, mas o diretório `gradle/`, incluindo
o JAR e as propriedades do wrapper, está ignorado e não aparece em `git ls-files`. O comando
funciona no checkout atual porque os arquivos existem localmente, mas um clone limpo pode não
conseguir iniciar o wrapper.

## 6. Arquitetura comum das suítes

### 6.1 Fluxo de execução

```text
playwright.config.ts
        |
        v
spec por domínio e risco
        |
        +--> cliente HTTP do serviço alvo
        +--> builder/factory de payload
        +--> configuração de ambiente
        +--> helper de polling/assertion/segurança
        |
        v
microserviço alvo
        |
        +--> WireMock
        +--> LocalStack
        +--> banco/cache
        +--> webhook ou legado simulado
        |
        v
asserção da resposta + efeito observável
        |
        v
relatório e artefatos
```

### 6.2 Padrões compartilhados

Os três módulos adotam:

- Playwright `@playwright/test`;
- testes HTTP, sem browser;
- TypeScript `ES2022` e modo `strict`;
- `fullyParallel: false`;
- bloqueio de `test.only` no CI;
- retry somente no CI;
- headers JSON e idioma `pt-BR`;
- trace retido em falhas;
- organização de specs por domínio;
- dependências externas simuladas localmente;
- documentação de negócio próxima ao teste.

### 6.3 Diferenças técnicas

| Tema | Notification | Payment | Voucher |
|---|---|---|---|
| Sistema de módulos | ESM / `Bundler` | CommonJS / `Node` | ESM / `NodeNext` |
| Ambientes | local, HML, PROD | local, HML, PROD | local, local-HML, HML, PROD |
| Workers | 1 em local/PROD; padrão em HML | 1 local; 2 no CI | sempre 1 |
| Retry no CI | 1 | 2 | 1 |
| Relatórios | list, HTML, JUnit, JSON | list, HTML, JUnit | list, HTML, JUnit, JSON |
| Validação de env | funções próprias | Zod | Zod + confirmações de mutação |
| Cliente de teste | fixtures estendidas | `request` nativo | `request` nativo |
| Lockfile versionado | sim | sim | não |

As diferenças não são necessariamente defeitos. Elas refletem maturidade, histórico e necessidades
distintas. Entretanto, devem ser conscientes para evitar comportamento inesperado em CI.

## 7. Análise de `ms-notification-playwright-e2e`

### 7.1 Finalidade

O módulo valida `ms-notification` nos ambientes `local`, `hml` e `prod`, com foco em comunicação,
contingência, filas e observabilidade.

A suíte cobre:

- health check;
- envio e contrato de SMS;
- WhatsApp pelo BLiP;
- WhatsApp pelo Salesforce;
- Voucher adhoc com fallback SMS;
- webhook Routeasy;
- notificações persistidas;
- OAuth, cache e renovação de token;
- retry e hospital em SQS;
- idempotência, logs e sanitização.

### 7.2 Organização

```text
src/
├── clients/
│   ├── mock-infra-client.ts
│   ├── ms-notification-client.ts
│   └── sqs-test-client.ts
├── config/environment.ts
├── data/payloads.ts
├── fixtures/api.ts
└── utils/
    ├── response.ts
    └── salesforce-test.ts
```

O cliente principal encapsula:

- `GET actuator/health`;
- `POST sms`;
- `POST whatsapp`;
- `POST vouchers/adhoc`;
- `POST routeasy-webhook`;
- criação individual e em coleção de notificações;
- consulta e atualização de status.

O fixture central injeta clientes para:

- instância BLiP;
- instância Salesforce;
- API administrativa do WireMock;
- filas SQS.

Essa é a suíte com a camada de fixtures mais elaborada do monorepo.

### 7.3 Infraestrutura local

O Compose define:

| Serviço | Papel |
|---|---|
| MySQL 8.4 | persistência da aplicação |
| LocalStack | filas SQS |
| gerador TLS | certificado e truststore sintéticos |
| WireMock 3.9.2 | provedores, OAuth, Apex e encurtador |
| `ms-notification` | aplicação com BLiP |
| `ms-notification-salesforce` | aplicação com Salesforce |
| Playwright opcional | execução dentro de container |

O WireMock publica HTTP e HTTPS. O HTTPS local permite exercitar OAuth e endpoints Salesforce com
um contrato mais próximo do real, sem usar certificado ou segredo de ambiente compartilhado.

### 7.4 Configuração Playwright

Principais decisões:

- timeout carregado do ambiente;
- timeout de assertion de 10 segundos;
- um worker em local e PROD;
- uma retentativa no CI;
- relatórios separados por ambiente;
- projeto com nome `<ambiente>-api`;
- `Accept-Language: pt-BR`;
- trace retido em falha.

Os scripts aplicam:

- local: `@smoke`, `@contract`, `@local` e `@e2e`;
- HML: exclui `@local-only`;
- PROD: somente `@smoke` e `@contract`.

### 7.5 Cobertura

Foram coletados 68 casos em 13 specs. Os domínios `00` a `09` separam saúde, canais, integrações e
resiliência; `tests/e2e` concentra jornadas completas.

A diferença entre 63 declarações e 68 casos ocorre em três matrizes:

- três formatos de telefone gerados por uma declaração;
- HTTP 400 e 403 gerados por uma declaração;
- HTTP 429, 500 e 503 gerados por uma declaração.

As evidências mais fortes da suíte são:

- journal do WireMock;
- conteúdo e ausência de mensagens SQS;
- contagem de OAuth e chamadas de provedor;
- payload enviado a BLiP/Salesforce/SMS;
- ausência de fallback em falha transitória;
- polling de efeitos assíncronos.

## 8. Análise de `ms-payment-playwright-e2e`

### 8.1 Finalidade

O módulo valida a API do `ms-payment` em `local`, `hml` e `prod`.

A cobertura executável atual inclui:

- health;
- validação do contrato público;
- crédito com split;
- crédito sem split;
- regressão de PIX;
- retry de charge;
- sanitização da resposta.

### 8.2 Organização

```text
src/
├── clients/
│   ├── ms-payment.client.ts
│   └── wiremock.client.ts
├── config/environment.ts
├── fixtures/payment.factory.ts
├── helpers/json.ts
└── types/payment.ts
```

O cliente principal encapsula:

- `GET actuator/health`;
- `POST payments`;
- `PUT split-receivers`;
- `GET payments/{id}`;
- `POST payments/{id}/capture`;
- polling até um status aceito.

A factory produz payloads completos de crédito, crédito com split, PIX e recebedor. Identificadores
únicos reduzem colisão de massa e o webhook é enviado no formato esperado pela aplicação.

### 8.3 Infraestrutura local

| Serviço | Papel |
|---|---|
| MySQL 8.4 | persistência |
| LocalStack 3.8 | SQS e SSM |
| WireMock 3.13.1 | provedor Malga |
| webhook mock | destino HTTP controlado |
| `ms-payment` | aplicação, no perfil `app` |

O WireMock permite inspecionar `customer`, `card` e `charge`, além de criar cenários com transição
de estado. Isso sustenta o teste de retry sem duplicação de customer ou card.

### 8.4 Configuração Playwright

- timeout de teste de 60 segundos;
- timeout de assertion de 15 segundos;
- um worker local e dois no CI;
- duas retentativas no CI;
- relatórios list, HTML e JUnit;
- trace e screenshot somente em falha.

Filtros:

- local: todos, exceto `@external`;
- HML: somente `@hml`;
- PROD: somente `@prod-safe`;
- scripts separados para smoke, contract, E2E, resilience e security.

### 8.5 Cobertura e rastreabilidade

O Playwright coleta nove casos em sete specs.

A matriz `docs/matriz-bdd-e2e.md` lista 18 identificadores `PAY-001` a `PAY-018`, mas:

- apenas nove casos são coletados;
- os títulos dos testes não contêm IDs `PAY-*`;
- vários itens da matriz representam roadmap ou cobertura ainda não materializada;
- somente o health possui a tag `@hml`, embora a matriz marque outros cenários como local/HML.

Assim, `npm run test:hml` seleciona hoje somente o cenário de saúde. A matriz deve ser interpretada
como catálogo funcional, não como fotografia exata de automação concluída.

Esse é o principal ponto de rastreabilidade encontrado no módulo.

## 9. Análise de `ms-voucher-playwright-e2e`

### 9.1 Finalidade

É a suíte com maior diversidade de domínio e proteção operacional. Ela suporta:

- `local`;
- `local-hml`;
- `hml`;
- `prod`.

Valida:

- saúde;
- setup de voucher;
- seleção de SMS, WhatsApp ou ambos;
- importação de regras Gestão VG;
- aplicação de preço absoluto e percentual;
- mensagens funcionais;
- venda, cancelamento e fallback;
- operações assíncronas em lote;
- regras `422.007`, `422.062` e `422.064`;
- localização, webhook, concorrência e contrato público.

### 9.2 Organização

```text
src/
├── api/
│   ├── msVoucherClient.ts
│   ├── voucherBatchOperations.ts
│   └── wiremockClient.ts
├── config/env.ts
├── data/
│   ├── payloadBuilders.ts
│   └── pricingRules.ts
└── utils/
    ├── assertions.ts
    ├── guards.ts
    └── voucherBatch.ts
```

O cliente principal encapsula:

- health;
- leitura e atualização de setup;
- importação de regras Gestão VG;
- consulta de preços;
- venda, mudança de status e confirmação;
- criação e consulta de operação de bloqueio em lote.

`voucherBatchOperations.ts` valida o DTO público com Zod. `voucherBatch.ts` implementa polling,
estados terminais e invariantes. `wiremockClient.ts` cria respostas SOAP específicas, HTTP errors
e SOAP Faults, além de consultar o journal do legado.

### 9.3 Infraestrutura local

| Serviço | Papel |
|---|---|
| MySQL 8.4 | persistência principal |
| Redis 7.4 | cache |
| LocalStack | SQS e S3 |
| WireMock notification | SMS, WhatsApp e webhook |
| WireMock SOA | legado SOA/EBS |
| Oracle 23 | dependência opcional |
| `ms-voucher` | aplicação, no perfil `app` |

Migrations locais complementares restauram ou adaptam o schema esperado para os cenários.

### 9.4 Configuração e segurança

O Playwright cria quatro projetos e filtra apenas o ambiente selecionado. A suíte usa sempre um
worker para evitar colisões em:

- setup;
- regras de preço;
- massa de Vale;
- banco e mocks compartilhados.

Proteções:

- PROD nunca permite mutação;
- HML e local-HML exigem `ALLOW_MUTATION=true`;
- HML e local-HML exigem confirmação textual;
- E2E mutante exige também `ENABLE_MUTATING_E2E=true`;
- massa ausente ignora somente o caso dependente;
- contrato futuro de setup pode ser desabilitado por `SETUP_CONTRACT=legacy`;
- launcher local-HML bloqueia workers e efeitos colaterais por padrão;
- segredos do launcher não são colocados na linha de comando.

### 9.5 Cobertura

Foram coletados 48 casos em dez specs:

- 18 casos de batch, incluindo seis fronteiras determinísticas de `422.064`;
- dois fluxos E2E críticos;
- um health;
- dois cenários de mensagens;
- cinco cenários de notificação;
- cinco cenários de preço;
- nove cenários de importação;
- seis casos de setup.

Existem 46 declarações `test(...)`; o loop de setup gera SMS, WhatsApp e ambos a partir de uma
única declaração, adicionando dois casos à coleta.

O `test.skip(condição, motivo)` usado em hook como guarda de ambiente não foi contado como um teste
independente.

## 10. Análise da documentação

### 10.1 Inventário

Foram encontrados 20 documentos nos módulos e um documento na raiz, totalizando 21 arquivos sob
diretórios `docs`. Também foram analisados os quatro READMEs.

#### Notification — seis documentos

| Documento | Finalidade |
|---|---|
| `AMBIENTES.md` | comandos e limites de local, HML e PROD |
| `MATRIZ_CENARIOS.md` | rastreabilidade entre IDs, specs e ambientes |
| `RELATORIO_TECNICO.md` | arquitetura inicial da suíte |
| `RELATORIO_TECNICO_BLIP_WHATSAPP_E2E.md` | cobertura BLiP e fallback |
| `RELATORIO_TECNICO_SALESFORCE_WHATSAPP_E2E.md` | implementação Salesforce, OAuth e resiliência |
| `guia-testes-e2e-bdd-ms-notification-salesforce.md` | guia funcional, BDD, execução e evidências |

O conjunto é tecnicamente rico. A matriz representa bem os IDs atuais e distingue cobertura
BLiP, Salesforce e E2E.

#### Payment — cinco documentos

| Documento | Finalidade |
|---|---|
| `inventario-configuracao.md` | dependências e variáveis locais |
| `matriz-bdd-e2e.md` | catálogo de 18 cenários PAY |
| `relatorio-tecnico-playwright-ms-payment.md` | arquitetura e cobertura |
| `relatorio-tecnico-correcao-npm-execucao-local.md` | diagnóstico de registry e execução |
| `relatorio-tecnico-correcao-playwright-ms-payment-2026-07-10.md` | correções da suíte e backend |

Os relatórios registram decisões e incidentes com boa evidência. A matriz, entretanto, não separa
claramente implementado, parcial e planejado.

#### Voucher — nove documentos

| Documento | Finalidade |
|---|---|
| `matriz-bdd-e2e.md` | cobertura automatizada e lacunas dependentes de massa |
| `relatorio-tecnico-playwright-ms-voucher.md` | arquitetura inicial |
| `relatorio-tecnico-ajustes-execucao-local.md` | diagnóstico do ambiente local |
| `relatorio-tecnico-local-hml-playwright-ms-voucher.md` | execução local com dependências HML |
| `relatorio-tecnico-playwright-lote-422-007-422-062.md` | operação em lote e polling |
| `relatorio-tecnico-vale-nao-localizado-422-064.md` | fronteira de Vale não localizado |
| guia BDD do `422.007` | cenários, massa, execução e aceite |
| guia BDD do Vale não localizado | cenários `422.064`, evidências e riscos |
| relatório em `docs/reference` | referência manual de setup, pricing e notificação |

A documentação de voucher é a mais extensa e diferencia adequadamente:

- automação concluída;
- cenários dependentes de massa;
- cenários determinísticos;
- riscos de ambiente;
- referência manual.

### 10.2 Pontos fortes

- linguagem em português-BR;
- identificação de regras e casos;
- documentação próxima ao módulo;
- explicação de ambientes e segurança;
- relatórios com contexto, causa, validação e risco residual;
- matrizes de rastreabilidade;
- guias BDD detalhados;
- referências locais válidas.

### 10.3 Fragmentação e manutenção

Foram observados:

- vários relatórios acumulativos sobre o mesmo módulo;
- nomes de arquivo com padrões diferentes de caixa, acentuação e separadores;
- ausência de `docs/README.md` como índice em cada módulo;
- READMEs que citam somente parte dos documentos disponíveis;
- mistura de documentação canônica, relatório histórico e backlog;
- matriz de payment sem status explícito por cenário;
- referências a caminhos locais absolutos em configuração de exemplo;
- documentação operacional que pode envelhecer quando portas, tags ou endpoints mudarem.

Recomendação: classificar os documentos como `guia vigente`, `matriz`, `relatório histórico` ou
`referência`, mantendo um índice curto por módulo.

## 11. Documentação JSDoc dos testes

### 11.1 Critério

Foram consideradas declarações executáveis cuja chamada começa com um título textual:

- `test('...')`;
- `test("...")`;
- ``test(`...`)``;
- variações executáveis como `test.skip` ou `test.only`, se presentes como cenário.

Não foram considerados:

- `test.describe`;
- hooks;
- `test.step`;
- `test.skip(condição, motivo)` usado apenas como guarda.

Uma declaração foi considerada documentada quando havia um bloco `/** ... */` imediatamente
associado ao teste.

### 11.2 Resultado atual

```text
ms-notification-playwright-e2e: declarações=63, com JSDoc=63, sem JSDoc=0
ms-payment-playwright-e2e:      declarações=9,  com JSDoc=9,  sem JSDoc=0
ms-voucher-playwright-e2e:      declarações=46, com JSDoc=46, sem JSDoc=0
Total:                         declarações=118, com JSDoc=118, sem JSDoc=0
```

O relatório anterior registrava a inclusão histórica de 78 blocos:

- 23 em notification;
- nove em payment;
- 46 em voucher.

Quarenta testes de notification já estavam documentados. A atividade atual verificou o estado
resultante, sem editar novamente as specs.

### 11.3 Padrão observado

O padrão predominante é:

```ts
/**
 * <resultado de negócio protegido>.
 *
 * Objetivo do teste: <risco ou comportamento validado>.
 *
 * Regras de negócio e cobertura:
 * - <regra observável>;
 * - <efeito, integração ou ausência comprovada>;
 * - <status ou contrato esperado>.
 */
test('...', async (...) => {
```

Qualidades do padrão:

- explica o valor de negócio;
- separa intenção de evidência;
- evita afirmar garantias além das asserções;
- documenta testes parametrizados uma única vez;
- não interfere em runtime;
- melhora revisão, manutenção e rastreabilidade.

## 12. Ambientes e topologia operacional

### 12.1 Matriz

| Módulo | Local | Local-HML | HML | PROD |
|---|---|---|---|---|
| Notification | sim | não | sim | smoke/contract |
| Payment | sim | não | somente `@hml` | somente `@prod-safe` |
| Voucher | sim | sim | sim, guards ativos | smoke e leitura |

### 12.2 Colisões de porta

As stacks foram desenhadas para execução isolada, não simultânea.

Conflitos padrão:

- LocalStack usa `4566` nos três módulos;
- notification e voucher usam MySQL em `3306`;
- notification fixa nomes de containers;
- outros serviços também podem conflitar com aplicações já ativas.

Isso justifica não oferecer hoje um `test:all` local simples. Uma futura orquestração raiz deverá:

- parametrizar portas;
- usar nomes de projeto Compose distintos;
- serializar stacks ou compartilhar infraestrutura;
- derrubar recursos mesmo em falha.

### 12.3 Aplicações alvo

Os Composes podem construir repositórios de backend externos ao monorepo:

- `MS_NOTIFICATION_SOURCE_DIR`;
- `MS_PAYMENT_PROJECT_DIR`;
- `MS_VOUCHER_PROJECT_DIR`.

O checkout atual possui os três backends como irmãos de `PlaywrightSwitchCase`. Notification e
payment dependem de caminhos configurados nos arquivos locais para resolver esse layout; voucher
possui caminho relativo compatível.

Arquivos de exemplo não devem conter caminhos absolutos específicos de uma estação.

## 13. Reprodutibilidade e dependências

### 13.1 Notification

- Node `>=20`;
- `.nvmrc` seleciona Node 22;
- versões npm usam faixas;
- `package-lock.json` está versionado;
- imagem Playwright local fixada em 1.54.0;
- WireMock fixado em 3.9.2.

### 13.2 Payment

- documentação exige Node 20+;
- versões npm usam faixas;
- `package-lock.json` está versionado;
- `.npmrc` fixa o registry público;
- WireMock fixado em 3.13.1;
- LocalStack fixado em 3.8.

### 13.3 Voucher

- documentação exige Node 20+;
- dependências usam `latest`;
- o `package-lock.json` existe localmente, mas é ignorado e não está versionado;
- imagens WireMock usam `latest`.

A combinação de dependências e imagens `latest` sem lockfile versionado é o maior risco de
reprodutibilidade entre os três módulos.

## 14. Achados e recomendações

| Prioridade | Achado | Impacto | Recomendação |
|---|---|---|---|
| Alta | Wrapper Gradle incompleto no Git | `gradlew` pode falhar em clone limpo | versionar JAR e propriedades do wrapper ou remover o wrapper |
| Alta | Voucher sem lockfile versionado e com dependências `latest` | instalações não determinísticas | fixar versões e versionar o lockfile |
| Alta | Payment: matriz de 18 itens, nove testes e somente health com `@hml` | rastreabilidade e seleção HML ambíguas | adicionar status à matriz, IDs aos títulos e tags coerentes |
| Média | Não há validação raiz nem CI compartilhado | regressão entre módulos depende de execução manual | criar scripts ou workflow com jobs independentes |
| Média | Portas locais colidem | stacks não executam juntas com defaults | documentar serialização ou parametrizar portas |
| Média | Caminhos absolutos em configuração local/exemplo | onboarding dependente da estação | fornecer exemplos relativos ou placeholders |
| Média | Documentação fragmentada | difícil identificar fonte vigente | criar índice por módulo e classificar relatórios históricos |
| Média | Notification versiona `.env.local` | risco de acoplar configuração à máquina | versionar `.env.local.example` e ignorar override real |
| Baixa | Nome lógico e diretório físico divergem | confusão em scripts e comunicação | padronizar quando houver janela segura |
| Baixa | Sistemas de módulos e reporters diferem | manutenção transversal mais complexa | criar baseline comum sem bloquear necessidades locais |

As recomendações não foram implementadas nesta atividade porque ultrapassam a atualização
documental solicitada.

## 15. Validações realizadas

### 15.1 TypeScript

Comandos:

```bash
# notification
npx tsc --noEmit

# payment
npm run typecheck

# voucher
npm run lint
```

Resultado: os três comandos concluíram com código zero.

### 15.2 Coleta Playwright

```text
notification: 68 testes em 13 arquivos
payment:       9 testes em 7 arquivos
voucher:      48 testes em 10 arquivos
total:        125 testes em 30 arquivos
```

Resultado: coleta concluída sem erros.

### 15.3 Gradle

`./gradlew projects --console=plain` concluiu com sucesso no checkout atual e exibiu os três
subprojetos.

### 15.4 Docker Compose

`docker compose config --format json` foi processado com sucesso para as três stacks. Isso valida
sintaxe, interpolação e topologia declarada, sem subir containers.

### 15.5 JSDoc

A verificação textual confirmou 118 de 118 declarações documentadas.

### 15.6 Links Markdown

As referências Markdown locais analisadas apontam para arquivos ou diretórios existentes. A
validação final deve ser repetida sempre que documentos forem movidos ou renomeados.

### 15.7 Aviso do npm

Os comandos npm emitiram aviso sobre uma configuração externa `min-release-age` desconhecida. O
aviso não pertence aos `package.json` analisados e não afetou compilação ou coleta.

## 16. Limites da validação

Não foram executados:

- testes contra serviços locais ativos;
- testes HML ou PROD;
- mutações de setup, pricing, venda ou lote;
- publicação ou leitura real de filas fora da coleta;
- criação de containers;
- validação de credenciais;
- comparação com contratos ou código backend além dos caminhos já representados pela suíte.

Consequentemente, este relatório confirma estrutura, compilação, coleta e coerência documental,
mas não certifica que todos os 125 casos passam em runtime.

## 17. Resultado da atualização documental

O `README.md` da raiz passou a:

- usar o nome lógico `PlaywrightTestCase`;
- explicar a finalidade do repositório;
- distinguir monorepo de npm workspace;
- apresentar os três módulos e suas coberturas;
- descrever arquitetura e organização;
- listar pré-requisitos, comandos e ambientes;
- alertar sobre segurança e colisões de infraestrutura;
- apontar para documentação detalhada;
- orientar a inclusão de novos subprojetos.

Este relatório substitui a visão exclusivamente centrada na inclusão de JSDoc por uma análise
consolidada. O histórico e os números de JSDoc foram preservados em seção própria.

## 18. Conclusão

`PlaywrightTestCase` é um monorepo funcional de testes de API com boa separação por domínio,
infraestrutura local expressiva e documentação de negócio madura. Os três módulos cobrem riscos
distintos e usam o Playwright de maneira apropriada para contratos e integrações HTTP.

O estado atual oferece:

- 125 casos coletáveis;
- 118 declarações integralmente documentadas com JSDoc;
- 20 documentos técnicos internos nos módulos;
- ambientes locais com bancos, filas e mocks;
- proteções explícitas para HML e PROD.

Os próximos ganhos mais relevantes são de governança e reprodutibilidade: completar o wrapper
Gradle ou removê-lo, estabilizar dependências do voucher, tornar a matriz de payment auditável,
criar índices documentais e introduzir validação raiz/CI sem perder a autonomia dos módulos.
