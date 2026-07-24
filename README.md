# PlaywrightTestCase

Monorepo de testes automatizados de API, BDD e E2E para os microserviços
`ms-notification`, `ms-payment` e `ms-voucher`.

As suítes usam Playwright com TypeScript como executor e cliente HTTP. Os cenários atuais não
automatizam navegador: eles exercitam contratos REST, jornadas integradas, processamento
assíncrono, filas, persistência, resiliência, segurança e chamadas a dependências simuladas.

> O nome lógico da raiz em `settings.gradle.kts` é `PlaywrightTestCase`. O diretório do checkout
> atual ainda se chama `PlaywrightSwitchCase`; essa diferença não altera a execução das suítes.

## Visão geral

| Subprojeto | Serviço validado | Cobertura principal | Casos coletados |
|---|---|---|---:|
| [`ms-notification-playwright-e2e`](ms-notification-playwright-e2e/README.md) | `ms-notification` | SMS, WhatsApp BLiP/Salesforce, Voucher adhoc, Routeasy, notificações, filas e observabilidade | 68 em 13 specs |
| [`ms-payment-playwright-e2e`](ms-payment-playwright-e2e/README.md) | `ms-payment` | crédito, PIX, split, contrato, retry, idempotência e sanitização | 9 em 7 specs |
| [`ms-voucher-playwright-e2e`](ms-voucher-playwright-e2e/README.md) | `ms-voucher` | setup, pricing, venda, notificação, mensagens funcionais e operações em lote | 48 em 10 specs |

Os números refletem `npx playwright test --list` executado em 24/07/2026. Declarações
parametrizadas explicam por que os 125 casos coletados são gerados por 118 declarações
`test(...)`.

## Como o monorepo está organizado

Este repositório adota o conceito de monorepo porque mantém, em uma única raiz Git, três projetos
relacionados, com documentação e visão arquitetural compartilhadas. Ao mesmo tempo, preserva a
autonomia de cada suíte:

- cada subprojeto possui seu próprio `package.json`, dependências, configuração TypeScript,
  configuração Playwright, variáveis de ambiente e comandos npm;
- testes, clientes HTTP, builders de massa, scripts e infraestrutura local ficam próximos do
  microserviço que validam;
- os módulos podem evoluir e ser executados separadamente;
- `settings.gradle.kts` registra os três módulos no projeto lógico `PlaywrightTestCase`, facilitando
  a navegação como projeto multiprojeto;
- a raiz não é um npm workspace e o Gradle não executa os scripts npm. Os comandos de teste devem
  ser iniciados dentro do subprojeto correspondente.

```text
PlaywrightTestCase/
├── README.md
├── settings.gradle.kts
├── docs/
│   └── RELATORIO_TECNICO_DOCUMENTACAO_JSDOC_PLAYWRIGHT.md
├── ms-notification-playwright-e2e/
│   ├── infra/
│   ├── scripts/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   ├── package.json
│   └── playwright.config.ts
├── ms-payment-playwright-e2e/
│   ├── docker/
│   ├── scripts/
│   ├── src/
│   ├── tests/
│   ├── docs/
│   ├── docker-compose.yml
│   ├── package.json
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

## Arquitetura comum das suítes

O fluxo predominante é:

```text
spec Playwright
    -> cliente HTTP do serviço alvo
    -> microserviço em local, HML ou PROD
    -> banco, fila ou dependência mockada
    -> polling/journal do WireMock/consulta de fila
    -> asserções de contrato e regra de negócio
    -> relatório HTML, JUnit e, quando configurado, JSON
```

Padrões compartilhados:

- Playwright `APIRequestContext` para testes de API;
- TypeScript em modo estrito;
- configuração centralizada por ambiente;
- payloads criados por builders ou factories;
- WireMock para observar e controlar integrações externas;
- LocalStack para serviços AWS locais;
- `expect.poll` ou helpers de polling para efeitos assíncronos;
- trace e, em parte das suítes, screenshot retidos em falhas;
- JSDoc em português-BR associado a todas as 118 declarações de teste;
- filtros, tags e guards para reduzir o risco de mutações em ambientes compartilhados.

## Subprojetos

### `ms-notification-playwright-e2e`

Valida os canais e fluxos do `ms-notification` em `local`, `hml` e `prod`. A stack local reúne
MySQL, LocalStack/SQS, WireMock HTTP/HTTPS e duas instâncias do serviço: uma com BLiP e outra com
Salesforce como provedor de WhatsApp.

Principais áreas:

- health, SMS e WhatsApp;
- Voucher adhoc e fallback SMS;
- webhook Routeasy e encurtamento;
- criação, consulta e atualização de notificações;
- retry e hospital em SQS;
- OAuth, cache, renovação de token e idempotência do Salesforce;
- observabilidade e ausência de dados sensíveis.

Consulte o [README do módulo](ms-notification-playwright-e2e/README.md) e sua
[matriz de cenários](ms-notification-playwright-e2e/docs/MATRIZ_CENARIOS.md).

### `ms-payment-playwright-e2e`

Valida a API do `ms-payment` em `local`, `hml` e `prod`. A infraestrutura local usa MySQL,
LocalStack/SQS/SSM, WireMock para representar a Malga e um mock de webhook; o serviço alvo pode
ser incluído por perfil do Docker Compose.

Principais áreas:

- contrato público de pagamento;
- fluxo de crédito `customer -> card -> charge`;
- pagamento com e sem split;
- regressão de PIX;
- retry sem duplicar customer ou card;
- sanitização de tokens e identificadores internos.

Consulte o [README do módulo](ms-payment-playwright-e2e/README.md) e sua
[matriz BDD/E2E](ms-payment-playwright-e2e/docs/matriz-bdd-e2e.md).

### `ms-voucher-playwright-e2e`

Valida a API do `ms-voucher` nos perfis `local`, `local-hml`, `hml` e `prod`. A stack local reúne
MySQL, Redis, LocalStack/SQS/S3, mocks de `ms-notification` e SOA/EBS, além de perfis opcionais para
o serviço alvo e Oracle.

Principais áreas:

- setup e seleção de canal de notificação;
- importação e aplicação de regras de preço Gestão VG;
- venda, cancelamento, SMS, WhatsApp e fallback;
- mensagens funcionais;
- bloqueio assíncrono em lote, códigos `422.007`, `422.062` e `422.064`;
- localização, webhook, concorrência e proteção do DTO público.

Consulte o [README do módulo](ms-voucher-playwright-e2e/README.md) e sua
[matriz BDD/E2E](ms-voucher-playwright-e2e/docs/matriz-bdd-e2e.md).

## Pré-requisitos

- Node.js 20 ou superior;
- npm;
- Docker com Docker Compose para os ambientes locais;
- repositório do microserviço alvo disponível quando o Compose precisar construir a aplicação;
- requisitos próprios do backend, descritos no README de cada módulo.

As dependências são instaladas por subprojeto:

```bash
cd ms-notification-playwright-e2e
npm install

