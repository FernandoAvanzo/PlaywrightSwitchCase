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

> A suíte usa apenas dependências públicas do npm. O arquivo `.npmrc` do projeto fixa `registry=https://registry.npmjs.org/` para evitar que o `package-lock.json` seja gerado ou consumido com URLs de registries internos indisponíveis.

## Execução local

```bash
npm run infra:up       # dependências mockadas
npm run infra:up:app   # dependências + aplicação alvo
npm run doctor:env     # aguarda o readiness do Spring antes dos testes
npm run test:local
npm run infra:down
```

Para `npm run infra:up:app`, o repositório da aplicação alvo precisa existir no caminho configurado por `MS_PAYMENT_PROJECT_DIR` em `.env.local`. O padrão é `../ms-payment`, considerando os repositórios lado a lado.

Se o repositório estiver em outro local:

```bash
MS_PAYMENT_PROJECT_DIR=/caminho/para/ms-payment npm run infra:up:app
```

## Troubleshooting

### `npm install` falha com `ETIMEDOUT` em registry interno

Verifique se o lockfile contém URLs de registry privado/interno:

```bash
rg "packages\\.applied|internal\\.api\\.openai|artifactory" package-lock.json
```

O lockfile deste projeto deve apontar para `https://registry.npmjs.org/`. Se algum ambiente sobrescrever o registry via variável de ambiente, confira:

```bash
npm config get registry
```

### Smoke test acessa endpoint sem `/payment/v1`

Os clientes Playwright usam paths relativos sem `/` inicial. Isso é intencional para preservar o path configurado em `MS_PAYMENT_BASE_URL`, por exemplo `http://localhost:8001/payment/v1`.

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
