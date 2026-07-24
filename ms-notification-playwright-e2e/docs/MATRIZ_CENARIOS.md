# Matriz de Cenários Automatizados

| ID | Arquivo | Ambiente principal | Observação |
|---|---|---|---|
| CT-001 | tests/00-health.spec.ts | Local/HML/PROD | Smoke |
| CT-002 a CT-006 | tests/01-sms.spec.ts | Local/HML parcial | Envio real só local/mocked |
| CT-007 a CT-012, BLIP-001 a BLIP-002 | tests/02-whatsapp.spec.ts | Local/HML parcial | Contrato BLiP `/commands` e `/messages`; envio real só local/mocked |
| CT-013 a CT-020, BLIP-003 a BLIP-004 | tests/03-voucher-adhoc.spec.ts | Local/HML parcial | Fallback SMS apenas em falha funcional/configuracional; retry não dispara SMS imediato |
| CT-021 a CT-023 | tests/04-routeasy.spec.ts | Local | Mocks de encurtador e SMS |
| CT-024 a CT-028 | tests/05-app-notifications.spec.ts | Local/HML | Depende de banco/migrações |
| CT-029 a CT-030 | tests/06-observability.spec.ts | Local | Lê logs do Docker Compose |
| SF-F01 a SF-F10, SF-F12, SF-R01 a SF-R03, SF-S02/S03/S05 | tests/07-salesforce-whatsapp.spec.ts | Local | Contrato Salesforce, fluxos VOUCHER/APP_AUTH, telefone, compatibilidade, OAuth, cache, concorrência, idempotência e logs |
| SF-R04 a SF-R14 | tests/08-salesforce-resilience.spec.ts | Local | Renovação após 401, limite de tentativas, retry, hospital, timeout e resposta inválida |
| SF-F10, SF-F12, SF-R06, SF-R09, SF-R18 e SF-R19 | tests/09-salesforce-voucher-adhoc.spec.ts | Local | Salesforce como canal primário, fallback SMS e falha dos dois canais |
| E2E-001 a E2E-004 | tests/e2e/voucher-flows.spec.ts | Local | Fluxos integrados de voucher com BLiP e fallback SMS |
| E2E-005 | tests/e2e/routeasy-flow.spec.ts | Local | Webhook até SMS |
| E2E-006 | tests/e2e/app-notification-flow.spec.ts | Local | CRUD de notificação persistida |

## Regras do guia cobertas pela automação Salesforce

| Regra | Cenários automatizados | Evidência principal |
|---|---|---|
| Voucher envia somente `to` e `text` | SF-F01, SF-F08/F09, SF-F10 | Corpo capturado no WireMock |
| APP_AUTH aceita template opcional | SF-F02, SF-F03 | Endpoint e corpo Apex |
| Aceite exige `202` e `success=true` | SF-F01, SF-R14 | Filas e resposta simulada |
| Normalização com um único DDI 55 | SF-F05A/B/C | Campo `to` |
| Rejeição de `0DDD` sem efeito colateral | SF-F06/F07 | Zero OAuth, Apex e SQS |
| OAuth Client Credentials | SF-R01 | Formulário e Bearer |
| Cache e single-flight de token | SF-R02, SF-R03 | Contagem de autenticações |
| Renovação única após 401 | SF-R04, SF-R05 | Contagem OAuth/Apex e hospital |
| Retry transitório | SF-R08, SF-R09, SF-R10, SF-R12, SF-R13A/B | Payload canônico na SQS |
| Hospital definitivo | SF-R05, SF-R06, SF-R07, SF-R11, SF-R14 | Mensagem na SQS hospital |
| SMS somente após falha definitiva adhoc | SF-R06/R18, SF-R09 | Chamada SMS presente/ausente |
| Falha dos dois canais | SF-R19 | `FALLBACK_FAILED` |
| Idempotência sem reprocessamento local | SF-F04 | Log idempotente e filas vazias |
| Logs sanitizados e rastreáveis | SF-S02/S03 | transactionId/correlationId sem PII/segredo |
| Rollback BLiP preservado | CT-007 a CT-020, BLIP-001 a BLIP-004, E2E-001 a E2E-004 | Regressão local completa |
