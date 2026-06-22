# Relatório Técnico — Projeto Playwright para `ms-notification`

## 1. Objetivo

Este projeto implementa uma suíte automatizada de testes API/E2E para o microserviço `ms-notification`, cobrindo os cenários de SMS, WhatsApp, voucher adhoc com fallback, webhook Routeasy, notificações persistidas e validações de observabilidade.

A suíte foi estruturada para permitir execução em três ambientes:

1. **Local** — infraestrutura totalmente mockada via Docker Compose.
2. **HML** — execução contra homologação configurada por `.env.hml`.
3. **PROD** — execução restrita a smoke/contract tests não destrutivos.

## 2. Base usada para desenho da solução

A suíte foi derivada dos cenários BDD e E2E do relatório de testes fornecido, incluindo CT-001 a CT-030 e E2E-001 a E2E-005.

Também foram considerados os artefatos do projeto `ms-notification` localizados na pasta de origem:

- aplicação Java/Maven com `pom.xml` e `Dockerfile`;
- configurações `application.yml`, `application-dev.yml` e `application-hml.yml`;
- controllers de `SMS`, `WhatsApp`, `VoucherAdhoc`, `Routeasy` e notificações de aplicativo;
- request DTOs correspondentes;
- clientes externos para SMS, WhatsApp/Infobip, encurtador de URL e SQS;
- migração SQL inicial.

## 3. Estrutura gerada

```text
ms-notification-playwright-e2e/
├── infra/
│   ├── docker-compose.local.yml
│   ├── localstack/init/ready.d/init-sqs.sh
│   ├── mysql/init/01-init.sql
│   └── wiremock/
├── scripts/
│   ├── run-local.sh
│   ├── validate-env.ts
│   └── wait-health.sh
├── src/
│   ├── clients/
│   ├── config/
│   ├── data/
│   ├── fixtures/
│   └── utils/
├── tests/
│   ├── 00-health.spec.ts
│   ├── 01-sms.spec.ts
│   ├── 02-whatsapp.spec.ts
│   ├── 03-voucher-adhoc.spec.ts
│   ├── 04-routeasy.spec.ts
│   ├── 05-app-notifications.spec.ts
│   ├── 06-observability.spec.ts
│   └── e2e/
├── .env.local
├── .env.hml.example
├── .env.prod.example
├── package.json
├── playwright.config.ts
└── README.md
```

## 4. Decisões técnicas

### 4.1 Playwright como test runner API

A aplicação é um microserviço HTTP sem interface web obrigatória. Por isso, a suíte usa o fixture `request` do Playwright e não depende de browser. Essa abordagem permite:

- validar contrato HTTP;
- validar payloads;
- validar status code;
- validar resposta JSON;
- validar fluxos assíncronos por mocks e filas;
- gerar relatório HTML, JSON e JUnit.

### 4.2 Separação por ambiente

A configuração é carregada por `TEST_ENV`:

- `TEST_ENV=local` carrega `.env.local`;
- `TEST_ENV=hml` carrega `.env.hml`;
- `TEST_ENV=prod` carrega `.env.prod`.

Os scripts `npm run test:local`, `npm run test:hml` e `npm run test:prod` encapsulam essa escolha.

### 4.3 Local com Docker Compose

O ambiente local inclui:

- **MySQL 8.4** para persistência de notificações;
- **LocalStack** para simular SQS;
- **WireMock** para simular provedores SMS, WhatsApp/Infobip e encurtador;
- **ms-notification** construído a partir do código local informado por `MS_NOTIFICATION_SOURCE_DIR`;
- **Playwright runner opcional** pelo profile `test`.

Essa composição permite validar o microserviço sem dependência de provedores externos reais.

### 4.4 Mocks dinâmicos

Os testes configuram o WireMock dinamicamente usando a API Admin:

- sucesso SMS;
- falha SMS;
- sucesso WhatsApp;
- falha WhatsApp;
- sucesso/falha no encurtador.

Isso permite que cada cenário controle o comportamento externo necessário.

### 4.5 Filas SQS mockadas

