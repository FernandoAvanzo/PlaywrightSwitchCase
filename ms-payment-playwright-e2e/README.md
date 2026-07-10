# ms-payment-playwright-e2e

Projeto Playwright/TypeScript para validar a API `ms-payment` nos ambientes `local`, `hml` e `prod`, com foco no fluxo Malga `customer -> card -> charge`, split de pagamentos, idempotência, segurança e regressões.

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Para subir o alvo local: repositório `ms-payment` disponível no caminho definido em `MS_PAYMENT_PROJECT_DIR`

## Instalação

```bash
npm install
npx playwright install --with-deps
cp .env.local.example .env.local
```

## Execução local

```bash
npm run infra:up       # dependências mockadas
npm run infra:up:app   # dependências + aplicação alvo
npm run doctor:env
npm run test:local
npm run infra:down
```

## HML

```bash
cp .env.hml.example .env.hml
# preencher URL e credenciais
TEST_ENV=hml npm run doctor:env
npm run test:hml
```

## PROD

A suíte de produção roda apenas testes marcados `@prod-safe`. Cenários destrutivos permanecem bloqueados por padrão.

```bash
cp .env.prod.example .env.prod
npm run test:prod
```

## Estrutura

- `tests/smoke`: health e disponibilidade.
- `tests/contract`: validação do contrato público.
- `tests/e2e`: fluxos funcionais e regressões.
- `tests/resilience`: retry, idempotência e falhas parciais.
- `tests/security`: ausência de dados sensíveis.
- `src/clients`: clientes do alvo e WireMock.
- `src/fixtures`: factories de payload.
- `docker`: MySQL, LocalStack, WireMock e webhook mock.
- `docs`: relatório técnico, matriz BDD e inventário de configuração.
