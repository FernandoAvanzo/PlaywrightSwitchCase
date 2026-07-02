# Relatório Técnico — Cobertura Playwright para BLiP WhatsApp

## 1. Contexto

Este ajuste da suíte `ms-notification-playwright-e2e` foi feito a partir do relatório local `report_change.md`, dos artefatos técnicos da pasta Google Drive `ms-notification` e da árvore `src` do projeto `ms-notification`.

Os artefatos indicam a migração do envio WhatsApp para BLiP, com contrato em duas chamadas HTTP:

- `POST /commands`, para resolver a conta WhatsApp do cliente.
- `POST /messages`, para enviar template aprovado.

Também foi considerada a regra do fluxo adhoc de voucher: WhatsApp é o canal primário, SMS é fallback apenas quando a falha do WhatsApp é funcional ou configuracional. Falhas transitórias de BLiP devem ir para retry sem acionar SMS imediatamente.

Valores sensíveis encontrados nas configurações do projeto fonte não foram copiados para este relatório nem para os arquivos versionáveis da suíte.

## 2. Arquivos alterados

- `src/clients/mock-infra-client.ts`
- `src/data/payloads.ts`
- `tests/02-whatsapp.spec.ts`
- `tests/03-voucher-adhoc.spec.ts`
- `tests/e2e/voucher-flows.spec.ts`
- `tests/e2e/routeasy-flow.spec.ts`
- `tests/e2e/app-notification-flow.spec.ts`
- `infra/docker-compose.local.yml`
- `.env.local`
- `docs/MATRIZ_CENARIOS.md`
- `docs/RELATORIO_TECNICO.md`

## 3. Mudanças implementadas

### 3.1 Mocks BLiP no WireMock

O `MockInfraClient` foi expandido para suportar stubs por `urlPath`, validação por headers, padrões de corpo e consulta das requisições recebidas pelo WireMock.

Foram adicionados helpers específicos de BLiP:

- lookup com `alternativeAccount`;
- lookup com fallback para `identity`;
- lookup sem destino;
- falha de lookup;
- envio de mensagem aceito;
- falha de envio de mensagem.

Essa escolha mantém os testes no mesmo padrão já usado para SMS e encurtador, mas permite inspecionar o contrato real enviado para BLiP sem depender de provedor externo.

### 3.2 Cobertura WhatsApp

A suíte `tests/02-whatsapp.spec.ts` foi refeita para cobrir o comportamento BLiP:

- `CT-007`: payload público com `message` continua aceito, mas o outbound usa template BLiP default.
- `CT-008`: template explícito é enviado com `namespace`, `name`, idioma `pt_BR`, policy `deterministic` e parâmetros ordenados por chave numérica.
- `BLIP-001`: quando o lookup não retorna `alternativeAccount`, o destino usa `identity`.
- `BLIP-002`: quando o lookup não retorna destino, `/messages` não é chamado.
- `CT-011`: erro BLiP transitório agenda retry de WhatsApp.
- `CT-012`: erro BLiP funcional agenda hospital de WhatsApp.

Também foram adicionadas asserções de segurança/contrato para o header `Authorization: Key ...`, garantindo que não seja enviado `Bearer` nem `X-Account-Id`.

### 3.3 Cobertura voucher adhoc

A suíte `tests/03-voucher-adhoc.spec.ts` agora valida o contrato de resposta do endpoint `/vouchers/adhoc`:

- sucesso WhatsApp retorna `ACCEPTED`, `sentChannel=WHATSAPP` e não chama SMS;
- falha funcional BLiP retorna `FALLBACK_SENT` quando SMS aceita;
- falha funcional BLiP mais falha SMS retorna `FALLBACK_FAILED`;
- falha transitória BLiP retorna `RETRY_SCHEDULED` e não chama SMS;
- canais default são `WHATSAPP` e `SMS`;
- payload apenas com template gera fallback SMS com o código do voucher;
- lookup BLiP sem destino aciona fallback SMS sem enviar `/messages`;
- contratos inválidos seguem retornando `400`.