cd ../ms-payment-playwright-e2e
npm install

cd ../ms-voucher-playwright-e2e
npm install
```

Os caminhos das aplicações alvo são configuráveis por:

- `MS_NOTIFICATION_SOURCE_DIR`;
- `MS_PAYMENT_PROJECT_DIR`;
- `MS_VOUCHER_PROJECT_DIR`.

Prefira arquivos `.env` locais e ignorados pelo Git para caminhos, credenciais e tokens reais.
Use os arquivos `.example` disponíveis em cada módulo como referência.

## Execução

Execute os comandos a partir do módulo desejado.

| Objetivo | Notification | Payment | Voucher |
|---|---|---|---|
| Validar ambiente | `npm run lint:env` | `npm run doctor:env` | `npm run doctor:env` |
| Subir dependências locais | `npm run compose:up` | `npm run infra:up` | `npm run infra:up` |
| Subir dependências e aplicação | incluído em `compose:up` | `npm run infra:up:app` | `npm run infra:up:app` |
| Executar local | `npm run test:local` | `npm run test:local` | `npm run test:local` |
| Executar HML | `npm run test:hml` | `npm run test:hml` | `npm run test:hml` |
| Executar PROD seguro | `npm run test:prod` | `npm run test:prod` | `npm run test:prod` |
| Abrir relatório | `npm run report` | `npm run report` | `npm run report` |
| Derrubar infraestrutura | `npm run compose:down` | `npm run infra:down` | `npm run infra:down` |

Exemplo:

```bash
cd ms-payment-playwright-e2e
cp .env.local.example .env.local
npm run infra:up
npm run doctor:env
npm run test:local
npm run infra:down
```

Não há, na raiz, um comando `test:all`. Isso é intencional no estado atual: as stacks locais
compartilham algumas portas padrão, como `4566` e `3306`, e devem ser executadas isoladamente ou
com portas reconfiguradas.

## Ambientes e segurança

| Ambiente | Finalidade | Proteção esperada |
|---|---|---|
| `local` | execução reproduzível com dependências simuladas | pode alterar apenas recursos locais descartáveis |
| `local-hml` | `ms-voucher` local com dependências de HML | somente smoke por padrão; workers e mutações bloqueados |
| `hml` | validação em homologação | dados autorizados e mutações explicitamente habilitadas |
| `prod` | verificação não destrutiva | somente cenários seguros selecionados pelo módulo |

Antes de executar HML ou PROD, revise tags, guards, massa e variáveis do módulo. No
`ms-voucher`, mutações em HML exigem confirmação textual, e PROD nunca permite mutação.

## Relatórios e artefatos

Conforme o módulo, a execução gera:

- relatório interativo HTML;
- JUnit XML para integração com CI;
- JSON para análise automatizada;
- trace e screenshot de falha;
- artefatos em `test-results`.

Esses diretórios são locais e não devem ser versionados.

## Documentação

- [Relatório técnico consolidado](docs/RELATORIO_TECNICO_DOCUMENTACAO_JSDOC_PLAYWRIGHT.md):
  análise da arquitetura, monorepo, testes, JSDoc, documentação, riscos e validações.
- [Documentação de notification](ms-notification-playwright-e2e/docs/): ambientes, matriz,
  relatórios BLiP/Salesforce e guia BDD.
- [Documentação de payment](ms-payment-playwright-e2e/docs/): inventário, matriz e relatórios
  técnicos.
- [Documentação de voucher](ms-voucher-playwright-e2e/docs/): matriz, guias BDD, execução local,
  local-HML e relatórios das regras em lote.

## Adição de um novo subprojeto

Para manter o padrão do monorepo:

1. crie um diretório autônomo com `package.json`, `playwright.config.ts` e `tsconfig.json`;
2. organize `tests`, `src`, `scripts`, `docs` e a infraestrutura local necessária;
3. centralize ambiente, clientes HTTP e builders fora das specs;
4. proteja cenários mutantes com tags e guards;
5. adicione o módulo em `settings.gradle.kts`;
6. documente instalação, ambientes, comandos, relatórios e riscos no README do módulo;
7. atualize a visão geral e o relatório técnico da raiz.
