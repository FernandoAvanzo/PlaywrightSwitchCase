# ms-voucher-playwright-e2e

Projeto Playwright para validar a API `ms-voucher` com testes BDD/E2E automatizados, ambiente local via Docker Compose e seleção simples de ambiente (`local`, `local-hml`, `hml`, `prod`).

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

### Aplicação local usando dependências de HML (`local-hml`)

Esse modo inicia o projeto irmão `ms-voucher` na porta `8001`, injeta a configuração HML pelo ambiente do processo filho, aguarda o health check e executa somente testes `@smoke` por padrão.

```bash
cp .env.local-hml.example .env.local-hml
cp .env.ms-voucher-hml.example .env.ms-voucher-hml.local
chmod 600 .env.local-hml .env.ms-voucher-hml.local

# Preencha os segredos recebidos por canal seguro e valide sem conectar em HML.
npm run doctor:local-hml

# Aplicação + smoke Playwright + encerramento automático da aplicação.
npm run e2e:local-hml
```

Comandos separados e auxiliares:

```bash
npm run app:local-hml            # mantém somente o ms-voucher em primeiro plano
npm run test:local-hml           # smoke contra um ms-voucher local já ativo
npm run e2e:local-hml:all-safe   # coleta toda a suíte; mutações continuam bloqueadas
```

O launcher não coloca segredos na linha de comando. Ele lê `.env.ms-voucher-hml.local`, valida as propriedades e as entrega ao Spring Boot via `SPRING_APPLICATION_JSON` somente no processo filho. O arquivo real é ignorado pelo Git e o launcher rejeita permissões de grupo/outros em sistemas Unix.

Como HML é compartilhado, o modo seguro aplica estas proteções mesmo que o arquivo recebido tenha valores diferentes:

- Flyway e geração de DDL desabilitados;
- jobs de geração/expiração/início de validade desabilitados;
- consumidores de eventos desabilitados antes de qualquer polling SQS;
- Playwright com `ALLOW_MUTATION=false` e execução padrão restrita a `@smoke`.

Mutações em `hml` ou `local-hml` só são liberadas quando `ALLOW_MUTATION=true` e `MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS` são definidos juntos. Testes E2E mutantes ainda exigem `ENABLE_MUTATING_E2E=true`. A liberação de workers HML é independente e não deve ser usada no fluxo normal.

> A URL de notificação fornecida usa DNS interno do Kubernetes (`*.svc.cluster.local`). Ela normalmente não resolve em uma estação local, mesmo com acesso aos bancos HML; por isso os testes de notificação não fazem parte do smoke seguro.

A branch `release` usa `SETUP_CONTRACT=legacy`: ela possui somente `PUT /backoffice/vouchers/setup`, sem `GET` e sem `notificationChannel`. Os testes desse contrato futuro ficam claramente ignorados. Defina `SETUP_CONTRACT=notification-channel` apenas ao executar uma versão que implemente esses endpoints/campos. O smoke obrigatório usa `/actuator/health`; o smoke de preço é ignorado até que massa HML autorizada seja preenchida.

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

### Bloqueio assíncrono em lote (`422.007`/`422.062`)

Os cenários em `tests/batch` cobrem validação do request, contrato inicial, polling por operação e itens, falta de estoque (`422.007`), coordenadas ausentes (`422.062`), Vale inexistente (`422.064`), sucesso, lote misto, localização, webhook e não exposição de campos internos.

Antes de executar, copie os campos `BATCH_*` do arquivo `.env.<ambiente>.example` para o arquivo local e use Vales exclusivos da rodada. Os Vales de sucesso e do lote misto não devem ser reutilizados por outros testes. Os cenários mutantes exigem simultaneamente:

```dotenv
ALLOW_MUTATION=true
ENABLE_MUTATING_E2E=true
```

Em `hml` e `local-hml`, também é obrigatória a confirmação já adotada pelo projeto:

```dotenv
MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS
```

Execução focada:

```bash
npm run test:batch
```

Quando uma massa específica não estiver configurada, somente o caso dependente dela será marcado como ignorado. A suíte nunca cria ou inventa Vales em HML.

Para o webhook local com o `ms-voucher` no Compose, use `BATCH_WEBHOOK_URL=http://ms-notification-wiremock:8080/voucher-batch-webhook`. Se a aplicação estiver em execução diretamente na máquina, use a porta publicada do mesmo WireMock, normalmente `http://127.0.0.1:18081/voucher-batch-webhook`.

## Postman HML

- Importe `postman/ms-voucher-hml.postman_environment.json` para obter um template versionável sem segredos.
- A cópia local pronta para importação é `postman/ms-voucher-hml.local.postman_environment.json`; ela é ignorada pelo Git e deve permanecer com permissão `600`.
- `baseUrl`, `base_url` e `voucherBaseUrl` apontam para a API pública HML.
- `voucherBackofficeBaseUrl` e `backofficeBaseUrl` apontam para a API de backoffice HML.
- `accessToken`/`access_token` devem receber um token temporário. As variáveis duplicadas em `camelCase` e `snake_case` permitem uso com coleções que adotam convenções diferentes.

As URLs de gateway foram obtidas dos `servers` dos dois contratos OpenAPI do próprio `ms-voucher`.

## Observações locais

- O Compose usa `COMPOSE_PROJECT_NAME=ms-voucher-playwright-local` e não fixa `container_name`; isso evita conflito com containers de outros projetos.
- As portas publicadas podem ser alteradas em `.env.local`: `MS_VOUCHER_PORT`, `MYSQL_PORT`, `REDIS_PORT`, `LOCALSTACK_PORT`, `NOTIFICATION_WIREMOCK_PORT`, `SOA_WIREMOCK_PORT` e `ORACLE_PORT`.
- Migrations locais de apoio ficam em `docker/ms-voucher-migrations` e são aplicadas pelo Flyway somente no perfil local do Compose.
- A suíte roda com `workers: 1` porque alguns testes importam regras de preço e compartilham estado no banco local.
