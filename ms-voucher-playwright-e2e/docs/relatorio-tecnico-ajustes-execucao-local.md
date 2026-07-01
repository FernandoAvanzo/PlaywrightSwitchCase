# Relatorio tecnico - ajustes para execucao local do ms-voucher-playwright-e2e

Data: 01/07/2026  
Projeto: `ms-voucher-playwright-e2e`  
Escopo: diagnostico do erro de Docker Compose, correcao da infraestrutura local, ajustes da suite Playwright e validacao local.

## 1. Resumo executivo

O erro inicial ocorreu porque o Compose tentava criar um container com nome global fixo:

```text
Conflict. The container name "/ms-notification-wiremock" is already in use
```

O container existente pertencia a outro projeto local (`ms-notification-playwright-e2e`). Como `container_name` e global no Docker daemon, dois projetos diferentes nao conseguem usar o mesmo nome ao mesmo tempo.

A correcao principal foi remover os `container_name` fixos e definir um `COMPOSE_PROJECT_NAME` proprio para o projeto. Durante a validacao local, outros problemas apareceram e tambem foram corrigidos: imagem instavel do LocalStack, incompatibilidades de migrations MySQL, variaveis Spring incorretas para o `ms-voucher`, healthchecks baseados em `curl` em imagens sem `curl`, imports TypeScript em modo `NodeNext`, URLs absolutas da suite Playwright e ausencia de massa local para o endpoint `/prices`.

## 2. Diagnostico detalhado

### 2.1 Causa raiz do erro do log

O `docker/docker-compose.local.yml` usava nomes fixos como:

```yaml
container_name: ms-notification-wiremock
```

No Docker, nomes de containers sao globais. Portanto, se qualquer outro Compose ou comando manual ja criou `/ms-notification-wiremock`, uma nova subida falha antes mesmo de iniciar os demais servicos.

### 2.2 Achados adicionais ao tentar subir o projeto

Depois de remover o conflito de nome, a execucao local revelou outros bloqueios:

- `localstack/localstack:latest` puxou uma versao recente que tentou ativacao/licenca e falhou localmente.
- As migrations legadas do `ms-voucher` tinham assumcoes sensiveis a versao/collation/case do MySQL.
- A aplicacao nao lia algumas variaveis do Compose porque os nomes nao batiam com as propriedades reais usadas pelo projeto (`SPRING_DATASOURCE_PRIMARY_*`, `SPRING_REDIS_*`, `NOTIFICATION_ENDPOINT`, `TRANSACTION_INTEGRATIONS_SOAP_ENDPOINT`).
- Os healthchecks de WireMock e app usavam `curl`, mas as imagens disponiveis nao garantiam esse binario.
- O TypeScript estava em `moduleResolution: NodeNext`, que exige extensao `.js` nos imports relativos emitidos para ESM.
- As chamadas Playwright com path iniciado por `/` ignoravam o path base `/voucher/v1`, causando rotas incorretas.
- O endpoint `/prices` retornava `403` porque nao havia distribuidor/produto/preco local para `CUSTOMER_ID=100000` e `CUSTOMER_SITE_ID=200000`.
- As regras Gestão VG dos testes usavam `diaDaSemana=5` e `codPeriodo=MAN` fixos. Em 01/07/2026, a aplicacao calculava o dia atual em `America/Bahia` como `4`, entao a regra importada nao era elegivel.

## 3. Mudancas realizadas e justificativas

