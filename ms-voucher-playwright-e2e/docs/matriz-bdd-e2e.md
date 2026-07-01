# Matriz BDD/E2E automatizada - ms-voucher

Esta matriz foi derivada do relatório técnico de referência anexado.

| Grupo | Casos cobertos automaticamente | Localização |
|---|---|---|
| Setup | SETUP-001 a SETUP-006 | `tests/setup/setup.spec.ts` |
| Notificação | NOTIF-001, NOTIF-002, NOTIF-003, NOTIF-004, NOTIF-007 | `tests/notification/notification-fallback.spec.ts` |
| Importação Gestão VG | PRIC-001 a PRIC-009 | `tests/pricing/import-pricing-rules.spec.ts` |
| Consulta de preços | PRICE-001, PRICE-002, PRICE-003, PRICE-004, PRICE-006 | `tests/prices/prices.spec.ts` |
| Mensagens funcionais | MSG-006, MSG-008 como scaffolds executáveis após confirmar paths/massa | `tests/messages/functional-messages.spec.ts` |
| E2E integrado | E2E-001, E2E-003 | `tests/e2e/critical-flows.spec.ts` |

## Casos ainda dependentes de massa ou confirmação de endpoint

| Caso | Dependência |
|---|---|
| SETUP-007 | Banco descartável com estado intermediário entre migrations V75 e V76. |
| NOTIF-005, NOTIF-006, NOTIF-008, NOTIF-009, NOTIF-010 | Massa de venda/cancelamento/reenvio e endpoint exato de reenvio. |
| PRICE-005, PRICE-007, PRICE-008 | Massa com regras concorrentes, distribuidor por localização/Oracle e controle de data/hora. |
| MSG-001 a MSG-005, MSG-007 | Massa específica de limite, reserva, confirmação e bloqueio. |
| E2E-002 | Requer voucher vendido e cancelável com massa controlada. |

## Convenções BDD usadas nos specs

Cada teste usa:
- nome com ID rastreável;
- `test.step` para passos `Dado/Quando/Então` nos fluxos integrados;
- tags por domínio: `@smoke`, `@mutating`, `@pricing`, `@notification`, `@e2e`;
- guards para impedir mutações acidentais em produção.
