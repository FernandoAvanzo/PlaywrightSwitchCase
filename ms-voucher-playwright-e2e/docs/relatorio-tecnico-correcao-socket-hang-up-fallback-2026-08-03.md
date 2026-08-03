# Relatório técnico — correção do `socket hang up` na regressão de fallback

**Projeto:** `ms-voucher-playwright-e2e`  
**Serviço alvo:** `ms-voucher`  
**Data:** 03/08/2026  
**Idioma:** português do Brasil

## 1. Resumo do problema

Após iniciar a infraestrutura local, os testes falharam com `apiRequestContext.get: socket hang up` ao acessar `GET http://localhost:8001/voucher/v1/prices`. A falha ocorreu no transporte HTTP, antes das asserções de negócio, portanto não representa falha da regra de fallback.

## 2. Diagnóstico

O serviço `ms-voucher` é declarado no `docker-compose.local.yml` dentro do profile `app`:

```yaml
ms-voucher:
  profiles: ["app"]
```

O script original de desligamento executava `docker compose down` sem `--profile app`. O Compose removeu MySQL, Redis, LocalStack e WireMocks, mas deixou o container `ms-voucher` em execução.

O log da aplicação confirmou a causa:

```text
HikariPool - Failed to validate connection
Pool is empty, failed to create/setup connection
Caused by: java.net.UnknownHostException: mysql: Name does not resolve
```

O processo Java continuou vivo e o healthcheck HTTP continuou respondendo, mas o serviço perdeu o DNS e as conexões com MySQL. Ao processar `/prices`, o socket era encerrado e o Playwright reportava `socket hang up`.

O aviso `Network ms-voucher-playwright-local_default: Resource is still in use` confirmou que o container do profile `app` continuava conectado à rede depois do `infra:down`.

## 3. Correções realizadas

### 3.1 Ciclo de vida Docker Compose

Os scripts de infraestrutura agora incluem explicitamente os profiles:

- `infra:down` usa `--profile app --profile oracle`, removendo também o serviço alvo e o Oracle opcional;
- `infra:ps` lista o serviço `ms-voucher`;
- `infra:config` renderiza a configuração do profile `app`;
- `infra:logs` e `infra:logs:app` reconhecem o profile `app`.

O desligamento correto passa a ser:

```bash
npm run infra:down
```

### 3.2 Seleção dos testes

O `describe` de preços deixou de conter `PRICE-001..PRICE-022`. A seleção fica baseada nos IDs dos títulos individuais, sem depender de um intervalo textual da suíte.

Use a forma abaixo para evitar ambiguidades do shell:

```bash
npx playwright test tests/prices --grep='PRICE-016|PRICE-017|PRICE-020|PRICE-022'
npx playwright test tests/e2e/pricing-to-fepas.spec.ts --grep='FEP-008'
```

### 3.3 Prontidão da aplicação

O `infra:up:app` também passou a usar `--wait --wait-timeout 180`. O comando agora aguarda o healthcheck do Compose, em vez de retornar apenas quando o container é criado. Isso evita iniciar o Playwright enquanto o Spring Boot ainda está inicializando o Tomcat, o pool Hikari e os beans de integração.

## 4. Recuperação e execução recomendadas

Para limpar o container residual da execução anterior:

```bash
npm run infra:down
npm run infra:up:app
npm run doctor:env
curl --fail --silent http://localhost:8001/voucher/v1/actuator/health
npx playwright test tests/prices --grep='PRICE-016|PRICE-017|PRICE-020|PRICE-022'
npx playwright test tests/e2e/pricing-to-fepas.spec.ts --grep='FEP-008'
npm run infra:down
```

Os testes mutantes e FEPAS continuam sujeitos aos guards e às variáveis de autorização existentes; a correção não libera mutações automaticamente.

## 5. Validação

| Verificação | Resultado |
|---|---|
| Causa nos logs | MySQL removido enquanto `ms-voucher` permanecia ativo |
| Correção | Profiles `app`/`oracle` adicionados aos scripts Compose |
| Projeto Playwright | IDs individuais disponíveis para `--grep` |
| Regra de fallback | Não foi alterada nesta correção de infraestrutura |

## 6. Conclusão

O `socket hang up` foi causado por um ciclo de desligamento incompleto dos containers. A aplicação ficou viva sem sua dependência MySQL, degradando o pool Hikari até falhar durante `GET /prices`. A inclusão explícita dos profiles corrige o estado residual e torna as execuções seguintes determinísticas.
