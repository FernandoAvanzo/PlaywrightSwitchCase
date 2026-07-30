# Relatório técnico — Guia de testes BDD e E2E da correção de precificação do `ms-voucher`

**Data:** 30/07/2026  
**Projeto:** `ms-voucher`  
**Branch de referência:** `issue/STRY0046423`  
**Idioma:** Português (Brasil)  
**Escopo:** parametrização de limites no setup, importação de campanhas, cálculo do preço, seleção de regras, carga FEPAS/PDV, versionamento por estado efetivo, migrations, segurança e observabilidade.

## 1. Resumo executivo

Este guia define a validação manual, funcional e ponta a ponta das correções de precificação descritas nos relatórios anexos e observadas no código-fonte atual do `ms-voucher`.

O aceite não deve se limitar ao retorno de `GET /prices`. A correção somente estará comprovada quando a mesma oferta:

1. respeitar os limites globais obtidos do setup;
2. for aceita ou rejeitada corretamente na importação da Gestão VG;
3. produzir o preço final correto e a campanha vencedora correta;
4. chegar sem perda aos três campos monetários da tag `404` da FEPAS;
5. provocar nova versão quando o conteúdo comercial mudar, mesmo que os `priceId` permaneçam iguais;
6. não provocar nova versão quando o estado efetivo for idêntico;
7. preservar compatibilidade, atomicidade, segurança e rastreabilidade operacional.

Foram definidos **70 casos manuais rastreáveis**, agrupados em setup/migrations, importação, precificação, FEPAS/versionamento, segurança, concorrência e observabilidade. Os casos P0 constituem a suíte mínima para aprovação em HML.

## 2. Fontes e metodologia

### 2.1 Fontes internas

