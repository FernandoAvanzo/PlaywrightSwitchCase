# Matriz BDD/E2E

| ID | Prioridade | Cenário | Suite | Ambiente |
|---|---|---|---|---|
| PAY-001 | P0 | Crédito com customer, card, charge e split | e2e | local/HML |
| PAY-002 | P0 | Charge usa cardId e não tokenId | e2e | local |
| PAY-003 | P0 | Crédito sem billing é rejeitado | contract | local/HML |
| PAY-004 | P0 | Retry de charge não duplica customer/card | resilience | local |
| PAY-005 | P0 | Resposta não expõe segredos ou IDs internos | security | local/HML |
| PAY-006 | P1 | Crédito sem split omite splitRules | e2e | local/HML |
| PAY-007 | P1 | PIX não cria customer/card | regression | local/HML |
| PAY-008 | P1 | PIX com card_details é rejeitado | contract | local/HML |
| PAY-009 | P1 | Captura total preserva idempotência | e2e | local/HML |
| PAY-010 | P1 | Consulta retorna apenas cartão mascarado | security | local/HML |
| PAY-011 | P1 | Webhook atualiza estado canônico | e2e | local/HML |
| PAY-012 | P1 | Falha no customer não cria card/charge | resilience | local |
| PAY-013 | P1 | Falha no card reutiliza customer no retry | resilience | local |
| PAY-014 | P1 | Migration V27 persiste customer externo | persistence | local |
| PAY-015 | P1 | PATCH ignora credencial mascarada | contract | local/HML |
| PAY-016 | P1 | PATCH preserva defaultCategoryId | contract | local/HML |
| PAY-017 | P2 | Health e disponibilidade | smoke | todos |
| PAY-018 | P2 | Valor zero é rejeitado | contract | local/HML |