| Arquivo | Mudanca | Justificativa |
|---|---|---|
| `docker/docker-compose.local.yml` | Adicionado `name: ${COMPOSE_PROJECT_NAME:-ms-voucher-playwright-local}` e removidos `container_name` fixos. | Evita colisao global de nomes entre projetos Docker Compose. |
| `docker/docker-compose.local.yml` | Portas publicadas passaram a ser parametrizadas por `.env.local`. | Permite rodar o projeto mesmo quando portas padrao ja estao ocupadas. |
| `docker/docker-compose.local.yml` | LocalStack fixado em `localstack/localstack:3`. | Evita instabilidade de `latest` e falha de licenciamento observada na execucao local. |
| `docker/docker-compose.local.yml` | MySQL configurado com `mysql:8.4`, `lower-case-table-names=1`, `latin1_swedish_ci`, `max_allowed_packet` e `sql-mode` vazio. | Alinha o banco local com assumptions das migrations legadas e permite `DROP CHECK` de migrations mais novas. |
| `docker/mysql/init/01-create-schema.sql` | Database passou de `utf8mb4_unicode_ci` para `latin1_swedish_ci`. | Evita incompatibilidade de collation em chaves estrangeiras criadas pelas migrations. |
| `docker/ms-voucher-migrations/V61.1__local_widen_transaction_type_code.sql` | Aumenta `transaction_type.code` e FK relacionada para `varchar(36)`. | A migration `V62` insere tipo com codigo maior que o tamanho original `varchar(20)`. |
| `docker/ms-voucher-migrations/V71.1__local_create_expected_distributor_check.sql` | Cria constraint neutra `distributor_chk_1`. | A migration `V72` tenta remover essa constraint; em schema local limpo ela nao existia. |
| `docker/ms-voucher-migrations/V77.1__local_seed_price_e2e_data.sql` | Insere distribuidor, produto e relacionamento de preco local. | Permite que `/prices` retorne `200` e massa valida para os testes de precificacao. |
| `docker/docker-compose.local.yml` | Variaveis Spring ajustadas para datasource, Redis, notificacao, SOA e Flyway local. | Garante que o `ms-voucher` use os servicos locais do Compose. |
| `docker/docker-compose.local.yml` | Healthchecks de WireMock/app migrados para `wget`. | As imagens em uso possuem `wget`; `curl` nao era garantido. |
| `.env.local.example` | Incluidas portas, `COMPOSE_PROJECT_NAME` e `MS_VOUCHER_PROJECT_DIR=../../../ms-voucher`. | Documenta configuracao local reprodutivel e evita caminho absoluto de maquina. |
| `package.json` e scripts shell | `--remove-orphans`, `infra:ps`, `infra:config`, `infra:logs:app`. | Facilita diagnostico e limpeza de containers antigos. |
| `playwright.config.ts` | Imports com `.js` e `workers: 1`. | Compatibilidade ESM/NodeNext e execucao deterministica de testes que compartilham estado no banco. |
| `src/api/msVoucherClient.ts` | Cliente passou a montar URLs absolutas a partir de `BASE_URL`. | Preserva `/voucher/v1` nas chamadas HTTP. |
| `src/data/pricingRules.ts` | Gerador de `codigoRegra` unico e maior; janela atual Gestão VG calculada por `America/Bahia`. | Evita colisao/priorizacao indevida com regras antigas e torna as regras elegiveis no horario atual. |
| Specs Playwright | Imports relativos ajustados para `.js`; testes passaram a usar `nextPricingRuleCode()`. | Necessario para `tsc --noEmit` e estabilidade dos testes mutantes. |

## 4. Estado final da infraestrutura local

Apos `npm run infra:up:app`, os containers do projeto ficaram saudaveis:

```text
ms-voucher-playwright-local-localstack-1                 healthy
ms-voucher-playwright-local-ms-notification-wiremock-1   healthy
ms-voucher-playwright-local-ms-voucher-1                 healthy
ms-voucher-playwright-local-mysql-1                      healthy
ms-voucher-playwright-local-redis-1                      healthy
ms-voucher-playwright-local-soa-wiremock-1               healthy
```

O actuator respondeu:

```json
{"status":"UP"}
```

O Flyway aplicou as migrations locais, incluindo:

```text
77.1 local seed price e2e data
71.1 local create expected distributor check
61.1 local widen transaction type code
```

A massa minima validada no MySQL:

```text
distributor_count = 1
product_count = 1
rel_count = 1
CUSTOMER_ID = 100000
CUSTOMER_SITE_ID = 200000
CNPJ = 03282579000110
PRODUCT_CODE = 0110035
```

Chamada direta validada:

```bash
curl -H 'customerId: 100000' \
     -H 'customerSiteId: 200000' \
     'http://localhost:8001/voucher/v1/prices?code-product=0110035'
```

Resultado:

```json
[{"codeProduct":"0110035","priceProduct":120.00,"netPriceProduct":120.00}]
```

## 5. Validacoes executadas

As validacoes foram executadas apos recriar a infraestrutura com volumes limpos:

```bash
npm run infra:down
npm run infra:up:app
npm run doctor:env
npm run lint
npm run test:local
```

Resultados:

```text
npm run doctor:env  OK
npm run lint        OK
npm run test:local  20 passed, 9 skipped
```

Os 9 testes pulados estao coerentes com a configuracao local atual:

- `ENABLE_MUTATING_E2E=false` bloqueia fluxos E2E/notification/messages mais destrutivos.
- Campos opcionais como `AUTH_CODE`, `PRODUCT_CODE_BARCODE` e `FEPAS_EFFECTIVE_ID` continuam vazios por seguranca.

## 6. Como executar localmente

Considerando o layout:

```text
ultragaz/
├── ms-voucher/
└── PlaywrightSwitchCase/
    └── ms-voucher-playwright-e2e/
```

Execute:

```bash
cd PlaywrightSwitchCase/ms-voucher-playwright-e2e
cp .env.local.example .env.local
npm install
npm run infra:up:app
npm run doctor:env
npm run test:local
```

Comandos de apoio:

```bash
npm run infra:config
npm run infra:ps
npm run infra:logs
npm run infra:logs:app
npm run infra:down
```

## 7. Conclusao

O problema original era um conflito de nome global de container causado por `container_name`. A solucao adotada segue a pratica recomendada para Compose: deixar o Compose gerar nomes namespaced pelo projeto e parametrizar o projeto via `COMPOSE_PROJECT_NAME`.

Com os ajustes complementares, o projeto passou a subir localmente de forma reprodutivel, aplicar migrations em banco limpo, responder ao healthcheck, consultar preco local e executar a suite Playwright local com sucesso.
