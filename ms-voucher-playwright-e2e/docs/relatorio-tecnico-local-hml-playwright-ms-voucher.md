# Relatório técnico — execução local do `ms-voucher` com dependências HML

## 1. Objetivo

Foi criado um modo de execução `local-hml` no subprojeto `ms-voucher-playwright-e2e`. Ele permite iniciar o código local do `ms-voucher`, conectar suas dependências ao ambiente HML e executar a suíte Playwright contra `http://127.0.0.1:8001/voucher/v1`.

A implementação foi projetada para reduzir três riscos específicos desse cenário: vazamento de credenciais, alterações involuntárias em um ambiente compartilhado e processos locais deixados em execução depois dos testes.

Após a primeira execução real, também foi adicionada ao `ms-voucher` uma chave de ativação para impedir que consumidores assíncronos de HML sejam iniciados pelo runner seguro. A chave preserva o comportamento anterior por padrão.

## 2. Diagnóstico da falha observada

O `ms-voucher` iniciou corretamente: Tomcat subiu na porta `8001`, o MySQL HML e o Oracle HML aceitaram conexões e o health check respondeu com sucesso. Os avisos de Lombok, Redis repository discovery, Oracle `oraclepki.jar` e APIs depreciadas não causaram a falha do Playwright.

A falha funcional foi o `405 Method Not Allowed` em:

```text
GET /voucher/v1/backoffice/vouchers/setup
```

Na branch local `release`, `VoucherBackofficeController` registra somente `PUT /backoffice/vouchers/setup`. Não existe `GET` nesse path. Além disso, o contrato atual:

- aceita `id` e `consumerDataRequiredOnBlock`;
- não possui `notificationChannel`;
- responde ao `PUT` com `200` e body vazio.

Os casos `SETUP-001..SETUP-006` haviam sido derivados de um relatório de referência para um contrato futuro, com `GET /setup` e `notificationChannel`. Portanto, trocar apenas o método HTTP não seria uma correção válida: o body esperado pelo teste também não existe nesta versão do serviço.

O teste de preço apareceu como `skipped`, não como falha. Ele exige `CUSTOMER_ID`, `CUSTOMER_SITE_ID`, `CNPJ_DISTRIBUIDOR` e `PRODUCT_CODE`; esses valores permanecem vazios para evitar consultas com massa HML não autorizada.

O erro `QueueDoesNotExistException` também não causou o `405`, mas revelou uma deficiência no primeiro mecanismo de segurança. O runner desviava o poller para uma fila inexistente, impedindo consumo de mensagens reais, porém gerando erro e retry continuamente.

## 3. Topologia resultante

```text
Playwright (TEST_ENV=local-hml)
        |
        | HTTP localhost:8001/voucher/v1
        v
ms-voucher local (código do repositório irmão)
        |
        +-- MySQL HML via TLS
        +-- Oracle HML via wallet existente no projeto
        +-- Redis HML
        +-- SOAP, OAuth, Events Hub e demais endpoints HML
```

O gateway HML implantado não é usado pela suíte `local-hml`; ele é usado apenas pelo ambiente Postman criado para testes manuais da aplicação implantada.

## 4. Alterações implementadas

### 4.1 Novo ambiente Playwright

O tipo de ambiente e o schema agora aceitam `local-hml`. O `playwright.config.ts` contém o projeto `api-local-hml`, com `BASE_URL` local e metadados que registram que as dependências são remotas e que o modo é read-only por padrão.

Foram adicionados:

- `.env.local-hml.example`: template versionável e sem credenciais;
- `.env.local-hml`: configuração local ignorada pelo Git;
- `test:local-hml`: executa somente `@smoke` contra uma aplicação já ativa;
- `test:local-hml:all-safe`: coleta toda a suíte, mantendo os guards de mutação;
- `e2e:local-hml`: inicia aplicação, aguarda health check, executa smoke e encerra a aplicação;
- `e2e:local-hml:all-safe`: mesma orquestração para toda a suíte, com mutações bloqueadas.

Foi criado `HEALTH-001`, que consulta o endpoint read-only real `GET /actuator/health` e valida `{ "status": "UP" }`. Ele substitui `SETUP-001` como smoke obrigatório.

