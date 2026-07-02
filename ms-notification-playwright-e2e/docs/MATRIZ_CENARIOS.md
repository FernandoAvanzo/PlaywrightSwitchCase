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
| E2E-001 a E2E-004 | tests/e2e/voucher-flows.spec.ts | Local | Fluxos integrados de voucher com BLiP e fallback SMS |
| E2E-005 | tests/e2e/routeasy-flow.spec.ts | Local | Webhook até SMS |
| E2E-006 | tests/e2e/app-notification-flow.spec.ts | Local | CRUD de notificação persistida |