O script `infra/localstack/init/ready.d/init-sqs.sh` cria as filas locais de retry e hospital:

- `ms-notification-sms-retry`;
- `ms-notification-sms-hospital`;
- `ms-notification-whatsapp-retry`;
- `ms-notification-whatsapp-hospital`;
- `ms-notification-routeasy-hospital`;
- `ms-notification-notification-retry`.

Os testes possuem cliente SQS para purgar e consultar mensagens quando a execução é local.

## 5. Cobertura implementada

### 5.1 Health

- CT-001 — valida `/actuator/health` retornando `UP`.

### 5.2 SMS

- CT-002 — envio válido.
- CT-003 — rejeição sem telefone.
- CT-004 — rejeição por telefone inválido.
- CT-005 — rejeição por mensagem curta.
- CT-006 — alias inexistente com fallback para credenciais default.
- Falha transitória com verificação de contingência.

### 5.3 WhatsApp

- CT-007 — envio por mensagem livre.
- CT-008 — envio por template.
- CT-009 — rejeição sem conteúdo/template.
- CT-010 — rejeição por telefone inválido.
- CT-011 — erro transitório para retry.
- CT-012 — erro funcional para hospital.

### 5.4 Voucher adhoc

- CT-013 — WhatsApp aceito sem fallback.
- CT-014 — WhatsApp rejeitado e SMS fallback enviado.
- CT-015 — falha em ambos os canais.
- CT-016 — canais default.
- CT-017 — template-only com fallback SMS.
- CT-018 — `voucherId` obrigatório.
- CT-019 — primaryChannel inválido.
- CT-020 — fallbackChannel inválido.

### 5.5 Routeasy

- CT-021 — evento mapeado dispara SMS.
- CT-022 — evento não mapeado não dispara SMS.
- CT-023 — falha de encurtador gera contingência.

### 5.6 Notificações persistidas

- CT-024 — criação individual.
- CT-025 — criação em lote.
- CT-026 — consulta paginada.
- CT-027 — atualização para `READ`.
- CT-028 — isolamento por `client_id`.

### 5.7 Observabilidade

- CT-029/CT-030 — validação de logs sem payload sensível integral.

## 6. Variáveis de ambiente cobertas no modo local

O arquivo `.env.local` cobre as categorias necessárias para a aplicação e os testes:

- URL base do serviço;
- caminho local do código alvo;
- porta da aplicação;
- perfil Spring;
- conexão MySQL;
- endpoint e credenciais AWS fake;
- nomes das filas SQS;
- endpoints dos provedores mockados;
- alias e credenciais sintéticas.

O `docker-compose.local.yml` também publica variantes comuns de nomes de variáveis para reduzir risco de incompatibilidade entre `application.yml`, `application-dev.yml` e `application-hml.yml`.

## 7. Como executar

### Local completo

```bash
npm install
npm run test:local
```

### Local sem subir Docker

```bash
npm run test:local:no-docker
```

### Homologação

```bash
cp .env.hml.example .env.hml
# editar MS_NOTIFICATION_BASE_URL
npm run test:hml
```

### Produção

```bash
cp .env.prod.example .env.prod
# editar MS_NOTIFICATION_BASE_URL
npm run test:prod
```

## 8. Pontos de atenção

1. O Docker Compose precisa do código do `ms-notification` disponível localmente no caminho definido por `MS_NOTIFICATION_SOURCE_DIR`.
2. Caso os nomes exatos das propriedades do `application.yml` sejam diferentes, ajustar o bloco `environment` do serviço `ms-notification`.
3. Em HML/PROD, evitar cenários que enviem mensagens reais. O script PROD restringe execução a `@smoke` e `@contract`.
4. Os testes de filas e logs são específicos do modo local.
5. Se a aplicação usar migração própria, o banco local deve iniciar vazio e permitir execução das migrações da aplicação.

## 9. Conclusão

O projeto gerado transforma os cenários BDD manuais em uma suíte Playwright automatizada, com mocks reprodutíveis e separação clara por ambiente. A solução prioriza segurança em produção, fidelidade local por Docker Compose e flexibilidade para homologação.
