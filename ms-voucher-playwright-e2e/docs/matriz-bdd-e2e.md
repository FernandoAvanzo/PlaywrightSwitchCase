# Matriz BDD/E2E automatizada - ms-voucher

Esta matriz foi derivada do relatório técnico de referência anexado.

| Grupo | Casos cobertos automaticamente | Localização |
|---|---|---|
| Saúde | HEALTH-001 | `tests/health/health.spec.ts` |
| Setup | SETUP-001 a SETUP-006 | `tests/setup/setup.spec.ts` |
| Notificação | NOTIF-001, NOTIF-002, NOTIF-003, NOTIF-004, NOTIF-007 | `tests/notification/notification-fallback.spec.ts` |
| Importação Gestão VG | PRIC-001 a PRIC-009 | `tests/pricing/import-pricing-rules.spec.ts` |
| Consulta de preços | PRICE-001, PRICE-002, PRICE-003, PRICE-004, PRICE-006 | `tests/prices/prices.spec.ts` |
| Mensagens funcionais | MSG-006, MSG-008 como scaffolds executáveis após confirmar paths/massa | `tests/messages/functional-messages.spec.ts` |
| E2E integrado | E2E-001, E2E-003 | `tests/e2e/critical-flows.spec.ts` |
| Bloqueio em lote | E2E-422007-001, E2E-SUCCESS-001, E2E-422062-001, E2E-COORD-001, E2E-422064-001, E2E-MIXED-001, E2E-I18N-001, E2E-WEBHOOK-001, E2E-CONTRACT-001 a 004 e E2E-422064-STUB-001 a 006 | `tests/batch/*.spec.ts` |

## Casos ainda dependentes de massa ou confirmação de endpoint

| Caso | Dependência |
|---|---|
| SETUP-001 a SETUP-006 | Exigem `SETUP_CONTRACT=notification-channel`; a branch `release` expõe somente o contrato legado de setup. |
| SETUP-007 | Banco descartável com estado intermediário entre migrations V75 e V76. |
| NOTIF-005, NOTIF-006, NOTIF-008, NOTIF-009, NOTIF-010 | Massa de venda/cancelamento/reenvio e endpoint exato de reenvio. |
| PRICE-005, PRICE-007, PRICE-008 | Massa com regras concorrentes, distribuidor por localização/Oracle e controle de data/hora. |
| MSG-001 a MSG-005, MSG-007 | Massa específica de limite, reserva, confirmação e bloqueio. |
| E2E-002 | Requer voucher vendido e cancelável com massa controlada. |
| E2E-422007-001 a E2E-WEBHOOK-001 | Exigem contexto `BATCH_*`, Vales exclusivos por cenário, consumidor assíncrono ativo e habilitação mutante explícita. Os casos determinísticos `E2E-422064-STUB-001` a `006` são a exceção: exigem apenas o Compose local, os dois WireMocks e a habilitação mutante. |
| E2E-WEBHOOK-001 | Exige callback acessível pela aplicação e `WIREMOCK_NOTIFICATION_ADMIN_URL` acessível pelo runner. |
| E2E-ROLLBACK-001 | A comprovação completa ainda exige snapshots somente leitura do banco antes/depois. |

## Fronteiras determinísticas da regra `422.064`

| Caso | Regra de negócio exercitada |
|---|---|
| E2E-422064-STUB-001 | Assinatura exata do legado, variação de caixa e espaços externos produzem a mensagem funcional localizada. |
| E2E-422064-STUB-002 | HTTP `503`, SOAP Fault, código externo `2` isolado e assinaturas parcial/divergente permanecem erro técnico genérico. |
| E2E-422064-STUB-003 | Vale ausente localmente, mas aceito pelo legado, conclui com sucesso. |
| E2E-422064-STUB-004 | Ausência de `Accept-Language` usa `en-US`, preserva a representação e informa `Vary: Accept-Language`. |
| E2E-422064-STUB-005 | Webhook preserva o locale registrado, não vaza campos internos e não é alterado por leitura posterior em outro idioma. |
| E2E-422064-STUB-006 | Dois lotes concorrentes, com 20 itens no total, não misturam códigos, mensagens nem requisições SOAP. |

## Convenções BDD usadas nos specs

Cada teste usa:
- nome com ID rastreável;
- `test.step` para passos `Dado/Quando/Então` nos fluxos integrados;
- tags por domínio: `@smoke`, `@mutating`, `@pricing`, `@notification`, `@e2e`, `@batch` e `@contract`;
- guards para impedir mutações acidentais em produção.