- Relatório anexado `relatorio_tecnico_fix_precificacao_ms-voucher_2026-07-29(1).md`.
- Relatório anexado `RELATORIO_TECNICO_PARAMETRIZACAO_DESCONTO_SETUP.md`.
- Repositório indicado no anexo `Playright-Github-Repository.txt`.
- Notion — [`[task] Fix the precification rule issue`](https://app.notion.com/p/3acb3def3e7c807b89b4c21dd29e7de8).
- Notion — [`Daily de 29/07/2026`](https://app.notion.com/p/3acb3def3e7c80359155eaed2a279fb0).
- Google Drive — [pasta `ms-voucher`](https://drive.google.com/drive/folders/184PaSJreDCSOG2iSDO6jlEMTSW_AjnHu), incluindo relatórios, cobertura e arquivos Java da árvore `src`.
- Google Drive — README do projeto `ms-voucher-playwright-e2e`.
- Teams — conversa com Douglas sobre [o valor calculado e a carga FEPAS](https://teams.microsoft.com/l/message/19%3a4d35ac12-f224-476b-aac8-ef3cf2b78aee_824f449e-6992-405d-b2b5-ec1c21ab1b8f%40unq.gbl.spaces/1785272097906?context=%7B%22contextType%22:%22chat%22%7D).
- Teams — conversa sobre [limites máximos de desconto no setup](https://teams.microsoft.com/l/message/19%3a4d35ac12-f224-476b-aac8-ef3cf2b78aee_824f449e-6992-405d-b2b5-ec1c21ab1b8f%40unq.gbl.spaces/1785359236388?context=%7B%22contextType%22:%22chat%22%7D).

### 2.2 Referências externas

- [Cucumber — referência Gherkin](https://cucumber.io/docs/gherkin/reference/): estrutura de `Feature`, `Scenario`, `Given`, `When`, `Then` e `Scenario Outline`.
- [Cucumber — Writing better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/): cenários orientados ao comportamento e à linguagem do domínio.
- [Playwright — API testing](https://playwright.dev/docs/api-testing): preparação de estado, chamadas REST e validação de pós-condições com `APIRequestContext`.
- [Playwright — Assertions](https://playwright.dev/docs/test-assertions): uso de asserções explícitas e tentativas automáticas para estados eventualmente consistentes.
- [OWASP — API Broken Function Level Authorization](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/12-API_Testing/04-API_Broken_Function_Level_Authorization): validação de autorização em operações administrativas.

### 2.3 Método

O desenho dos testes combina:

- **particionamento de equivalência:** descontos absolutos, percentuais, válidos e inválidos;
- **análise de valores-limite:** `0`, valor exato do setup, acima do setup e teto absoluto `50`;
- **tabela de decisão:** combinação entre `tipoValor`, `novoValor`, `decrescimo` e `acrescimo`;
- **transição de estados:** campanha ativa/inativa, vigência, versão FEPAS antiga/nova;
- **testes de contrato:** status HTTP, schema público e códigos funcionais;
- **testes de integração:** API, MySQL, cálculo e serialização FEPAS;
- **testes de concorrência:** fotografia única por operação e consistência global do setup;
- **regressão:** fluxo Oracle, payload legado, SHA-1 protocolar e ausência de metadados internos no JSON público.

## 3. Estado atual confirmado no código

| Componente | Comportamento observado | Implicação para o teste |
|---|---|---|
| `PriceService` | Lê uma fotografia de `PricingDiscountLimits`, avalia todas as regras elegíveis e aplica a melhor campanha. | O teste deve provar consistência dos limites durante toda a cotação e desempate determinístico. |
| `GestaoVgPricingRuleImportService` | Lê uma fotografia dos limites por lote, rejeita acréscimo, ambiguidade, divergência de tipo e filtros sem suporte. | O lote deve ser atômico e todos os itens devem usar a mesma política. |
| `VoucherSetupPricingDiscountLimitsProvider` | Usa setup persistido, fallback técnico e teto absoluto de `50`. | Devem ser testados setup válido, ausência, dado inválido e contenção. |
| `VoucherSetupService` | Atualiza a política global em transação e rejeita redução incompatível com campanhas ativas. | Devem ser comprovados replicação global, atualização parcial, concorrência e HTTP `409`. |
| `VoucherBackofficeController` | Expõe `GET` e `PUT /backoffice/vouchers/setup`. | O contrato atual difere do contrato legado documentado no projeto E2E. |
| `GestaoVgPricingRuleController` | Expõe `POST /backoffice/vouchers/pricing-rules/gestao-vg`. | A importação é o ponto oficial para criar e atualizar massa de campanha. |
| `PricesController` | Expõe `GET /prices` com `customerId` e `customerSiteId` em headers. | O cenário deve consultar o mesmo distribuidor/produto usado na campanha. |
| `EffectivePriceStateService` | Ordena os itens, normaliza valores e gera SHA-256 do estado efetivo. | Mesmos itens em ordem diferente não devem mudar o hash; preço ou campanha alterados devem mudá-lo. |
| `SeFepasService` | Compara `price_state_hash` e envia o mesmo estado efetivo calculado. | A versão deve refletir conteúdo, não apenas IDs. |
| `SeFepasUtils` | Usa `finalPrice` nos três campos monetários da tag `404`. | Para R$ 114,99, os três campos devem conter `000000011499`. |

### 3.1 Divergência que exige ajuste na suíte Playwright

O README atual de `ms-voucher-playwright-e2e` ainda descreve a branch `release` como contrato legado, com apenas `PUT /setup`, e possui cenários antigos de acréscimo percentual. O código atual da branch de correção:

- possui `GET` e `PUT /setup`;
- adiciona `maxPercentageDiscount` e `maxAbsoluteDiscount`;
- não possui `notificationChannel` nesta branch;
- proíbe `acrescimo`;
- altera versionamento e serialização FEPAS.

Antes de automatizar este guia, a suíte deve receber um modo de contrato específico, por exemplo `SETUP_CONTRACT=pricing-discount-limits`, e os testes antigos de acréscimo devem passar a validar rejeição.

## 4. Estratégia de execução

### 4.1 Ambientes autorizados

| Ambiente | Execução permitida | Restrições |
|---|---|---|
| Local descartável | Todos os casos, incluindo alteração direta de banco, concorrência e migrations. | Usar dados exclusivos e infraestrutura isolada. |
| `local-hml` | Smoke e leitura por padrão; mutações somente com autorização. | Manter Flyway, jobs e listeners desabilitados quando a aplicação usar dependências compartilhadas. |
| HML | Casos P0/P1 autorizados, com massa reservada e janela coordenada. | Exigir `ALLOW_MUTATION=true`, `ENABLE_MUTATING_E2E=true` e `MUTATION_CONFIRMATION=I_UNDERSTAND_HML_MUTATIONS` na suíte existente. |
| PROD | Somente health check, contrato somente leitura e observabilidade previamente aprovados. | Não criar campanhas, não alterar setup e não provocar carga FEPAS de teste. |

### 4.2 Ordem recomendada

1. Validar migrations em banco descartável.
2. Executar health check e registrar versão implantada.
3. Capturar snapshot do setup, campanhas e versão FEPAS.
4. Validar `GET/PUT /setup`.
5. Validar importação e limites dinâmicos.
6. Validar cálculo, elegibilidade e prioridade.
7. Validar carga FEPAS e versionamento.
8. Validar concorrência, segurança e logs.
9. Restaurar setup e inativar as campanhas da rodada.
10. Anexar evidências e concluir o checklist de aceite.

## 5. Preparação manual

### 5.1 Pré-requisitos

- Java 25, Maven, Node.js 20+, Docker e Docker Compose.
- Branch `issue/STRY0046423` ou artefato gerado a partir dela.
- Token temporário com acesso ao gateway de backoffice.
- Massa exclusiva de distribuidor e produto no fluxo local de preços.
- Acesso somente leitura ao MySQL para evidências.
- Simulador FEPAS/PDV homologado ou captura de protocolo disponível.
- Código de regra exclusivo por execução; não reutilizar códigos de HML.

### 5.2 Variáveis

```bash
export VOUCHER_URL="http://localhost:8001/voucher/v1"
export BACKOFFICE_URL="http://localhost:8001/voucher/v1/backoffice/vouchers"
export ACCESS_TOKEN="<token-temporario>"
export CUSTOMER_ID="100000"
export CUSTOMER_SITE_ID="200000"
export PRODUCT_CODE="0110035"
export TEST_CNPJ="03282579000110"
export TEST_RULE_CODE="990730001"
export SETUP_ID="0f13f3d7-5bd9-4ee5-ae8f-fdd6906566e9"
```

Não registrar o token em evidências, logs de CI ou arquivos versionados.

### 5.3 Subida local usando a suíte existente

```bash
cd PlaywrightSwitchCase/ms-voucher-playwright-e2e
cp .env.local.example .env.local
npm install
npm run infra:up:app
npm run doctor:env
npm run infra:ps
```

Confirmar:

```bash
curl --fail "${VOUCHER_URL}/actuator/health"
```

Resultado esperado:

```json
{"status":"UP"}
```

### 5.4 Regressão automatizada Java antes do teste manual

```bash
mvn -q -DskipTests compile
mvn -q \
  -Dtest=GetPricesTest,GestaoVgPricingRuleImportServiceTest,GestaoVgPricingRuleControllerTest,EffectivePriceStateServiceTest,SeFepasServicePricingTest,SeFepasUtilsTest,VoucherSetupServiceTest,VoucherSetupPricingDiscountLimitsProviderTest,VoucherBackofficeControllerSetupTest \
  test
mvn -q test
```

Os relatórios de desenvolvimento registram 365 testes sem falhas após a parametrização do setup. A equipe de QA deve gerar sua própria evidência na versão candidata.

### 5.5 Snapshot anterior

```sql
SELECT id, consumer_data_required_on_block,
       max_percentage_discount, max_absolute_discount
  FROM voucher_setup
 ORDER BY id;

SELECT codigo_regra, status_regra, tipo_valor, novo_valor, decrescimo,
       data_inicio, data_fim, payload_hash
  FROM gestao_vg_pricing_rule
 WHERE codigo_regra BETWEEN 990730000 AND 990739999
 ORDER BY codigo_regra;

SELECT distributor_id, version, loaded_price_ids, price_state_hash, is_archived
  FROM distributor_product_version
 WHERE distributor_id = <DISTRIBUTOR_ID>
 ORDER BY version;
```

Salvar o resultado com data, ambiente e versão implantada.

### 5.6 Payload-base de setup

```json
{
  "id": "0f13f3d7-5bd9-4ee5-ae8f-fdd6906566e9",
  "consumerDataRequiredOnBlock": "none",
  "maxPercentageDiscount": 40.00,
  "maxAbsoluteDiscount": 30.00
}
```

### 5.7 Payload-base de campanha absoluta

```json
[
  {
    "codigoRegra": 990730001,
    "descricaoRegra": "E2E desconto absoluto",
    "cnpj": "03282579000110",
    "produto": "0110035",
    "tipoValor": "ABSOLUTO",
    "novoValor": 10.00,
    "decrescimo": null,
    "acrescimo": null,
    "statusRegra": "A",
    "dataInicio": "2026-07-30",
    "dataFim": "2026-07-30"
  }
]
```

Datas, CNPJ e produto devem ser ajustados à massa e ao dia real da execução. Omitir filtros opcionais quando eles não forem o objetivo do caso.

### 5.8 Chamadas-base

Consultar setup:

```bash
curl --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${BACKOFFICE_URL}/setup"
```

Atualizar setup:

```bash
curl --silent --show-error \
  -X PUT \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @setup.json \
  "${BACKOFFICE_URL}/setup"
```

Importar campanha:

```bash
curl --silent --show-error \
  -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @pricing-rule.json \
  "${BACKOFFICE_URL}/pricing-rules/gestao-vg"
```

Consultar preço:

```bash
curl --silent --show-error \
  -H "customerId: ${CUSTOMER_ID}" \
  -H "customerSiteId: ${CUSTOMER_SITE_ID}" \
  "${VOUCHER_URL}/prices?code-product=${PRODUCT_CODE}"
```

## 6. Matriz de testes — migrations e setup

| ID | Pri. | Cenário e execução manual | Resultado esperado |
|---|---:|---|---|
| MIG-001 | P0 | Subir banco limpo e executar Flyway até V80. | V79 e V80 aplicadas uma vez; aplicação inicia; `price_state_hash` existe; limites existem com precisão/escala esperadas. |
| MIG-002 | P0 | Atualizar banco com linhas históricas em `distributor_product_version` e `voucher_setup`. | V79 preserva histórico com hash nulo; V80 preenche registros existentes com `50.0000`; nenhum dado legado é perdido. |
| MIG-003 | P1 | Reiniciar a aplicação após as migrations. | Flyway não reaplica scripts; health check permanece `UP`. |
| SET-001 | P0 | Executar `GET /setup` com setup persistido. | HTTP `200`; retorno contém `id`, campo legado e os dois limites efetivos. |
| SET-002 | P0 | Executar `PUT /setup` com `40%` e `R$30`; repetir `GET`. | HTTP `200`; resposta e GET devolvem os mesmos valores; todas as linhas de `voucher_setup` ficam iguais. |
| SET-003 | P0 | Enviar apenas os campos legados, omitindo os dois limites. | HTTP `200`; limites anteriores são preservados, não voltam para `50`. |
| SET-004 | P0 | Enviar exatamente `50.00` nos dois limites. | HTTP `200`, desde que o teto técnico de implantação também seja `50`. |
| SET-005 | P0 | Enviar `0`, `-0.01`, `50.01` e valor acima do teto técnico configurado. | HTTP `400`, código `400.041`; nenhuma linha é alterada. |
| SET-006 | P0 | Manter campanha absoluta ativa de `30`; tentar reduzir `maxAbsoluteDiscount` para `20`. | HTTP `409`, código `409.001`, códigos conflitantes informados; setup permanece inalterado. |
| SET-007 | P0 | Repetir SET-006 para campanha percentual de `40%` e novo limite `35%`. | Mesmo comportamento de conflito e rollback. |
| SET-008 | P1 | Enviar limite igual ao valor da maior campanha ativa. | HTTP `200`; igualdade é aceita. |
| SET-009 | P1 | Fazer `PUT` com um novo UUID de setup. | Registro é criado e a fotografia completa é replicada para todas as linhas globais. |
| SET-010 | P1 | Em banco local, remover todos os registros de setup e executar GET. | HTTP `200`; fallback técnico efetivo é retornado; warning de setup ausente é registrado. |
| SET-011 | P1 | Em banco local, persistir limite nulo, zero ou acima do teto e executar GET/cotação. | Provider usa fallback/contenção; nenhum valor efetivo supera `50`; warning identifica o campo e o setup. |
| SET-012 | P1 | Disparar dois PUTs concorrentes com fotografias diferentes. | Não ocorre estado misto entre campos ou linhas; uma fotografia completa vence; não há erro 500/deadlock não tratado. |
| SET-013 | P2 | Alterar setup enquanto um lote grande de campanha é validado. | O lote inteiro usa uma única fotografia: todos os itens equivalentes são aceitos ou todos rejeitados; nunca há lote dividido entre políticas. |

## 7. Matriz de testes — importação Gestão VG

| ID | Pri. | Cenário e variação | Resultado esperado |
|---|---:|---|---|
| IMP-001 | P0 | Importar desconto absoluto positivo abaixo do limite. | HTTP `200`; `totalCriado=1`; persistência normalizada. |
| IMP-002 | P0 | Importar desconto percentual positivo abaixo do limite. | HTTP `200`; `totalCriado=1`. |
| IMP-003 | P0 | Importar valor exatamente igual ao limite atual do setup. | Aceito. |
| IMP-004 | P0 | Importar `30.01` quando o limite absoluto é `30.00`; repetir com `40.01%` para limite `40%`. | HTTP `400`; erro identifica campo, regra e limite efetivo. |
| IMP-005 | P0 | Enviar `novoValor=0`, `decrescimo=0` e valores negativos. | HTTP `400`; nada é persistido. |
| IMP-006 | P0 | Preencher `novoValor` e `decrescimo` simultaneamente. | HTTP `400` por ambiguidade. |
| IMP-007 | P0 | Não preencher nenhum dos dois descontos. | HTTP `400` por valor obrigatório. |
| IMP-008 | P0 | Preencher `acrescimo`, sozinho ou junto com desconto. | HTTP `400`; acréscimo nunca é aplicado. |
| IMP-009 | P0 | Declarar `tipoValor=ABSOLUTO` com `decrescimo`, e `PERCENTUAL` com `novoValor`. | HTTP `400` por divergência de tipo. |
| IMP-010 | P0 | Preencher separadamente `codigoPz`, `mercado` e `nucleo`. | Cada variação retorna HTTP `400`; filtro não é ignorado silenciosamente. |
| IMP-011 | P1 | Enviar lote com um item válido e um inválido. | Lote inteiro rejeitado; o item válido não é persistido. |
| IMP-012 | P1 | Reenviar exatamente o mesmo payload. | `totalIgnorado=1`; `payload_hash` e `updated_at` não mudam desnecessariamente. |
| IMP-013 | P1 | Reenviar o mesmo `codigoRegra` com desconto alterado. | `totalAtualizado=1`; hash e dados comerciais mudam. |
| IMP-014 | P1 | Reenviar dados semanticamente iguais com máscara de CNPJ, caixa de enum e escala decimal diferentes. | Normalização produz idempotência; item é ignorado. |
| IMP-015 | P1 | Enviar código repetido no mesmo lote, lote vazio, corpo nulo e 1001 itens. | HTTP `400`; mensagens específicas; nenhuma persistência parcial. |
| IMP-016 | P1 | Enviar exatamente 1000 itens válidos e exclusivos em ambiente local. | Lote aceito dentro do limite; totais fecham com 1000. |
| IMP-017 | P1 | Testar `statusRegra`, `tipoValor`, `codPeriodo`, `diaDaSemana`, datas, CNPJ e UF inválidos. | HTTP `400` para cada partição; todos os erros relevantes podem ser acumulados na resposta. |

## 8. Matriz de testes — cálculo, elegibilidade e seleção

| ID | Pri. | Cenário e massa | Resultado esperado |
|---|---:|---|---|
| PRC-001 | P0 | Sem campanha elegível, consultar produto com preço base/líquido conhecido. | Preço permanece inalterado. |
| PRC-002 | P0 | Preço `124,99`, regra absoluta `10,00`. | `netPriceProduct=114,99`; nunca `10,00` nem `124,99`. |
| PRC-003 | P0 | Regressão do relatório: preço `119,99`, regra absoluta `5,00`. | `netPriceProduct=114,99`. |
| PRC-004 | P0 | Preço `120,00`, desconto `10%`. | Preço final `108,00`. |
| PRC-005 | P0 | Relacionamento com `price=124,99` e `netPriceProduct=119,99`; desconto absoluto `5`. | Base usada é `119,99`; final `114,99`. |
| PRC-006 | P1 | `netPriceProduct` nulo e `price` preenchido. | `price` é usado como fallback. |
| PRC-007 | P0 | Duas campanhas: uma mais específica leva a `115`; outra menos específica leva a `110`. | Vence `110`, pois o menor preço final precede especificidade. |
| PRC-008 | P0 | Duas campanhas com mesmo preço final, mas graus de especificidade diferentes. | Vence a mais específica. |
| PRC-009 | P0 | Mesmo preço final e mesma especificidade, códigos `900` e `901`. | Vence o maior `codigoRegra`, `901`. |
| PRC-010 | P0 | Vigência iniciando hoje, terminando hoje e `dataFim=null`. | Fronteiras são inclusivas; as três regras são elegíveis conforme os demais filtros. |
| PRC-011 | P0 | Executar em domingo com `diaDaSemana=1`; depois testar segunda-feira com `2`. | Regra correta é elegível; domingo nunca é convertido para `8`. |
| PRC-012 | P1 | Alterar relógio controlado ao redor de meia-noite no fuso `America/Bahia`. | Elegibilidade usa data e período do fuso de campanha, não o fuso da máquina. |
| PRC-013 | P1 | Testar preço `10,05` e desconto de `50%`; depois `10,15` e `50%`. | Resultados `5,02` e `5,08`, comprovando duas casas e `HALF_EVEN`. |
| PRC-014 | P0 | Inserir localmente regra legada inválida junto com uma válida; repetir somente com inválidas ou resultado não positivo. | Regra inválida é ignorada quando há alternativa; sem resultado válido, HTTP `422` com `422.065`. |
| PRC-015 | P0 | Inspecionar JSON do `GET /prices`. | `appliedPricingRuleCode` e `appliedPricingRulePayloadHash` não aparecem; contrato público permanece compatível. |
| PRC-016 | P1 | Usar distribuidor no caminho de preço Oracle/localização, sem campanha local. | Resposta Oracle não é alterada e o fluxo não depende indevidamente do setup de campanhas. |

## 9. Matriz de testes — FEPAS, PDV e versionamento

### 9.1 Procedimento comum

1. Consultar `GET /prices` e registrar o preço final.
2. Consultar a versão ativa em `distributor_product_version`.
3. Iniciar o ciclo de logon/carga no simulador FEPAS homologado para o mesmo distribuidor.
4. Capturar a resposta `0810`, o bit 47 e as tags `401`/`404`.
5. Decodificar os três campos monetários de 12 posições da tag `404`.
6. Consultar novamente a versão ativa e o `price_state_hash`.
7. Repetir o ciclo sem alterar dados.

Para R$ `114,99`, cada campo monetário deve ser:

```text
000000011499
```

| ID | Pri. | Cenário e execução | Resultado esperado |
|---|---:|---|---|
| FEP-001 | P0 | Campanha absoluta produz `114,99`; iniciar carga. | Os três campos monetários da tag `404` contêm `000000011499`. |
| FEP-002 | P0 | Comparar `GET /prices` e carga FEPAS da mesma rodada. | O valor é idêntico; o PDV não precisa recalcular desconto. |
| FEP-003 | P0 | Versão histórica ativa com `price_state_hash=null`; iniciar primeiro ciclo após deploy. | Uma nova versão coerente é criada e recebe SHA-256 de 64 hexadecimais. |
| FEP-004 | P0 | Repetir o ciclo sem mudar preço, regra ou produtos. | Nenhuma nova versão é criada; versão atual é reutilizada. |
| FEP-005 | P0 | Manter os mesmos `priceId` e alterar desconto de `10` para `11`. | Preço final, hash e versão mudam; tag `404` recebe o novo preço. |
| FEP-006 | P1 | Manter mesmo preço final, mas alterar conteúdo/identidade da regra vencedora. | Como o estado inclui regra e `payload_hash`, o SHA-256 e a versão mudam. |
| FEP-007 | P1 | Produzir o mesmo conjunto de itens em ordem diferente. | Hash canônico permanece igual; não há nova versão. |
| FEP-008 | P0 | Encerrar ou inativar campanha e iniciar novo ciclo. | Preço volta à base/líquido, hash muda e nova versão é criada. |
| FEP-009 | P1 | Solicitar retransmissão de uma versão existente. | O preço promocional é preservado; o serviço não reconstrói preço-base a partir do relacionamento. |
| FEP-010 | P0 | Forçar localmente preço efetivo nulo, zero ou negativo. | Tabela incompleta não é enviada; resposta controlada de erro; nenhuma versão inválida é persistida. |
| FEP-011 | P1 | Comparar o campo protocolar antes e depois da correção. | SHA-1 exigido pela FEPAS permanece compatível; SHA-256 é usado apenas no estado interno. |
| FEP-012 | P1 | Duas consultas consecutivas durante alteração concorrente do setup. | Cada ciclo usa uma fotografia internamente coerente; nenhum payload mistura limites ou preços. |

## 10. Segurança, contrato e observabilidade

| ID | Pri. | Cenário | Resultado esperado |
|---|---:|---|---|
| SEC-001 | P0 | Chamar GET/PUT do setup e POST de importação sem token, com token expirado e com perfil sem privilégio de backoffice. | Gateway retorna `401` ou `403`; nenhuma alteração ocorre. |
| SEC-002 | P1 | Tentar métodos não documentados, como DELETE/PATCH no setup e GET no endpoint de importação. | `404`/`405` ou bloqueio do gateway; nenhuma função administrativa é executada. |
| SEC-003 | P1 | Alterar UUID/código de regra para objetos de outra massa, usando perfil sem escopo. | Autorização do gateway impede acesso indevido conforme a política corporativa. |
| CTR-001 | P0 | Validar Swagger/OpenAPI da versão candidata. | GET/PUT setup e novos campos estão documentados; `acrescimo` não aparece como opção válida; respostas 200/400/409 estão descritas. |
| CTR-002 | P0 | Enviar payload legado de setup sem os novos campos. | Compatibilidade preservada; limites atuais não são apagados. |
| CTR-003 | P1 | Validar `Content-Type`, idioma PT-BR/EN e estrutura de erros. | Respostas têm schema consistente, códigos funcionais e mensagens sem placeholders literais. |
| OBS-001 | P0 | Aplicar campanha e pesquisar logs pelo `codigoRegra` e correlation-id. | Log contém regra, produto, distribuidor, tipo, desconto, preço anterior e final; não contém token/credencial. |
| OBS-002 | P1 | Provocar fallback do provider e conflito de setup. | Warning identifica fallback/contenção; conflito é rastreável e não gera stack trace técnico para o consumidor. |
| OBS-003 | P1 | Provocar `422.065`. | Erro é monitorável por código; logs identificam regras legadas ignoradas sem expor payload completo. |

## 11. Cenários BDD em Gherkin

Os cenários abaixo são a especificação executável de alto nível. Dados técnicos detalhados, IDs e SQL permanecem nas fixtures/steps, não na linguagem de negócio.

```gherkin
# language: pt
@pricing @setup @p0
Funcionalidade: Administrar limites globais de desconto
  Como Gestão VG
  Quero administrar os limites de desconto no setup
  Para que importação e cotação usem a mesma política

  Contexto:
    Dado que o teto técnico absoluto e percentual é 50
    E que possuo autorização de backoffice

  Cenário: Atualizar os limites globais
    Quando atualizo o setup para 30 reais e 40 por cento
    Então a API deve responder com sucesso
    E todos os registros globais devem refletir 30 reais e 40 por cento
    E uma nova consulta deve retornar esses limites

  Esquema do Cenário: Rejeitar limite fora da faixa
    Quando tento configurar o limite "<campo>" com "<valor>"
    Então a API deve responder HTTP 400 com o código "400.041"
    E o setup anterior deve permanecer inalterado

    Exemplos:
      | campo                 | valor |
      | maxAbsoluteDiscount   | 0     |
      | maxAbsoluteDiscount   | -0.01 |
      | maxAbsoluteDiscount   | 50.01 |
      | maxPercentageDiscount | 0     |
      | maxPercentageDiscount | 50.01 |

  Cenário: Impedir redução incompatível com campanha ativa
    Dado que existe uma campanha absoluta ativa de 30 reais
    Quando tento reduzir o limite absoluto para 20 reais
    Então a API deve responder HTTP 409 com o código "409.001"
    E deve informar o código da campanha conflitante
    E nenhum limite deve ser alterado

  Cenário: Preservar limites em payload legado
    Dado que os limites atuais são 30 reais e 40 por cento
    Quando atualizo somente um campo legado do setup
    Então os limites devem continuar em 30 reais e 40 por cento
```

```gherkin
# language: pt
@pricing @import @p0
Funcionalidade: Importar campanhas de desconto
  Como Gestão VG
  Quero enviar campanhas válidas e inequívocas
  Para que o preço seja reduzido dentro da política global

  Esquema do Cenário: Aceitar desconto no limite configurado
    Dado que o setup permite "<limite>"
    Quando importo uma campanha "<tipo>" com desconto "<desconto>"
    Então a campanha deve ser criada
    E o retorno deve contabilizar um item criado

    Exemplos:
      | tipo       | limite | desconto |
      | ABSOLUTO   | 30.00  | 30.00    |
      | PERCENTUAL | 40.00  | 40.00    |

  Esquema do Cenário: Rejeitar definição inválida
    Quando importo uma campanha com "<inconsistencia>"
    Então a API deve responder HTTP 400
    E nenhuma campanha do lote deve ser persistida

    Exemplos:
      | inconsistencia                         |
      | desconto zero                          |
      | desconto acima do setup                |
      | desconto absoluto e percentual juntos  |
      | nenhum desconto                        |
      | acréscimo informado                    |
      | tipo divergente do campo de desconto   |
      | filtro codigoPz informado              |
      | filtro mercado informado               |
      | filtro nucleo informado                |

  Cenário: Reprocessar payload idêntico de forma idempotente
    Dado que uma campanha já foi importada
    Quando reenvio o mesmo conteúdo normalizado
    Então o retorno deve contabilizar um item ignorado
    E o hash persistido não deve mudar

  Cenário: Rejeitar o lote inteiro quando um item é inválido
    Dado um lote com uma campanha válida e outra inválida
    Quando importo o lote
    Então a API deve rejeitar a operação
    E nenhuma das campanhas deve ser persistida
```

```gherkin
# language: pt
@pricing @prices @p0
Funcionalidade: Calcular e selecionar a melhor campanha
  Como consumidor de Vale Gás
  Quero receber o menor preço final válido
  Para obter o maior benefício aplicável

  Cenário: Aplicar desconto absoluto sobre o preço líquido
    Dado um produto com preço líquido de 119,99 reais
    E uma campanha absoluta de 5 reais
    Quando consulto o preço
    Então o preço líquido retornado deve ser 114,99 reais

  Cenário: Aplicar desconto percentual
    Dado um produto com preço líquido de 120 reais
    E uma campanha de desconto de 10 por cento
    Quando consulto o preço
    Então o preço líquido retornado deve ser 108 reais

  Cenário: Priorizar o menor preço antes da especificidade
    Dado uma campanha específica que resulta em 115 reais
    E uma campanha menos específica que resulta em 110 reais
    Quando consulto o preço
    Então o preço líquido retornado deve ser 110 reais

  Cenário: Desempatar por especificidade e código
    Dado campanhas que produzem o mesmo preço final
    Quando uma campanha possui mais filtros válidos
    Então a campanha mais específica deve vencer
    Mas se a especificidade também empatar
    Então deve vencer o maior código de regra

  Cenário: Considerar domingo como dia 1
    Dado que a data de negócio é domingo
    E existe uma campanha configurada para o dia 1
    Quando consulto o preço
    Então a campanha deve ser aplicada

  Cenário: Rejeitar conjunto de regras legadas sem resultado seguro
    Dado que todas as campanhas elegíveis são inconsistentes ou geram preço não positivo
    Quando consulto o preço
    Então a API deve responder com o código "422.065"
```

```gherkin
# language: pt
@pricing @fepas @p0
Funcionalidade: Carregar o preço efetivo no terminal FEPAS
  Como PDV
  Quero receber o preço final já calculado
  Para praticar o mesmo preço publicado pelo ms-voucher

  Cenário: Enviar o preço promocional nos três campos da tag 404
    Dado que a consulta de preço retorna 114,99 reais
    Quando solicito a carga da tabela FEPAS
    Então os três campos monetários da tag 404 devem conter "000000011499"

  Cenário: Criar versão quando o preço muda sem trocar o relacionamento
    Dado uma versão carregada para determinados identificadores de preço
    Quando uma campanha altera o preço final mantendo os mesmos identificadores
    Então uma nova versão deve ser criada
    E o hash de estado deve mudar

  Cenário: Reutilizar versão para estado idêntico
    Dado que a oferta efetiva não mudou
    Quando o terminal repete o ciclo de carga
    Então nenhuma nova versão deve ser criada
    E o preço promocional deve ser preservado

  Cenário: Atualizar a tabela quando a campanha termina
    Dado que o terminal possui uma versão promocional
    Quando a campanha deixa de ser elegível
    Então uma nova versão com o preço base ou líquido deve ser criada
```

## 12. Evidências obrigatórias

Para cada caso executado, registrar:

| Evidência | Conteúdo mínimo |
|---|---|
| Identificação | ID do caso, ambiente, data/hora, executor, versão/tag/commit. |
| Request | Método, path, headers não sensíveis e body mascarado. |
| Response | Status, body, tempo de resposta e correlation-id. |
| Banco | Snapshot antes/depois apenas das linhas relacionadas. |
| FEPAS | Mensagem decodificada, versão, tag `404`, três campos monetários e hash. |
| Logs | Trecho pelo correlation-id, sem credenciais. |
| Resultado | Passou/Falhou/Bloqueado, defeito vinculado e observações. |
| Limpeza | Setup restaurado, campanha inativada e massa liberada. |

Não considerar o caso aprovado apenas pelo HTTP `200`; as pós-condições de banco, preço e FEPAS são parte do resultado.

## 13. Critérios de aceite e saída

### 13.1 Obrigatórios para HML

- Todos os casos P0 executados e aprovados.
- Nenhuma falha aberta com severidade crítica ou alta.
- `GET /prices` e tag `404` apresentam o mesmo preço.
- Alteração de campanha com mesmos IDs cria nova versão.
- Segunda carga sem alteração não cria versão.
- Limites dinâmicos afetam importação e cotação.
- Redução incompatível do setup retorna `409.001` sem persistência.
- Nenhum acréscimo é aceito.
- Nenhum metadado interno é exposto no JSON público.
- Logs e erros não expõem credenciais.

### 13.2 Regressão mínima

- Suíte Maven completa aprovada.
- Health check `UP`.
- Fluxo sem campanha preservado.
- Fluxo Oracle preservado.
- Payload legado de setup preservado.
- SHA-1 protocolar FEPAS preservado.
- Migrations aprovadas em banco limpo e em atualização de banco existente.

### 13.3 Condições de bloqueio

- Falta de simulador/captura FEPAS impede aceitar o fluxo ponta a ponta.
- Falta de massa exclusiva impede testes mutantes em HML.
- Divergência entre Swagger e código deve ser corrigida antes do aceite.
- Campanha ativa real acima do novo limite deve ser tratada antes do deploy.
- Qualquer diferença entre preço do endpoint e preço da tag `404` reprova a entrega.

## 14. Limpeza e restauração

1. Reaplicar via `PUT /setup` a fotografia capturada antes do teste.
2. Inativar as campanhas da rodada por nova importação com `statusRegra=I`.
3. Confirmar que o preço voltou ao baseline.
4. Executar novo ciclo FEPAS somente se isso fizer parte da janela autorizada.
5. Confirmar ausência de campanhas ativas com prefixo/código da rodada.
6. Em ambiente local descartável, encerrar a infraestrutura:

```bash
npm run infra:down
```

Não excluir registros manualmente em HML ou PROD. Se uma limpeza exigir operação sem endpoint autorizado, abrir solicitação operacional.

## 15. Recomendações para automação Playwright

Mapear os casos para:

```text
tests/
├── setup/pricing-discount-limits.spec.ts
├── pricing/import-discount-rules.spec.ts
├── prices/discount-calculation-and-priority.spec.ts
├── e2e/pricing-to-fepas.spec.ts
├── contract/backoffice-pricing-contract.spec.ts
└── security/backoffice-authorization.spec.ts
```

Boas práticas:

- usar IDs deste relatório no nome dos testes;
- usar `test.step` com `Dado`, `Quando` e `Então`;
- manter `workers: 1` para casos que compartilham setup/campanhas;
- gerar `codigoRegra` exclusivo;
- preparar e verificar estado pela API sempre que possível;
- usar SQL apenas para evidência ou cenários defensivos locais;
- usar `expect.poll` para persistência/versionamento eventualmente consistente;
- marcar `@smoke`, `@mutating`, `@pricing`, `@setup`, `@fepas`, `@contract` e `@security`;
- manter mutações bloqueadas em PROD;
- salvar traces e respostas apenas em falha, mascarando tokens;
- restaurar setup e inativar campanhas em `finally`/teardown;
- não usar retries para esconder defeitos determinísticos de regra de negócio.

## 16. Riscos e pontos em aberto

- O README da suíte Playwright está defasado em relação ao contrato atual do setup e precisa ser ajustado antes da automação.
- A validação FEPAS depende de simulador homologado ou captura do protocolo; um teste apenas REST não cobre a principal causa do incidente.
- Os testes temporais são mais confiáveis em ambiente local com `Clock` controlado. Em HML, devem ser agendados para a janela correta ou usar massa sem filtro temporal.
- O controle de autorização está principalmente no gateway; os testes de segurança devem atingir a URL publicada, não apenas a porta interna.
- A mudança do `payload_hash` da regra participa do estado efetivo. Uma alteração sem impacto no preço pode criar nova versão; este comportamento deve ser conhecido por Produto e Operações.

## 17. Glossário

| Termo | Significado | Explicação |
|---|---|---|
| BDD | Behavior-Driven Development | Técnica que descreve o comportamento esperado em linguagem compartilhada por negócio, QA e desenvolvimento. |
| E2E | End-to-End | Teste ponta a ponta que atravessa API, regras, persistência e integrações observáveis. |
| FEPAS | Sistema/protocolo de integração do terminal de venda | No contexto do `ms-voucher`, recebe a tabela de produtos e preços usada pelo PDV. |
| PDV | Ponto de Venda | Terminal que deve praticar o preço final enviado pelo serviço. |
| HML | Homologação | Ambiente compartilhado usado para validação antes de produção. |
| Gherkin | Linguagem estruturada de cenários BDD | Usa palavras-chave como Dado, Quando e Então. |
| SHA-256 | Secure Hash Algorithm de 256 bits | Assina o estado comercial interno para detectar mudanças efetivas. |
| SHA-1 | Secure Hash Algorithm 1 | Algoritmo preservado somente onde o protocolo FEPAS ainda o exige. |
| TLV | Type-Length-Value | Estrutura usada para identificar e transportar tags como `404` na mensagem FEPAS. |
| Estado canônico | Representação estável e ordenada da oferta | Garante que ordem diferente dos mesmos itens gere o mesmo hash. |

## 18. Referências

### Internas

- [`[task] Fix the precification rule issue`](https://app.notion.com/p/3acb3def3e7c807b89b4c21dd29e7de8)
- [`Daily de 29/07/2026`](https://app.notion.com/p/3acb3def3e7c80359155eaed2a279fb0)
- [Projeto `ms-voucher` no Google Drive](https://drive.google.com/drive/folders/184PaSJreDCSOG2iSDO6jlEMTSW_AjnHu)
- [Conversa sobre preço e FEPAS](https://teams.microsoft.com/l/message/19%3a4d35ac12-f224-476b-aac8-ef3cf2b78aee_824f449e-6992-405d-b2b5-ec1c21ab1b8f%40unq.gbl.spaces/1785272097906?context=%7B%22contextType%22:%22chat%22%7D)
- [Conversa sobre limites no setup](https://teams.microsoft.com/l/message/19%3a4d35ac12-f224-476b-aac8-ef3cf2b78aee_824f449e-6992-405d-b2b5-ec1c21ab1b8f%40unq.gbl.spaces/1785359236388?context=%7B%22contextType%22:%22chat%22%7D)

### Técnicas externas

- [Cucumber — Gherkin Reference](https://cucumber.io/docs/gherkin/reference/)
- [Cucumber — Writing better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/)
- [Playwright — API testing](https://playwright.dev/docs/api-testing)
- [Playwright — Assertions](https://playwright.dev/docs/test-assertions)
- [OWASP — API Broken Function Level Authorization](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/12-API_Testing/04-API_Broken_Function_Level_Authorization)