### 3.4 Fluxos E2E

O arquivo `tests/e2e/voucher-flows.spec.ts` foi atualizado para refletir o fluxo real de voucher com BLiP:

- `E2E-001`: WhatsApp aceito sem fallback.
- `E2E-002`: BLiP funcionalmente rejeitado com SMS fallback aceito.
- `E2E-003`: BLiP funcionalmente rejeitado e SMS fallback rejeitado.
- `E2E-004`: BLiP transitório em retry sem SMS imediato.

Os identificadores dos E2E existentes foram ajustados para evitar colisão:

- Routeasy passou para `E2E-005`.
- Notificação persistida passou para `E2E-006`.

### 3.5 Infraestrutura local

O `docker-compose.local.yml` recebeu as variáveis necessárias ao perfil local do `ms-notification` para BLiP:

- provider `BLIP`;
- endpoints `/commands` e `/messages` apontando para WireMock;
- contract id, API key e namespace sintéticos;
- template default de venda;
- alias `vouchers` com credenciais sintéticas;
- filas específicas `NOTIFICATION_WHATSAPP_QUEUE_RETRY` e `NOTIFICATION_WHATSAPP_QUEUE_HOSPITAL`.

A `.env.local` também recebeu defaults sintéticos para os mesmos campos. Nenhuma credencial real foi adicionada.

## 4. Justificativas técnicas

1. **Mocks dinâmicos via WireMock Admin**: preservam isolamento por teste, reduzem acoplamento com arquivos estáticos e permitem simular respostas BLiP diferentes no mesmo arquivo de spec.
2. **Inspeção de requisições reais**: validar somente `202` não cobre a mudança principal. Por isso a suíte confere headers, corpo de `/commands`, corpo de `/messages` e ausência/presença de chamadas SMS.
3. **Separação entre falha funcional e transitória**: essa é a regra crítica do fallback. `400` deve permitir SMS fallback; `503` deve ir para retry sem SMS imediato.
4. **Manutenção dos contratos existentes**: os testes negativos de validação HTTP foram mantidos para garantir que a migração de provedor não relaxe validações públicas.
5. **Ambiente local com valores sintéticos**: a suíte continua executável sem provedores reais e sem expor segredo de BLiP.

## 5. Validação executada

Comandos executados:

```bash
npx tsc --noEmit
npm run lint:env
TEST_ENV=local npx playwright test --grep "@(smoke|contract|local|e2e)" --list
npm run test:local
curl -fsS --max-time 5 http://localhost:18001/notification/v1/actuator/health
docker version
```

Resultados:

- TypeScript compilou sem erros.
- Validação de ambiente local passou com `baseURL=http://localhost:18001/notification/v1/`.
- Playwright carregou a suíte e listou 39 testes em 10 arquivos.
- A execução completa `npm run test:local` não conseguiu iniciar a aplicação porque o daemon Docker não estava acessível no socket `unix:///home/fernandoavanzo/.docker/desktop/docker.sock`.
- O health check local também falhou porque não havia serviço escutando em `localhost:18001`.

## 6. Como validar localmente após iniciar o Docker

Com Docker Desktop/daemon ativo:

```bash
cd ms-notification-playwright-e2e
npm run test:local
```

Para manter a infraestrutura no ar e investigar manualmente:

```bash
npm run compose:up
npm run test:local:no-docker
npm run compose:logs
npm run compose:down
```

## 7. Risco residual

A suíte foi compilada e descoberta pelo Playwright, mas a execução runtime depende do Docker local. O único bloqueio encontrado foi externo ao código alterado: daemon Docker indisponível. Assim que o Docker estiver ativo, a validação restante esperada é a execução de ponta a ponta contra o `ms-notification` containerizado.
