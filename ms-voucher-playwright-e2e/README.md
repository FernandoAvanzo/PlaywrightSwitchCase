# ms-voucher-playwright-e2e

Projeto Playwright para validar a API `ms-voucher` com testes BDD/E2E automatizados, ambiente local via Docker Compose e seleção simples de ambiente (`local`, `hml`, `prod`).

## Entrega

- Testes Playwright API com TypeScript.
- Docker Compose local com `ms-voucher`, MySQL, Redis, LocalStack, WireMock e Oracle local opcional.
- Perfis de ambiente para execução local, HML e PROD.
- Stubs WireMock para `ms-notification` e SOA/EBS.
- Relatório técnico em `docs/relatorio-tecnico-playwright-ms-voucher.md`.
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
npm run infra:up:app  # dependências + ms-voucher, se o projeto estiver clonado
npm run test:local
npm run infra:down
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
