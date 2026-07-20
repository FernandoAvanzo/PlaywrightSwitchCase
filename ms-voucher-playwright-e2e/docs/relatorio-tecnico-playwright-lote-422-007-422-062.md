# Relatório técnico — testes Playwright do bloqueio em lote `422.007`/`422.062`

**Data:** 20/07/2026

**Projeto de testes:** `ms-voucher-playwright-e2e`

**Serviço alvo:** `ms-voucher`

**Endpoint principal:** `POST /voucher/v1/voucher-batch-operations/block`

**Consulta assíncrona:** `GET /voucher/v1/voucher-batch-operations/{id}`

**Idioma:** Português do Brasil

## 1. Resumo executivo

Foi adicionada uma suíte Playwright específica para as regras de bloqueio assíncrono de Vales em lote. A entrega introduz 11 testes Playwright, compostos por oito cenários E2E de negócio e três testes de contrato que percorrem 14 variações de entrada inválida. A cobertura automatizada verifica a separação entre falta de estoque (`422.007`), ausência de coordenadas (`422.062`), Vale inexistente (`422.064`) e falha técnica (`500.000`), além de sucesso, lote misto, localização, webhook e não exposição de campos internos.

Os testes seguem o padrão já existente de cliente HTTP, builders, helpers, `test.step`, tags e guards. Nenhum segredo ou dado real foi incorporado ao código. Toda massa sensível é fornecida por variáveis `BATCH_*`, e qualquer execução mutante continua bloqueada em produção e exige habilitação explícita em local/HML.

O projeto Playwright passou na verificação TypeScript e coletou todos os testes sem erro. Como a execução atual não possuía aplicação local ativa nem massa dedicada autorizada, os 11 novos testes foram marcados como ignorados pelos guards, sem produzir mutações. O serviço alvo permaneceu inalterado e foi validado com 38 testes focados, 330 testes de regressão e empacotamento Maven, todos com sucesso.

## 2. Contexto e fontes

