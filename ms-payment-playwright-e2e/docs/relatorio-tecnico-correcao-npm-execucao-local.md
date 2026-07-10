# Relatório técnico — correção do `npm install` e execução local do `ms-payment-playwright-e2e`

**Data:** 10/07/2026  
**Subprojeto:** `ms-payment-playwright-e2e`  
**Escopo:** análise do erro `npm install`, ajustes de configuração e tentativa de execução local da suíte Playwright.

## 1. Resumo executivo

O erro informado não era causado pelo Playwright. A falha ocorria durante a instalação das dependências porque o `package-lock.json` continha URLs `resolved` apontando para um registry interno:

```text
https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/
```

Ao executar `npm install`, o npm respeitava essas URLs do lockfile e tentava baixar pacotes públicos, como `zod`, a partir desse host interno. Como o host/IP não estava acessível no ambiente local, a conexão expirava com `ETIMEDOUT`.

A instalação foi corrigida substituindo as URLs do lockfile pelo registry público `https://registry.npmjs.org/` e adicionando `.npmrc` no projeto para fixar o registry público.

Também foram encontrados e corrigidos dois problemas operacionais adicionais:

1. O README referenciava arquivos `.env.*.example`, mas eles não existiam.
2. O cliente Playwright usava paths com `/` inicial, o que fazia o `baseURL` perder o path `/payment/v1` e chamar endpoints incorretos.

## 2. Causa raiz do `ETIMEDOUT`

### Evidência

O lockfile possuía entradas como:

```json
"resolved": "https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/zod/-/zod-3.25.76.tgz"
```

Esse valor explica diretamente o erro:

```text
npm error request to .../zod-3.25.76.tgz failed, reason: connect ETIMEDOUT 10.192.71.42:443
```

Mesmo com `npm config get registry` apontando para `https://registry.npmjs.org/`, o npm continuaria usando os tarballs definidos em `package-lock.json`.

### Correção aplicada

Todas as ocorrências do host interno no `package-lock.json` foram trocadas por:

```text
https://registry.npmjs.org/
```

Foi adicionado o arquivo `.npmrc`:

```ini
registry=https://registry.npmjs.org/
strict-ssl=true
```

## 3. Ajustes realizados

### Instalação npm

- Atualizado `package-lock.json` para remover URLs do registry interno.
- Adicionado `.npmrc` local do projeto com registry público.
- Validado `npm install` com sucesso:

```text
added 27 packages, and audited 28 packages
found 0 vulnerabilities
```

### Configuração de ambiente

Foram adicionados:

- `.env.local.example`
- `.env.hml.example`
- `.env.prod.example`

Também foi criado `.env.local` local ignorado pelo Git para permitir a execução dos comandos no ambiente atual.

### Correção de URL nos testes Playwright

Antes, o cliente chamava endpoints com `/` inicial:

```ts
request.get('/actuator/health')
```

Com `baseURL=http://localhost:8001/payment/v1`, esse formato resolve para:

```text
http://localhost:8001/actuator/health
```

Ou seja, o path `/payment/v1` era descartado.

Correção aplicada:

- `playwright.config.ts` agora normaliza `baseURL` com `/` final.
- `src/clients/ms-payment.client.ts` usa paths relativos sem `/` inicial:

```ts
request.get('actuator/health')
request.post('payments')
request.get(`payments/${id}`)
request.post(`payments/${id}/capture`)
```

Após o ajuste, o smoke test passou a chamar o endpoint correto:

```text
GET http://localhost:8001/payment/v1/actuator/health
```

### Diagnóstico de ambiente

O script `doctor:env` foi ajustado para:

- suprimir logs informativos do `dotenv`;
- reportar falhas de conectividade sem stack trace desnecessário;
- avisar explicitamente quando o repositório da aplicação `ms-payment` não existe no caminho `MS_PAYMENT_PROJECT_DIR`.

## 4. Validações executadas

### `npm install`

Resultado: **sucesso**.

```text
added 27 packages, and audited 28 packages
found 0 vulnerabilities
```

### `npm run typecheck`

Resultado: **sucesso**.

```text
tsc --noEmit
```

### `npm run infra:up`

Resultado: **sucesso parcial / dependências locais iniciadas**.

Containers iniciados:

- `mysql:8.4`
- `localstack/localstack:3.8`
- `wiremock/wiremock:3.13.1`
- `mendhak/http-https-echo:35`

Health verificado:

- MySQL: healthy
- LocalStack: healthy
- WireMock: healthy
- Webhook mock: running

Endpoints mockados verificados:

- `http://localhost:8089/__admin/mappings`
- `http://localhost:8090/health`
- `http://localhost:4566/_localstack/health`

### `npm run doctor:env`

Resultado: **falha esperada por ausência da aplicação alvo**.

```text
FAIL ms-payment source dir: /home/fernandoavanzo/Projects/ultragaz/PlaywrightSwitchCase/ms-payment does not exist.
Hint: clone ms-payment there or set MS_PAYMENT_PROJECT_DIR in .env.local.
FAIL ms-payment: http://localhost:8001/payment/v1/actuator/health (ECONNREFUSED)
OK WireMock: 200 http://localhost:8089/__admin/mappings
OK Webhook mock: 200 http://localhost:8090/health
```

### `npm run infra:up:app`

Resultado: **falha esperada por ausência do repositório `ms-payment`**.

```text
unable to prepare context: path "/home/fernandoavanzo/Projects/ultragaz/PlaywrightSwitchCase/ms-payment" not found
```

### `npm run test:smoke`

Resultado: **falha esperada por ausência da API `ms-payment` em `localhost:8001`**.

O teste já chama a URL correta após o ajuste:

```text
GET http://localhost:8001/payment/v1/actuator/health
connect ECONNREFUSED ::1:8001
```

## 5. Arquivos alterados

- `.npmrc`
- `.env.local.example`
- `.env.hml.example`
- `.env.prod.example`
- `package-lock.json`
- `playwright.config.ts`
- `src/clients/ms-payment.client.ts`
- `src/config/environment.ts`
- `scripts/doctor-env.ts`
- `README.md`

Arquivo local criado e ignorado pelo Git:

- `.env.local`

## 6. Estado atual

O subprojeto agora:

- instala dependências sem tentar acessar o registry interno indisponível;
- passa em `npm run typecheck`;
- sobe as dependências locais mockadas;
- diagnostica corretamente a ausência da aplicação alvo;
- chama o path correto `/payment/v1` nos testes Playwright.

A suíte E2E completa ainda não pode passar neste workspace porque a aplicação `ms-payment` não está disponível no caminho esperado.

## 7. Próximo passo necessário para execução completa

Disponibilizar o repositório da aplicação alvo:

```bash
cd /home/fernandoavanzo/Projects/ultragaz/PlaywrightSwitchCase
git clone <repo-ms-payment> ms-payment
```

Ou configurar o caminho real em `.env.local`:

```env
MS_PAYMENT_PROJECT_DIR=/caminho/para/ms-payment
```

Depois executar:

```bash
cd ms-payment-playwright-e2e
npm run infra:up:app
npm run doctor:env
npm run test:local
```

