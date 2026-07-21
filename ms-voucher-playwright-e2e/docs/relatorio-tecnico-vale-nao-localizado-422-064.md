# Relatório técnico — ampliação E2E da mensagem de Vale não localizado (`422.064`)

**Data da validação:** 21/07/2026  
**Projeto de testes:** `ms-voucher-playwright-e2e`  
**Sistema sob teste:** `ms-voucher`  
**Escopo:** bloqueio assíncrono em lote com fallback síncrono no SOA/EBS

## Resumo executivo

Foram adicionados seis cenários E2E determinísticos para estressar as fronteiras da regra que converte a assinatura conhecida do legado `Erro - Vale <código> não localizado.` no erro funcional localizado `422.064`. Também foi incluído um caso de contrato somente leitura para operação inexistente e reforçada a verificação de invariância entre representações localizadas.

A cobertura nova confirma que:

- a assinatura exata aceita variações seguras de caixa e espaços externos;
- código externo `2`, mensagem parcial, código de Vale divergente, HTTP `503` e SOAP Fault não produzem falso `422.064`;
- um Vale ausente na base local, mas aceito pelo legado, continua concluindo com sucesso;
- a localização altera somente a mensagem pública, com fallback `en-US` e `Vary: Accept-Language`;
- o webhook preserva o locale salvo e não expõe contexto interno;
- duas operações concorrentes, com 20 itens no total, mantêm isolamento entre códigos e chamadas SOAP;
- uma operação inexistente responde `404` sem vazar stack trace ou detalhes do legado.