O novo `SETUP_CONTRACT` explicita a capacidade do alvo:

- `legacy`: contrato da branch `release`; testes de `notificationChannel` são ignorados com uma justificativa clara;
- `notification-channel`: habilita os casos futuros apenas quando o serviço alvo realmente implementar o contrato correspondente.

Essa abordagem preserva os cenários de referência sem produzir falso negativo contra uma versão que não expõe a funcionalidade.

### 4.2 Launcher do `ms-voucher`

Os scripts `local-hml-runtime.ts`, `doctor-local-hml.ts`, `run-ms-voucher-local-hml.ts` e `run-local-hml-e2e.ts` implementam o ciclo de vida.

O launcher:

1. resolve o repositório irmão pelo `MS_VOUCHER_PROJECT_DIR`;
2. exige todas as propriedades fornecidas para HML e rejeita placeholders;
3. rejeita o arquivo de segredos quando permissões de grupo/outros estão abertas em Unix;
4. converte propriedades pontuadas para uma árvore JSON;
5. entrega essa árvore em `SPRING_APPLICATION_JSON` apenas ao processo Maven filho;
6. inicia `mvn -DskipTests spring-boot:run` sem credenciais nos argumentos;
7. espera um health check HTTP bem-sucedido;
8. propaga o código de saída do Playwright;
9. encerra todo o grupo de processos Maven/Java que o runner iniciou.

Se já existir uma aplicação saudável na porta `8001`, o runner a reutiliza e não a encerra ao final.

### 4.3 Controle de consumidores no `ms-voucher`

`EventConsumersStarter` agora lê `event.listeners.enabled`. O `application.yml` documenta o default `true`. Quando o valor é `false`, o evento `ApplicationReadyEvent` apenas registra que os consumidores estão desabilitados e não envia nenhum `Runnable` ao executor.

O default `true` mantém produção/HML implantado compatíveis. O runner `local-hml` injeta `false` somente no processo local seguro. Um teste unitário cobre explicitamente o estado desabilitado e o teste existente continua cobrindo o início normal.

Essa feature flag foi preferida à fila fictícia porque impede a chamada AWS na origem, elimina retries e stack traces e expressa diretamente a intenção operacional.

### 4.4 Isolamento de segredos

O arquivo real `.env.ms-voucher-hml.local` contém os valores fornecidos, tem permissão local `600` e está coberto pelo `.gitignore`. O arquivo versionável `.env.ms-voucher-hml.example` mantém somente URLs e nomes não secretos, usando placeholders nos campos sensíveis.

Essa separação foi escolhida porque argumentos `--spring...password=...` ficam visíveis em histórico do shell e em listagens de processo. A injeção no ambiente do processo filho reduz essa exposição e mantém um template revisável.

O `.gitignore` também cobre:

- `.env.local-hml`;
- `.env.ms-voucher-hml.local`;
- ambientes Postman com sufixo `.local.postman_environment.json`;
- artefatos transitórios em `.runtime/`.

### 4.5 Normalização de propriedades

Duas chaves recebidas foram ajustadas para corresponder aos nomes efetivamente consumidos pelo código atual do `ms-voucher`:

| Chave recebida | Chave usada | Justificativa |
|---|---|---|
| `notification.credential-alias` | `notification.credentials-alias` | `ApplicationConfig` usa o nome no plural. |
| `aws.voucher-store.download-expiration-hour` | `aws.voucher-store.download-expiration-hours` | `ApplicationConfig` e `application.yml` usam `hours`. |

Os valores não foram copiados para código, documentação ou templates versionáveis.

## 5. Proteções do ambiente compartilhado

### 5.1 Playwright

O smoke padrão seleciona somente testes marcados com `@smoke`. Além disso, `ALLOW_MUTATION=false` permanece no arquivo local criado.

Para HML direto ou `local-hml`, `ALLOW_MUTATION=true` isoladamente não é suficiente. O loader exige simultaneamente:

```text
MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS
```

Testes E2E mutantes ainda dependem de `ENABLE_MUTATING_E2E=true`. Produção permanece bloqueada independentemente da confirmação.

