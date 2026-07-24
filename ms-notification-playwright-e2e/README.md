# ms-notification-playwright-e2e

Projeto Playwright para testes API/E2E do microserviço `ms-notification`, com suporte a três modos de execução:

- `local`: sobe MySQL, LocalStack/SQS, WireMock e duas instâncias da aplicação alvo
  via Docker Compose: Salesforce como provider principal e BLiP como rollback.
- `hml`: executa contra ambiente de homologação configurado em `.env.hml`.
- `prod`: executa apenas smoke/contract tests não destrutivos contra `.env.prod`.

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Código do `ms-notification` baixado localmente. Por padrão, o Docker Compose espera a aplicação em `../ms-notification`; ajuste `MS_NOTIFICATION_SOURCE_DIR` em `.env.local` se necessário.

## Instalação

```bash
nvm use
npm install
npx playwright install --with-deps
```

No Linux, o passo `--with-deps` pode pedir a senha do `sudo` para instalar bibliotecas do sistema.

## Execução local completa

```bash
cp .env.local .env
npm run test:local
```

O script sobe a infraestrutura local e executa testes marcados com `@smoke`, `@contract`, `@local` e `@e2e`.

No ambiente local:

- `http://localhost:18001/notification/v1` executa o provider `BLIP`;
- `http://localhost:18002/notification/v1` executa o provider `SALESFORCE`;
- `http://localhost:18089` expõe a API administrativa HTTP do WireMock;
- `https://localhost:18443` expõe os endpoints OAuth/Apex simulados.

O certificado HTTPS e o truststore são sintéticos e gerados em volume Docker. Nenhum
segredo ou certificado de ambiente real é necessário.

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
- `tests/07-salesforce-whatsapp.spec.ts`: contrato, compatibilidade, cache,
  idempotência e segurança do Salesforce.
- `tests/08-salesforce-resilience.spec.ts`: renovação OAuth e classificação entre
  retry e hospital.
- `tests/09-salesforce-voucher-adhoc.spec.ts`: Voucher adhoc via Salesforce e
  contingência SMS.
- `tests/e2e/*`: fluxos integrados ponta a ponta.

## Tags

- `@smoke`: seguro para HML/PROD.
- `@contract`: valida payload inválido e contrato sem acionar provedores externos.
- `@local-only`: depende de mocks locais.
- `@e2e`: fluxo integrado com mocks locais.

## Documentação

- `docs/guia-testes-e2e-bdd-ms-notification-salesforce.md`: guia funcional e BDD.
- `docs/MATRIZ_CENARIOS.md`: rastreabilidade dos cenários automatizados.
- `docs/RELATORIO_TECNICO_SALESFORCE_WHATSAPP_E2E.md`: arquitetura, decisões e
  evidências da implementação Salesforce.