Os requisitos foram consolidados a partir do [guia técnico anexado](./Guia_tecnico_de_testes_E2E_e_BDD—mensagem_de_Vale_nao_localizado_no_ms-voucher.md) e da [task no Notion — Generate a Playwright test scenario for wrong message](https://app.notion.com/p/3a0b3def3e7c80b593a6f5be90ec72b7). A página do Notion reforça a necessidade de transformar o relatório E2E em casos adicionais e cobre explicitamente assinatura do legado, localização, lote misto, webhook, concorrência e ausência de vazamento técnico.

## Contexto da regra de negócio

No fluxo de bloqueio, o `ms-voucher` primeiro procura o Vale localmente. Quando não existe transação local a bloquear, o serviço tenta a integração síncrona com o SOA/EBS. A resposta do legado só é classificada como Vale não localizado quando a mensagem da exceção é igual, ignorando caixa e espaços externos, a:

```text
Erro - Vale <código solicitado> não localizado.
```

Nesse caso, o serviço lança o código estruturado `422.064` com o próprio Vale como argumento. A operação em lote persiste o código e os argumentos, e a representação pública resolve a mensagem conforme o idioma da requisição:

```text
pt-BR: O Vale <código> não foi localizado. Verifique o código informado.
en-US: Voucher <código> was not found. Check the provided code.
```

Falhas não reconhecidas continuam usando o erro técnico público genérico `500.000`, sem propagar envelope SOAP, stack trace ou mensagem interna. Essa separação evita dois riscos opostos: esconder um erro funcional conhecido atrás de `500` ou converter uma indisponibilidade técnica em falso “Vale não localizado”.

## Estrutura do projeto Playwright

O projeto segue uma separação em camadas que mantém os specs orientados a comportamento:

```text
ms-voucher-playwright-e2e/
├── docker/
│   ├── docker-compose.local.yml       # aplicação e dependências locais
│   ├── ms-voucher-migrations/         # compatibilidade exclusiva do banco local
│   └── wiremock/                      # mappings padrão de notificação e SOA
├── docs/                              # guias, relatórios e matriz BDD/E2E
├── fixtures/                          # massas versionáveis sem segredos
├── scripts/                           # diagnóstico, seed e launchers
├── src/
│   ├── api/                           # clientes HTTP da API e dos WireMocks
│   ├── config/                        # resolução e validação dos ambientes
│   ├── data/                          # builders de payload
│   └── utils/                         # guards, polling e assertions reutilizáveis
└── tests/
    ├── batch/                         # contrato e regras do bloqueio em lote
    ├── health/                        # disponibilidade
    ├── notification/                  # canais e fallback
    ├── pricing/ e prices/             # Gestão VG e consulta de preços
    ├── setup/                         # contrato de configuração
    └── e2e/ e messages/               # fluxos integrados e mensagens
```

### Padrões mantidos

- `APIRequestContext` do Playwright para todos os acessos HTTP;
- builders tipados para evitar payloads duplicados nos specs;
- schemas Zod para validar o contrato público recebido;
- polling explícito até o estado terminal da operação assíncrona;
- IDs BDD rastreáveis no nome de cada teste;
- guards de ambiente e mutação antes de qualquer cenário destrutivo;
- execução serial e `workers: 1` para recursos locais compartilhados;
- limpeza dos mappings dinâmicos e do journal do WireMock após os testes;
- assertions sobre comportamento público, sem dependência direta de banco nos casos da regra.

## Implementações realizadas

### 1. Spec determinístico da fronteira `422.064`

O arquivo `tests/batch/voucher-not-found-boundaries.spec.ts` cria mappings SOAP específicos para cada Vale, dispara o endpoint público de lote, aguarda o processamento e consulta o resultado público. Assim, a massa da regra fica sob controle do teste e não depende de um Vale preexistente ou de uma resposta instável do legado.

| ID | Estímulo | Resultado obrigatório |
|---|---|---|
| `E2E-422064-STUB-001` | assinatura exata, caixa diferente e espaços externos | item `ERROR`, mensagem `422.064` em pt-BR e uma chamada SOAP por Vale |
| `E2E-422064-STUB-002` | HTTP `503`, SOAP Fault, código `2` com outra mensagem, assinatura parcial e código divergente | operação continua; cada item recebe erro técnico genérico, sem falso `422.064` ou detalhes internos |
| `E2E-422064-STUB-003` | Vale ausente localmente e resposta externa de sucesso | item `COMPLETED`, sem mensagem de Vale não localizado |
| `E2E-422064-STUB-004` | POST e GET sem `Accept-Language` | fallback `en-US`, `Vary: Accept-Language` e demais campos invariantes |
| `E2E-422064-STUB-005` | callback criado em pt-BR e GET posterior em en-US | webhook mantém pt-BR; GET usa inglês; DTO público não vaza campos internos |
| `E2E-422064-STUB-006` | duas operações concorrentes com dez Vales cada | 20 resultados isolados, sem placeholder `{0}`, código estrangeiro ou chamada SOAP duplicada |

O describe é restrito a `local`, exige `ALLOW_MUTATION=true` e `ENABLE_MUTATING_E2E=true`, e restaura os mappings padrão no `afterEach`. O comando dedicado é:

```bash
npm run test:voucher-not-found
```

### 2. Cliente WireMock orientado ao contrato SOAP

`src/api/wiremockClient.ts` passou a oferecer operações reutilizáveis para:

- registrar resposta de bloqueio com código e mensagem controlados;
- simular erro HTTP e SOAP Fault;
- contar chamadas de bloqueio por Vale;
- limpar corretamente o request journal pela API atual do WireMock;
- ler corpos de callbacks tanto no formato direto quanto no formato aninhado do journal;
- validar o status de cada chamada administrativa.

O matcher reconhece `codigoAutorizacao` e `numeroEvale`, pois o contrato serializa o identificador de sete caracteres como código de autorização. Os XMLs usam os namespaces do serviço Evale e incluem `nrSolicitacaoContact` vazio, necessário para que a resposta controlada atravesse o cliente SOAP real do `ms-voucher`.

O mapping padrão do SOA também foi estreitado para `BloquearRequest` e atualizado para uma `BloquearResponse` válida. Isso evita que um falso envelope genérico `<success>true</success>` mascare problemas de desserialização.

### 3. Assertions de representação e contrato

`src/utils/voucherBatch.ts` recebeu `expectVoucherBatchRepresentationInvariant`. O helper remove apenas a mensagem localizada e compara o restante da operação e de cada item. O caso de i18n já existente agora usa essa verificação mais forte.

`E2E-CONTRACT-004`, em `tests/batch/voucher-batch-contract.spec.ts`, consulta um UUID inexistente e exige `404`. O contrato atual devolve corpo vazio nesse caso; por isso a asserção aceita a ausência de JSON, mas rejeita qualquer conteúdo com stack trace, envelope SOAP, `messageCode`, `messageArguments` ou `localeTag`.

### 4. Isolamento de configuração

Variáveis genéricas da estação, especialmente `BASE_URL`, podem apontar para outro projeto. `src/config/env.ts` mantém `.env.<ambiente>` como fonte preferencial por padrão e permite override do processo somente com a opção explícita:

```dotenv
PW_PROCESS_ENV_OVERRIDES=true
```

Essa opção é útil para CI e validações pontuais, sem tornar uma variável global da máquina capaz de redirecionar silenciosamente a suíte.

### 5. Infraestrutura local reproduzível

Foram necessários três ajustes de compatibilidade no Compose para que o teste percorresse o fluxo real até o SOA:

1. `docker/ms-voucher-migrations/V78.1__local_restore_consumer_schema.sql` cria, apenas no banco descartável local, a tabela `consumer` e as FKs esperadas pelo modelo atual. A migration não altera o repositório do sistema alvo nem recomenda alteração de produção; ela corrige o descompasso entre o snapshot de migrations disponível e as entidades usadas pela imagem local.
2. `ms-notification-wiremock` ganhou o alias interno `webhook.example.com`. O domínio reservado passa pelo validador HTTP da API e resolve somente dentro da rede do Compose.
3. `.env.local.example` fornece o callback local válido por padrão, e o README documenta a alternativa pela porta publicada quando a aplicação roda fora do Compose.

## Fluxo exercitado

```text
Playwright
  └─ POST /voucher-batch-operations/block
       └─ operação e itens persistidos
            └─ processamento de cada item
                 ├─ busca local do Vale
                 ├─ fallback síncrono no SOA WireMock
                 ├─ classificação funcional ou técnica
                 └─ persistência do código/argumentos internos
                      ├─ GET localizado (DTO público)
                      └─ webhook no locale salvo (DTO público)
```

O teste observa o sistema somente pelas interfaces públicas da API, do callback e do journal do mock externo. Isso mantém a prova próxima do comportamento percebido pelo cliente sem acoplar o spec aos detalhes das tabelas da operação.

## Segurança e proteção contra falsos positivos

As decisões abaixo reduzem o risco de um teste verde sem provar a regra:

- cada resposta SOAP é associada ao código específico do Vale;
- cada caso confirma a quantidade de chamadas ao SOA;
- o caso negativo combina categorias técnicas e assinaturas semanticamente próximas;
- o lote precisa chegar a `COMPLETED` mesmo com itens funcionais ou técnicos em erro;
- todas as respostas passam pelo schema público e pela lista de campos proibidos;
- o cenário de locale compara a representação inteira, não apenas texto e status;
- o callback é validado como DTO público real e deve ocorrer exatamente uma vez;
- concorrência usa conjuntos disjuntos e verifica ausência de qualquer código do lote vizinho;
- os stubs determinísticos não são permitidos em HML ou produção.

## Evidências de validação

Ambiente utilizado:

- Java `25.0.3`;
- Maven `3.9.15`;
- Node.js `24.13`;
- npm `11.6.2`;
- Playwright `1.61.1`;
- Docker `29.6.1`;
- aplicação e cinco dependências do Compose em estado saudável.

| Validação | Resultado |
|---|---|
| `npm run lint` | sucesso, sem erro TypeScript |
| `npx playwright test --list` | 48 testes coletados em 10 arquivos |
| `npm run test:voucher-not-found` com mutações locais habilitadas | 6 aprovados em 13,7 s |
| `npm run test:local` | 16 aprovados, 32 ignorados pelos guards, nenhuma falha em 1,5 s |
| `mvn test` no `ms-voucher` | 330 aprovados, nenhuma falha/erro/skip; `BUILD SUCCESS` em 32,765 s |
| health check do `ms-voucher` no Compose | `UP` |

Os testes ignorados da execução Playwright ampla são casos que exigem contratos futuros ou massas dedicadas não habilitadas nessa rodada. O fluxo focal novo foi executado separadamente com seus stubs locais e todos os seis casos passaram.

## Como reproduzir

```bash
cp .env.local.example .env.local
npm install
npm run infra:up:app
npm run lint

PW_PROCESS_ENV_OVERRIDES=true \
TEST_ENV=local \
BASE_URL=http://127.0.0.1:8001/voucher/v1 \
ALLOW_MUTATION=true \
ENABLE_MUTATING_E2E=true \
BATCH_WEBHOOK_URL=http://webhook.example.com:8080/voucher-batch-webhook \
npm run test:voucher-not-found

npm run test:local
```

Para validar o sistema alvo independentemente:

```bash
cd ../../../ms-voucher
mvn test
```

## Limitações e próximos passos

- A rodada não executou mutações em HML. Isso é intencional: os casos determinísticos são locais e a suíte mantém a exigência de massa e confirmação explícitas para ambientes compartilhados.
- A migration `V78.1` é uma ponte do Compose local. O histórico oficial de schema do `ms-voucher` deve ser revisado no repositório de origem antes de promover solução equivalente para outro ambiente.
- A comprovação transacional por snapshot de banco do caso `E2E-ROLLBACK-001` continua fora deste escopo.
- Os testes de massa existentes permanecem úteis para uma rodada integrada em HML; os novos stubs complementam essa prova com fronteiras repetíveis e rápidas para CI local.

## Arquivos principais da entrega

- `tests/batch/voucher-not-found-boundaries.spec.ts` — seis cenários novos;
- `tests/batch/voucher-batch-contract.spec.ts` — contrato `404`;
- `tests/batch/voucher-batch-business-rules.spec.ts` — invariância de i18n reforçada;
- `src/api/wiremockClient.ts` — stubs SOAP e inspeção do journal;
- `src/utils/voucherBatch.ts` — polling e comparação de representação;
- `src/config/env.ts` — precedência segura das configurações;
- `docker/docker-compose.local.yml` — alias interno do webhook;
- `docker/ms-voucher-migrations/V78.1__local_restore_consumer_schema.sql` — schema de apoio local;
- `docker/wiremock/soa/mappings/default-soap-success.json` — resposta SOAP padrão válida;
- `docs/matriz-bdd-e2e.md` — rastreabilidade atualizada;
- `README.md` e `.env.local.example` — execução documentada.

## Fontes

- [Guia técnico de testes E2E e BDD — mensagem de Vale não localizado](./Guia_tecnico_de_testes_E2E_e_BDD—mensagem_de_Vale_nao_localizado_no_ms-voucher.md)
- [Task no Notion — Generate a Playwright test scenario for wrong message](https://app.notion.com/p/3a0b3def3e7c80b593a6f5be90ec72b7)
- Código e contratos locais do `ms-voucher`: `VoucherService`, `VoucherBatchOperationProcessingService`, `VoucherBatchOperationResponseMapper`, `LocalizedMessageService`, bundles de i18n e WSDL/XSD do Evale.
