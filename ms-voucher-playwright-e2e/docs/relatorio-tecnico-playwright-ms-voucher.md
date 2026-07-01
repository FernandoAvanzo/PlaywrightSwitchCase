# Relatório técnico - Projeto Playwright E2E para `ms-voucher`

Data: 01/07/2026  
Idioma: português do Brasil  
Projeto gerado: `ms-voucher-playwright-e2e`

## 1. Objetivo

Este projeto foi criado para automatizar uma suíte de testes BDD/E2E do `ms-voucher`, cobrindo os principais riscos funcionais descritos no relatório de referência:

- configuração do canal de notificação (`SMS`, `WHATSAPP`, `AMBOS`);
- integração com `ms-notification` e regra de fallback WhatsApp -> SMS;
- importação de regras de precificação Gestão VG;
- aplicação de regras na consulta de preços por CNPJ;
- mensagens funcionais PT-BR sem placeholders literais;
- fluxos E2E críticos com preço, venda e notificação.

## 2. Fontes técnicas consideradas

Foram considerados:

- relatório técnico BDD/E2E anexado;
- README do `ms-voucher`;
- AGENTS.md do repositório;
- controllers extraídos do projeto no Drive:
  - `VoucherBackofficeController`;
  - `GestaoVgPricingRuleController`;
  - `PricesController`;
  - `NotificationClientService`.

## 3. Decisões de arquitetura da suíte

### 3.1 Playwright como runner API

A suíte usa Playwright Test em TypeScript porque o foco é validar contratos HTTP, estados de ambiente e integrações externas observáveis. Mesmo sem navegação em UI, Playwright fornece:

- `APIRequestContext` para chamadas HTTP diretas;
- fixtures e isolamento por teste;
- projetos e configuração por ambiente;
- relatórios HTML, JSON e JUnit;
- traces em falha.

### 3.2 Separação por domínio

Os testes foram organizados por assunto:

```text
tests/setup
tests/pricing
tests/prices
tests/notification
tests/messages
tests/e2e
```

Essa divisão facilita rodar apenas a área afetada por uma mudança, por exemplo:

```bash
npm run test:setup
npm run test:pricing
npm run test:notification
```

### 3.3 Seleção de ambiente

A seleção de ambiente é feita por `TEST_ENV`:

```bash
npm run test:local
npm run test:hml
npm run test:prod
```

Cada ambiente possui arquivo próprio:

```text
.env.local
.env.hml
.env.prod
```

A configuração é carregada em `src/config/env.ts` e validada com `zod`.

### 3.4 Proteção contra mutações indevidas

A suíte diferencia testes de leitura/smoke e testes mutantes. Testes que alteram setup, preço, venda, cancelamento ou mensagens exigem:

```text
ALLOW_MUTATION=true
```

Os fluxos E2E mais destrutivos ainda exigem:

```text
ENABLE_MUTATING_E2E=true
```

Em PROD, o script padrão executa apenas testes `@smoke`.

## 4. Infraestrutura local

O ambiente local foi modelado em `docker/docker-compose.local.yml`.

### 4.1 Serviços

| Serviço | Finalidade |
|---|---|
| `mysql` | Banco transacional principal do `ms-voucher`; migrations Flyway devem criar as tabelas. |
| `redis` | Cache e limites diários/mensais de venda. |
| `localstack` | Mock local de AWS SQS e S3. |
| `ms-notification-wiremock` | Stub HTTP do `ms-notification`, com endpoints `/notification/v1/sms` e `/notification/v1/whatsapp`. |
| `soa-wiremock` | Stub genérico para integrações SOA/EBS/SOAP. |
| `oracle` | Oracle local opcional, ativável por profile, para fluxos que ainda exigem datasource Oracle. |
| `ms-voucher` | Serviço alvo; builda a partir de `MS_VOUCHER_PROJECT_DIR`. |

### 4.2 Execução local

```bash
cp .env.local.example .env.local
npm run infra:up
npm run doctor:env
npm run test:local
```

Para subir também o app pelo Compose:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local.yml --profile app up -d --build
```

Para ativar Oracle local:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local.yml --profile oracle up -d
```

## 5. Variáveis de ambiente da aplicação local

O arquivo `docker/env/ms-voucher.local.env` centraliza as variáveis conhecidas e necessárias para execução local:

