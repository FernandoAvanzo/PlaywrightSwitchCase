# ms-notification-playwright-e2e

Projeto Playwright para testes API/E2E do microserviço `ms-notification`, com suporte a três modos de execução:

- `local`: sobe MySQL, LocalStack/SQS, WireMock e a aplicação alvo via Docker Compose.
- `hml`: executa contra ambiente de homologação configurado em `.env.hml`.
- `prod`: executa apenas smoke/contract tests não destrutivos contra `.env.prod`.

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Código do `ms-notification` baixado localmente. Por padrão, o Docker Compose espera a aplicação em `../ms-notification`; ajuste `MS_NOTIFICATION_SOURCE_DIR` em `.env.local` se necessário.

## Instalação

```bash
npm install
npx playwright install --with-deps
```

## Execução local completa

```bash
cp .env.local .env
npm run test:local
```

O script sobe a infraestrutura local e executa testes marcados com `@smoke`, `@contract`, `@local` e `@e2e`.

## Execução HML

```bash
cp .env.hml.example .env.hml
# edite MS_NOTIFICATION_BASE_URL e credenciais quando necessário
npm run test:hml
```

## Execução PROD segura

```bash
cp .env.prod.example .env.prod
# edite MS_NOTIFICATION_BASE_URL
npm run test:prod
```

A execução PROD usa apenas cenários não destrutivos, evitando envio real de mensagens.

## Organização dos testes

- `tests/00-health.spec.ts`: health check.
- `tests/01-sms.spec.ts`: SMS.
- `tests/02-whatsapp.spec.ts`: WhatsApp.
- `tests/03-voucher-adhoc.spec.ts`: voucher adhoc e fallback.
- `tests/04-routeasy.spec.ts`: webhook Routeasy.
- `tests/05-app-notifications.spec.ts`: notificações persistidas.
- `tests/06-observability.spec.ts`: logs e dados sensíveis.
- `tests/e2e/*`: fluxos integrados ponta a ponta.

## Tags

- `@smoke`: seguro para HML/PROD.
- `@contract`: valida payload inválido e contrato sem acionar provedores externos.
- `@local-only`: depende de mocks locais.
- `@e2e`: fluxo integrado com mocks locais.
