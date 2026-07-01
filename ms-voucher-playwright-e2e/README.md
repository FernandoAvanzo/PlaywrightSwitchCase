# ms-voucher-playwright-e2e

Projeto Playwright para validar a API `ms-voucher` com testes BDD/E2E automatizados, ambiente local via Docker Compose e seleção simples de ambiente (`local`, `hml`, `prod`).

## Entrega

- Testes Playwright API com TypeScript.
- Docker Compose local com `ms-voucher`, MySQL, Redis, LocalStack, WireMock e Oracle local opcional.
- Perfis de ambiente para execução local, HML e PROD.
- Stubs WireMock para `ms-notification` e SOA/EBS.
- Relatório técnico em `docs/relatorio-tecnico-playwright-ms-voucher.md`.
- Relatório de diagnóstico e correções locais em `docs/relatorio-tecnico-ajustes-execucao-local.md`.
- Matriz BDD e rastreabilidade em `docs/matriz-bdd-e2e.md`.

## Pré-requisitos

- Node.js 20 ou superior.
- Docker e Docker Compose.
- Projeto `ms-voucher` clonado localmente quando usar `docker compose` com build local.
- Para executar o serviço alvo localmente, o `ms-voucher` também exige JDK 25, Maven e instalação do JAR interno `ultragaz-audit-logging`.

## Instalação

```bash
npm install
npx playwright install --with-deps
```

## Execução por ambiente

### Local com infraestrutura mockada

```bash
cp .env.local.example .env.local
npm run infra:up      # somente dependências mockadas
npm run infra:up:app  # dependências + ms-voucher
npm run doctor:env
npm run test:local
npm run infra:down
```

O `MS_VOUCHER_PROJECT_DIR` do `.env.local` aponta, por padrão, para `../../../ms-voucher`, considerando o layout:

```text
ultragaz/
├── ms-voucher/
└── PlaywrightSwitchCase/
    └── ms-voucher-playwright-e2e/
```

Se o `ms-voucher` estiver em outro diretório, ajuste `MS_VOUCHER_PROJECT_DIR` antes de rodar `infra:up:app`.

Comandos úteis:

```bash
npm run infra:config   # renderiza e valida o Compose
npm run infra:ps       # lista containers do projeto
npm run infra:logs     # logs das dependências
npm run infra:logs:app # logs do ms-voucher
```

### HML

```bash
cp .env.hml.example .env.hml
TEST_ENV=hml npm test
# ou
npm run test:hml
```

### PROD

```bash
cp .env.prod.example .env.prod
npm run test:prod
```

Por segurança, os testes destrutivos ou mutantes ficam bloqueados por padrão em PROD. Para HML/local, eles só rodam quando `ALLOW_MUTATION=true`.

## Estrutura principal

```text
.
├── docker/                         # Infra local mockada
│   ├── docker-compose.local.yml
│   ├── localstack/
│   ├── mysql/
│   ├── oracle/
│   └── wiremock/
├── docs/                           # Relatórios e matriz de rastreabilidade
├── fixtures/                       # Payloads e massas exemplo
├── scripts/                        # Helpers de execução
├── src/
│   ├── api/                        # Clientes HTTP da suíte
│   ├── config/                     # Carregamento de ambiente
│   ├── data/                       # Builders de payload e massa
│   └── utils/                      # Guards, assertions e helpers
└── tests/                          # Specs Playwright por domínio
```

## Variáveis críticas

As variáveis da aplicação local ficam em `docker/env/ms-voucher.local.env`.
As variáveis da suíte Playwright ficam em `.env.local`, `.env.hml` ou `.env.prod`.

Use `npm run doctor:env` para validar se variáveis essenciais foram configuradas antes de executar testes mutantes.

## Observações locais

- O Compose usa `COMPOSE_PROJECT_NAME=ms-voucher-playwright-local` e não fixa `container_name`; isso evita conflito com containers de outros projetos.
- As portas publicadas podem ser alteradas em `.env.local`: `MS_VOUCHER_PORT`, `MYSQL_PORT`, `REDIS_PORT`, `LOCALSTACK_PORT`, `NOTIFICATION_WIREMOCK_PORT`, `SOA_WIREMOCK_PORT` e `ORACLE_PORT`.
- Migrations locais de apoio ficam em `docker/ms-voucher-migrations` e são aplicadas pelo Flyway somente no perfil local do Compose.
- A suíte roda com `workers: 1` porque alguns testes importam regras de preço e compartilham estado no banco local.