A implementação foi orientada pelas regras descritas no [guia técnico E2E/BDD da issue `422.007`](./guia-tecnico-testes-e2e-bdd-issue-422-007-ms-voucher.md) e na [task do Notion — Generate a Playwrite test scenario for issue from code:422.062](https://app.notion.com/p/3a1b3def3e7c8018986fdca0622723fa).

As duas fontes estabelecem que:

- estoque insuficiente para obter Vale substituto deve resultar em item `ERROR` com a mensagem pública de `422.007`;
- o código `422.062` permanece exclusivo do fluxo intercompany sem latitude/longitude;
- Vale inexistente continua classificado como `422.064`;
- falhas técnicas inesperadas continuam protegidas pela mensagem `500.000`;
- uma operação pode terminar `COMPLETED` mesmo contendo itens `ERROR`;
- os itens de um lote misto devem ser processados de forma independente;
- o contrato público não pode expor `messageCode`, argumentos, detalhes internos ou stack trace;
- `Accept-Language` pode alterar a representação da mensagem sem alterar a classificação ou o estado do item.

Além das fontes funcionais, a análise conferiu diretamente controller, requests, responses, mapper, serviços, mensagens internacionalizadas, Swagger e testes do `ms-voucher`. Essa conferência evitou assumir detalhes que não pertencem ao contrato real, principalmente o fato de campos nulos serem omitidos pelo Jackson, mesmo quando o Swagger os descreve como `nullable`.

## 3. Metodologia

O trabalho foi dividido em quatro frentes:

1. rastrear a regra funcional até os pontos de entrada e saída HTTP;
2. reutilizar os padrões do subprojeto Playwright, sem criar uma arquitetura paralela;
3. separar testes de contrato rejeitado de testes que efetivamente persistem e processam operações;
4. verificar o projeto de testes e o serviço alvo com comandos proporcionais ao risco.

O escopo deliberadamente não induz retorno `null` de repositório, falha de infraestrutura ou corrupção de estoque em HML. Essas condições pertencem aos testes controlados de componente do `ms-voucher`, executados na regressão Maven. A suíte Playwright trata a API como caixa-preta e usa apenas massa dedicada.

## 4. Estrutura do projeto Playwright

```text
ms-voucher-playwright-e2e/
├── docker/
│   └── wiremock/ms-notification/mappings/
│       └── voucher-batch-webhook-success.json
├── docs/
│   ├── guia-tecnico-testes-e2e-bdd-issue-422-007-ms-voucher.md
│   └── relatorio-tecnico-playwright-lote-422-007-422-062.md
├── src/
│   ├── api/
│   │   ├── msVoucherClient.ts
│   │   ├── voucherBatchOperations.ts
│   │   └── wiremockClient.ts
│   ├── config/
│   │   └── env.ts
│   ├── data/
│   │   └── payloadBuilders.ts
│   └── utils/
│       ├── assertions.ts
│       ├── guards.ts
│       └── voucherBatch.ts
├── tests/
│   └── batch/
│       ├── voucher-batch-business-rules.spec.ts
│       └── voucher-batch-contract.spec.ts
├── .env.<ambiente>.example
├── package.json
└── playwright.config.ts
```

As responsabilidades permanecem separadas:

- `src/api`: transporte HTTP e contratos de resposta;
- `src/config`: leitura, validação e normalização do ambiente;
- `src/data`: construção determinística dos requests;
- `src/utils`: polling e asserções reutilizáveis;
- `tests/batch`: especificações de contrato e regras de negócio;
- `docker/wiremock`: comportamento controlado para integrações HTTP locais.

## 5. Implementações e decisões técnicas

### 5.1 Contratos tipados e validação com Zod

O arquivo `src/api/voucherBatchOperations.ts` define:

- os status `NOT_STARTED`, `RUNNING`, `COMPLETED` e `ERROR`;
- os contratos públicos de operação e item;
- o payload de criação;
- as opções de idioma por chamada;
- o conjunto de estados terminais.

O parser usa Zod para falhar cedo quando o serviço altera tipos essenciais do contrato. Os objetos usam `passthrough()` de forma intencional: campos desconhecidos são preservados para que a asserção de segurança consiga detectar eventual exposição de `messageCode`, `messageArguments`, `messageDetail`, `localeTag`, `stackTrace`, `exception` ou `trace`.

Campos anuláveis da operação também são opcionais no parser. A decisão reflete `spring.jackson.default-property-inclusion=NON_NULL`: na ausência de coordenadas ou webhook, o serviço omite a propriedade em vez de enviar `null`. A mensagem do item continua obrigatória no JSON, inclusive como `null`, porque o DTO força `JsonInclude.ALWAYS` nesse campo.

### 5.2 Cliente HTTP do domínio

`MsVoucherClient` recebeu dois métodos:

- `createVoucherBatchBlock(...)` para o `POST` de criação;
- `getVoucherBatchOperation(...)` para o `GET` de acompanhamento.

Os caminhos são montados a partir de `BASE_URL`, o identificador da operação é codificado com `encodeURIComponent`, e o idioma pode ser:

- omitido no parâmetro para usar o idioma padrão da suíte;
- informado explicitamente, como `en-US`;
- definido como `null` para não adicionar o header em um contexto HTTP criado sem defaults.

Essa terceira opção permite provar que o `GET` sem `Accept-Language` usa o locale persistido na criação.

### 5.3 Builders e identificação das rodadas

`payloadBuilders.ts` agora possui dois builders:

- `voucherBatchContractPayload`: dados sintaticamente válidos e descartáveis para requests que devem ser rejeitados antes de criar operação;
- `configuredVoucherBatchPayload`: contexto real vindo de `env.batch`, usado nos cenários E2E.

Cada `caseId` combina prefixo, cenário, timestamp e contador local. Isso melhora a correlação de evidências e evita colisões entre testes executados sequencialmente.

### 5.4 Polling do processamento assíncrono

O helper `waitForVoucherBatchCompletion(...)` usa `expect.poll`, em vez de espera fixa. O término exige simultaneamente:

- operação em `COMPLETED` ou `ERROR`;
- ao menos um item retornado;
- todos os itens em `COMPLETED` ou `ERROR`.

Essa decisão evita dois falsos positivos comuns: interromper a espera quando a operação muda para `RUNNING`, ou considerar o lote concluído enquanto ainda existe item `NOT_STARTED`. Timeout e intervalo são configuráveis por ambiente.

### 5.5 Asserções do contrato público

O helper de domínio valida:

- HTTP e JSON;
- eco dos dados da criação;
- estado inicial `NOT_STARTED`;
- quantidade e ordem pública dos Vales;
- vínculo de cada item ao `operationId`;
- `message: null` na resposta inicial;
- ausência recursiva de campos internos em `POST`, `GET` e webhook.

As mensagens centrais são comparadas de forma exata em português para detectar troca indevida entre `422.007`, `422.062`, `422.064` e `500.000`. No sucesso, a asserção aceita os complementos opcionais de NSU e novo código, exigindo o prefixo público “Vale bloqueado com sucesso.”.

### 5.6 Segurança de ambiente e massa

As variáveis `BATCH_*` foram adicionadas aos quatro templates versionados: local, local-HML, HML e produção. Nenhum arquivo local com valores reais foi alterado.

Os testes mutantes exigem:

```dotenv
ALLOW_MUTATION=true
ENABLE_MUTATING_E2E=true
```

Em `hml` e `local-hml`, permanece obrigatória a confirmação:

```dotenv
MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS
```

Produção continua bloqueada pelo guard existente. Quando apenas uma massa específica está ausente, somente o cenário dependente dela é ignorado. Isso permite preparar a suíte progressivamente sem mascarar os demais casos.

O idioma também passou a ser normalizado de `pt_BR` para o language tag HTTP `pt-BR`, preservando compatibilidade com arquivos locais antigos e alinhando o header ao padrão esperado pelo Spring.

### 5.7 Webhook controlado por WireMock

Foi criado o mapping `/voucher-batch-webhook`, que responde `204` no ambiente local. O `WireMockClient` ganhou leitura dos corpos recebidos pelo request journal para validar o callback real.

Também foi corrigida a montagem das URLs administrativas. Antes, um `baseURL` terminado em `/__admin` combinado com paths iniciados em `/` podia resolver para a raiz do host. Agora cada URL é montada explicitamente sobre o endereço administrativo, mantendo `/__admin/reset`, `/__admin/requests/count` e `/__admin/requests/find`.

O cenário de webhook valida chamada única, mesmo `operationId`, status final, mensagem localizada e ausência de contexto técnico.

## 6. Casos implementados

| Caso | Regra exercitada | Resultado esperado |
|---|---|---|
| `E2E-422007-001` | intercompany com coordenadas e sem estoque substituto | operação `COMPLETED`; item `ERROR`; mensagem exata `422.007` |
| `E2E-SUCCESS-001` | estoque suficiente | um item `COMPLETED`; mensagem pública de sucesso |
| `E2E-422062-001` | fluxo aplicável sem as duas coordenadas | item `ERROR`; mensagem `422.062` contendo a CIA |
| `E2E-COORD-001` | coordenadas alternativas propagadas | erro determinístico `422.007`, nunca falso `422.062` |
| `E2E-422064-001` | código válido, mas inexistente | item `ERROR`; mensagem `422.064` contendo o código |
| `E2E-MIXED-001` | sucesso + inexistente + sem estoque | três resultados independentes na mesma operação |
| `E2E-I18N-001` | locale salvo e override `en-US` | mesma classificação; texto PT-BR sem header e inglês com override; `Vary` presente |
| `E2E-WEBHOOK-001` | callback após processamento | uma chamada; DTO público equivalente; sem campos internos |
| `E2E-CONTRACT-001` | vouchers ausente, vazio, 101 itens e tamanho inválido | HTTP `400`; códigos `400.001`, `400.027` ou `400.010` |
| `E2E-CONTRACT-002` | sete campos obrigatórios ausentes, um por vez | HTTP `400`; código funcional `412.001` e nome do campo |
| `E2E-CONTRACT-003` | `userType` inválido e dois webhooks inválidos | HTTP `400`; código `400.004` |

Os três testes de contrato contêm 14 variações executadas em `test.step`. Somados aos oito cenários de negócio, são 22 percursos funcionais distintos representados por 11 entradas do runner Playwright.

## 7. Rastreabilidade das regras não induzidas por E2E

| Regra | Cobertura aplicada | Justificativa |
|---|---|---|
| retorno `null` do repositório permanece técnico | `VoucherSellingTest` | não é seguro nem confiável sabotar repositório por API |
| exceção inesperada vira `500.000` | `VoucherBatchOperationProcessingServiceTest` | falha técnica é determinística com mock, sem afetar HML |
| coordenadas são copiadas para `VoucherBlockRequest` | teste Java focado + `E2E-COORD-001` | combina evidência estrutural e comportamento público |
| contexto interno é persistido e localizado | testes Java + contrato público Playwright | a API não deve expor colunas internas |
| rollback transacional sem efeito parcial | verificação de componente; evidência E2E ainda requer acesso somente leitura ao banco | a resposta HTTP isolada não comprova todas as tabelas alteradas |

Não foi criado um teste E2E que force `500.000`, pois isso exigiria sabotagem de dependência compartilhada. Também não foi apresentada como concluída uma verificação de rollback baseada somente na mensagem: para comprovar ausência de efeitos parciais, a rodada deve comparar snapshots somente leitura antes/depois conforme o guia de referência.

## 8. Resultados das validações

| Projeto | Comando | Resultado |
|---|---|---|
| Playwright | `npm run lint` | aprovado; TypeScript sem erros |
| Playwright | `npm run doctor:env` | aprovado; ambiente local reconhecido e E2E mutante desabilitado |
| Playwright | `npx playwright test tests/batch --list` | 11 testes coletados em 2 arquivos |
| Playwright | `npx playwright test --list` | 41 testes coletados no projeto completo |
| Playwright | `npm run test:batch` | comando aprovado; 11 ignorados pelos guards, sem mutação |
| `ms-voucher` | `mvn -Dtest=VoucherSellingTest,VoucherBatchOperationProcessingServiceTest test` | 38 testes; 0 falhas; 0 erros; 0 ignorados |
| `ms-voucher` | `mvn test` | 330 testes; 0 falhas; 0 erros; 0 ignorados; `BUILD SUCCESS` |
| `ms-voucher` | `mvn -DskipTests package` | JAR gerado; `BUILD SUCCESS` |
| ambos | `git diff --check` | nenhuma inconsistência de whitespace |

Os E2E de lote não foram executados contra HML nem contra uma aplicação local ativa nesta rodada. Essa decisão é intencional: não havia massa exclusiva preenchida nos campos `BATCH_*`, e habilitar mutações por conta própria contrariaria as proteções já adotadas pelo projeto. O resultado “ignorado” demonstra que os guards funcionaram; não deve ser interpretado como aprovação funcional do ambiente integrado.

Durante a regressão Maven apareceram logs de exceções e chamadas SQS esperadas em testes que exercitam caminhos de falha. O critério objetivo permaneceu o resultado do Surefire e do Maven, ambos aprovados. Nenhuma alteração foi feita no repositório do `ms-voucher`.

## 9. Como executar a rodada E2E real

1. reservar Vales exclusivos para sucesso, falta de estoque, ausência de coordenadas, propagação, lote misto e webhook;
2. confirmar CIA original, CIA da revenda, CIA de destino e estoque `NAO_VENDIDO`;
3. preencher os campos `BATCH_*` no arquivo `.env.<ambiente>` local e ignorado pelo Git;
4. iniciar o `ms-voucher` e as dependências adequadas;
5. habilitar conscientemente os dois flags mutantes e, em HML, a confirmação adicional;
6. executar:

```bash
npm run test:batch
```

7. consultar `playwright-report/index.html` e `test-results/results.json`;
8. para `E2E-ROLLBACK-001`, anexar snapshots somente leitura das tabelas envolvidas antes e depois da operação.

Para o callback local no Compose:

```dotenv
BATCH_WEBHOOK_URL=http://ms-notification-wiremock:8080/voucher-batch-webhook
WIREMOCK_NOTIFICATION_ADMIN_URL=http://127.0.0.1:18081/__admin
```

Se o serviço rodar diretamente na máquina, a URL do webhook também deve usar a porta publicada `18081`.

## 10. Riscos residuais e recomendações

### Prioridade alta

- executar os casos P0 em ambiente integrado com massa reservada e registrar o estado anterior/posterior;
- não compartilhar os Vales de sucesso e lote misto entre execuções paralelas;
- tratar indisponibilidade de Oracle, consumidor assíncrono ou integração como bloqueio ambiental, não como falha automática da regra `422.007`.

### Prioridade média

- adicionar uma fixture somente leitura de banco quando houver credencial técnica específica para testes; ela permitirá automatizar o código interno e o rollback sem expor segredo;
- manter `workers: 1` para cenários de lote mutantes, pois o estoque e o estado do Vale são recursos consumíveis;
- revisar os valores de timeout por ambiente a partir da latência observada, evitando aumentar indiscriminadamente o tempo global.

### Prioridade baixa

- avaliar uma tag dedicada para testes de contrato rejeitado caso o time queira executá-los separadamente dos cenários que consomem massa;
- integrar evidências de operação e `caseId` ao pipeline de observabilidade.

## 11. Arquivos alterados ou adicionados

| Arquivo/grupo | Alteração |
|---|---|
| `src/api/voucherBatchOperations.ts` | schemas, tipos, status e payload do lote |
| `src/api/msVoucherClient.ts` | `POST`/`GET` do domínio e seleção de idioma |
| `src/api/wiremockClient.ts` | URL administrativa robusta e leitura de requests |
| `src/config/env.ts` | massa `BATCH_*`, polling e normalização de locale |
| `src/data/payloadBuilders.ts` | builders de contrato e massa configurada |
| `src/utils/voucherBatch.ts` | parsing, polling, contrato público e busca de item |
| `scripts/doctor-env.ts` | aviso de massa de lote ausente quando o E2E mutante é habilitado |
| `tests/batch/*.spec.ts` | 11 testes Playwright de contrato e negócio |
| `docker/wiremock/.../voucher-batch-webhook-success.json` | stub local do callback |
| `.env.*.example` | templates sem valores sensíveis |
| `package.json` | script `test:batch` |
| `README.md` | configuração e execução da nova suíte |
| `docs/matriz-bdd-e2e.md` | rastreabilidade central dos novos casos e dependências |

## 12. Conclusão

A suíte adicionada transforma as regras do relatório e do Notion em testes Playwright reutilizáveis, rastreáveis e protegidos contra execução acidental. O desenho separa contrato HTTP, processamento assíncrono, localização, webhook e massa de negócio, mantendo o padrão do subprojeto.

A verificação local demonstra que o código compila, os testes são coletados, os guards impedem mutações sem autorização e o `ms-voucher` continua aprovado em testes focados, regressão completa e build. A aprovação E2E final de `422.007`/`422.062` depende apenas da rodada controlada com serviço ativo e massa dedicada documentada.

## Fontes

- [Task no Notion — Generate a Playwrite test scenario for issue from code:422.062](https://app.notion.com/p/3a1b3def3e7c8018986fdca0622723fa)
- [Guia técnico de testes E2E e BDD — tratamento do código `422.007`](./guia-tecnico-testes-e2e-bdd-issue-422-007-ms-voucher.md)
- `ms-voucher/src/main/resources/swagger/swagger-vouchers_api_v1.yaml`
- `ms-voucher/src/main/java/br/com/ultragaz/voucher/service/VoucherBatchOperationService.java`
- `ms-voucher/src/main/java/br/com/ultragaz/voucher/service/VoucherBatchOperationProcessingService.java`
- `ms-voucher/src/main/java/br/com/ultragaz/voucher/service/VoucherSellingService.java`
- `ms-voucher/src/main/resources/internationalization/messages_pt_BR.properties`