### 5.2 Inicialização Spring Boot

No modo seguro, o launcher impõe propriedades com precedência sobre o arquivo recebido:

- `spring.flyway.enabled=false`: impede migrations na base compartilhada;
- `spring.jpa.hibernate.ddl-auto=none`: impede criação/alteração de schema pelo Hibernate;
- todos os jobs funcionais ficam desabilitados, inclusive o job de geração de códigos que veio habilitado na configuração de origem;
- `event.listeners.enabled=false`: impede a inicialização do consumidor SQS antes de qualquer chamada à AWS.

A liberação de consumers/jobs existe apenas como escape hatch deliberado e exige a confirmação literal `I_UNDERSTAND_HML_BACKGROUND_SIDE_EFFECTS` em `ALLOW_HML_BACKGROUND_WORKERS`. Ela é independente da confirmação de mutações Playwright para evitar que uma única flag libere duas classes diferentes de efeitos colaterais.

## 6. Ambiente Postman

Foram criados dois arquivos:

- `postman/ms-voucher-hml.postman_environment.json`: template versionável, sem valores secretos;
- `postman/ms-voucher-hml.local.postman_environment.json`: cópia local importável, ignorada pelo Git e com permissão `600`.

As URLs da aplicação implantada foram lidas dos contratos OpenAPI do `ms-voucher`:

- API de vouchers: `https://api-ultragaz.sensedia.com/hml/residential/voucher/v1`;
- API de backoffice: `https://api-ultragaz.sensedia.com/hml/residential/voucher-backoffice/v1`.

O ambiente inclui aliases em `camelCase` e `snake_case` para URL, OAuth e token, reduzindo incompatibilidades entre coleções que usam convenções diferentes. O token de acesso permanece vazio porque deve ser temporário.

## 7. Operação

Fluxo recomendado:

```bash
cd ms-voucher-playwright-e2e
npm run doctor:local-hml
npm run e2e:local-hml
```

Para depuração com terminais separados:

```bash
npm run app:local-hml
npm run test:local-hml
```

Para a branch `release`, mantenha `SETUP_CONTRACT=legacy`. Use `notification-channel` somente depois de confirmar no controller/Swagger do alvo que existem `GET /setup` e o campo `notificationChannel`.

Pré-requisitos operacionais:

- Java 25, Maven, Node.js 20+ e dependências NPM instaladas;
- JAR interno do audit logging instalado no Maven local, conforme `AGENTS.md` do `ms-voucher`;
- conectividade/VPN e regras de firewall para MySQL, Oracle, Redis e endpoints HML;
- wallet `wallet_UltragazHML` presente no repositório local do serviço.

A URL `service-notification.default.svc.cluster.local` é um DNS interno do Kubernetes e normalmente não é resolvida fora do cluster. Isso não impede o smoke de health, mas impede fluxos locais que precisem chamar diretamente o serviço de notificação por essa URL.

## 8. Validações executadas

Foram executadas validações estáticas, unitárias e uma execução funcional read-only contra HML:

```text
npm run lint                                           OK
npm run doctor:local-hml                               OK (60 propriedades; valores ocultos)
npm run test:local-hml -- --list                       OK (HEALTH-001 + PRICE-001)
mvn -Dtest=EventConsumersStarterTest test              OK (2 testes)
npm run e2e:local-hml                                  OK (1 passou, 1 skipped)
parse e secret scan dos ambientes/arquivos revisáveis OK
```

Na execução funcional:

- MySQL HML e Oracle HML conectaram com sucesso;
- o health retornou `UP`;
- o log confirmou `Event consumers are disabled by configuration`;
- não ocorreu `QueueDoesNotExistException`;
- `HEALTH-001` passou;
- `PRICE-001` foi ignorado por ausência deliberada de massa;
- o runner encerrou a aplicação e os pools dos dois bancos de forma graciosa.

## 9. Estado de versionamento

Nenhum commit foi criado. O diff revisável abrange o subprojeto E2E e três alterações no repositório irmão `ms-voucher`: a feature flag no starter, seu default no `application.yml` e o teste unitário. Os arquivos com segredos permanecem ignorados.