- servidor e contexto (`SERVER_PORT`, `SERVER_SERVLET_CONTEXT_PATH`);
- datasource MySQL;
- Flyway;
- Redis;
- AWS/LocalStack;
- SQS/S3;
- `ms-notification`;
- SOA/EBS/SOAP;
- Oracle opcional;
- jobs e consumers assíncronos desabilitados por padrão.

Como o projeto original pode usar nomes próprios em `ApplicationConfig`, foram incluídos também nomes semânticos e nomes compatíveis com relaxed binding do Spring Boot. Quando o `application.yml` real estiver disponível, recomenda-se conferir cada propriedade e remover aliases redundantes.

## 6. Testes implementados

### 6.1 Setup

Arquivo: `tests/setup/setup.spec.ts`

Cobertura:

- GET do setup público;
- atualização para `SMS`;
- atualização para `WHATSAPP`;
- atualização para `AMBOS`;
- compatibilidade com `isSendSms=true`;
- rejeição de canais inválidos;
- validação de ausência de campos técnicos removidos.

### 6.2 Gestão VG pricing rules

Arquivo: `tests/pricing/import-pricing-rules.spec.ts`

Cobertura:

- importação válida;
- idempotência;
- atualização por `codigoRegra`;
- duplicidade no lote;
- lote vazio;
- enums e formatos inválidos;
- datas inconsistentes;
- inferência de `tipoValor`;
- ambiguidade entre `novoValor` e percentual.

### 6.3 Consulta de preços

Arquivo: `tests/prices/prices.spec.ts`

Cobertura:

- smoke de contrato de `GET /prices`;
- aplicação de `novoValor`;
- regra percentual de desconto;
- regra percentual de acréscimo;
- regra inativa sem quebra de contrato.

### 6.4 Notificação

Arquivo: `tests/notification/notification-fallback.spec.ts`

Cobertura:

- venda com setup `SMS`;
- venda com setup `WHATSAPP`;
- `AMBOS` sem duplicidade quando WhatsApp tem sucesso;
- `AMBOS` com fallback SMS quando WhatsApp falha;
- cancelamento com WhatsApp.

A validação usa WireMock Admin API para contar chamadas recebidas em `/notification/v1/sms` e `/notification/v1/whatsapp`.

### 6.5 Mensagens funcionais

Arquivo: `tests/messages/functional-messages.spec.ts`

Foram criados scaffolds automatizáveis para:

- venda por barcode com quantidade maior que 1;
- FEPAS sem id efetivo.

Esses testes dependem da confirmação do path interno e de massa funcional real.

### 6.6 E2E integrado

Arquivo: `tests/e2e/critical-flows.spec.ts`

Cobertura:

- E2E-001: setup `AMBOS`, regra de preço absoluta, consulta de preço e venda com fallback SMS;
- E2E-003: regressão SMS legado sem chamada WhatsApp.

## 7. Riscos e limitações

| Risco | Tratamento no projeto |
|---|---|
| Massa real de venda não conhecida | Builders parametrizados por `.env` e fixtures exemplo. |
| Nome exato de propriedades no `application.yml` pode divergir | `ms-voucher.local.env` usa aliases Spring e semânticos; revisar contra config real. |
| Oracle pode ser pesado para ambiente local | Oracle fica em profile opcional. |
| Eventos assíncronos podem atrasar verificações | Tests de notificação contam chamadas no WireMock e podem receber ajuste de timeout. |
| PROD não deve receber mutações | `npm run test:prod` executa apenas `@smoke`; guards bloqueiam mutação. |
| Alguns cenários exigem massa específica | Matriz documenta casos dependentes em `docs/matriz-bdd-e2e.md`. |

## 8. Como evoluir

1. Confirmar payload real de venda/cancelamento/reenvio contra Swagger e DTOs.
2. Preencher `.env.local` com massa real de distribuidor, produto e telefone.
3. Ajustar `payloadBuilders.ts` para refletir exatamente os contratos internos.
4. Adicionar seeds SQL descartáveis se a massa por API for insuficiente.
5. Habilitar `ENABLE_MUTATING_E2E=true` apenas em ambiente controlado.
6. Complementar casos pendentes da matriz.

## 9. Conclusão

A entrega fornece uma base operacional para testar o `ms-voucher` em três modos:

- local com infraestrutura mockada;
- HML parametrizado;
- PROD em modo smoke/read-only.

A suíte prioriza os riscos mais críticos: contrato público do setup, fallback de notificação, idempotência de importação Gestão VG e aplicação de regra de preço. Os cenários que dependem de massa específica foram mantidos como scaffolds rastreáveis, com guards para evitar execuções perigosas.
