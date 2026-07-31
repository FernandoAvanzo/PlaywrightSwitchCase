# Relatório técnico — implementação E2E da compatibilidade de `tipoValor`

**Projeto de automação:** `ms-voucher-playwright-e2e`  
**Projeto alvo:** `ms-voucher`  
**Data da implementação e validação:** 31/07/2026  
**Idioma:** Português (Brasil)

## 1. Resumo executivo

A suíte Playwright foi ampliada para proteger o hotfix que tornou `tipoValor` opcional na
importação de campanhas do Gestão VG. O teste antigo `PRIC-008`, que esperava HTTP 400 quando o
campo não era enviado, foi substituído por uma verificação positiva das modalidades absoluta e
percentual. Também foram adicionados cenários de enum inválido, divergência de modalidade,
idempotência semântica, lotes mistos, rollback integral, entradas nula/em branco e ausência de um
campo de desconto inferível.

A cobertura não termina no HTTP da importação. `PRICE-002` e `PRICE-003` passaram a aplicar
campanhas legadas sem `tipoValor`, enquanto `FEP-001/FEP-002` e o novo `FEP-009` comprovam que a
inferência alcança o preço final e o estado distribuído ao PDV. O cenário `FEP-009` demonstra que
acrescentar a declaração compatível não cria uma versão artificial da tabela FEPAS.

As alterações foram exercitadas contra a aplicação local real. A regressão consolidada de
precificação passou com **40/40 testes**, a suíte Maven completa do `ms-voucher` passou com
**369/369 testes**, e a compilação TypeScript e a coleta Playwright permaneceram válidas.

## 2. Contexto e fontes de requisito

A tarefa do Notion estabelece como regra central a aceitação do contrato legado sem `tipoValor`,
mantendo inferência, validações comerciais, idempotência, cálculo de preço e integração FEPAS
([tarefa no Notion](https://app.notion.com/p/3aeb3def3e7c80d88e4dd1c06f7c84e8)).

O guia técnico de referência detalha a matriz BDD, identifica o comportamento incorreto de
`PRIC-008` e recomenda helpers explícitos para payloads legados, cobertura negativa adicional e
regressão até a tag `404` do FEPAS
([guia de referência](./relatorio_tecnico_guia_testes_bdd_e2e_tipoValor_ms-voucher_2026-07-31.md)).

O código do backend foi usado como terceira fonte de verdade:

- `GestaoVgPricingRuleImportService` valida `tipoValor` como enum opcional e devolve `400.004`
  para valor desconhecido e `400.039` para modalidade incompatível;
- `GestaoVgPricingRuleMapper` infere `ABSOLUTO` a partir de `novoValor` e `PERCENTUAL` a partir de
  `decrescimo`;
- o snapshot canônico sempre usa a modalidade inferida, tornando presença e ausência compatíveis
  semanticamente equivalentes;
- o contrato OpenAPI mantém apenas `codigoRegra` e `statusRegra` na lista `required`.

## 3. Metodologia

A implementação seguiu quatro princípios:

1. **Rastreabilidade de negócio:** cada teste novo possui comentário em estilo Javadoc, em
   português, descrevendo objetivo e regras comerciais observáveis.
2. **Evidência por comportamento:** persistência e atomicidade são comprovadas por contadores,
   reenvio idempotente, cálculo de preço e versão FEPAS, sem acoplamento direto dos testes ao banco.
3. **Isolamento e segurança:** foram mantidos os guards de ambiente, execução com um worker e
   inativação das campanhas criadas pela própria API.
4. **Regressão proporcional ao risco:** validação estática da suíte, testes focados, regressão de
   precificação/FEPAS e suíte Maven completa do serviço alvo.

## 4. Estrutura do projeto Playwright

```text
ms-voucher-playwright-e2e/
├── docker/                         # MySQL, Redis, LocalStack, WireMock e aplicação local
├── docs/                           # Guias, matrizes e relatórios técnicos
├── scripts/                        # Diagnóstico e orquestração dos ambientes
├── src/
│   ├── api/                        # Clientes HTTP orientados aos endpoints do ms-voucher
│   ├── config/                     # Schema e carregamento seguro de variáveis de ambiente
│   ├── data/                       # Builders de payloads e massas de campanha
│   └── utils/                      # Assertions, guards, cálculos decimais e protocolo FEPAS
├── tests/
│   ├── e2e/                        # Fluxos que atravessam preço e integrações
│   ├── prices/                     # Aplicação e contrato público da consulta de preços
│   ├── pricing/                    # Importação e regras comerciais do Gestão VG
│   └── setup/                      # Política dinâmica de limites de desconto
├── playwright.config.ts           # Projetos por ambiente, reporters, trace e execução serial
└── package.json                    # Comandos de qualidade, domínio e infraestrutura
```

### 4.1 Padrões preservados

- `MsVoucherClient` continua centralizando URLs e chamadas HTTP;
- `loadEnv` continua validando configuração com Zod e bloqueando mutações não autorizadas;
- `blockProdMutation`, `skipWhenMutationNotAllowed` e os opt-ins de FEPAS permanecem obrigatórios;
- `expectJsonResponse` e `expectFunctionalError` continuam centralizando contrato HTTP e códigos
  funcionais;
- `afterEach` inativa as campanhas criadas usando a própria API, preservando histórico;
- `workers: 1` evita disputa por setup, campanhas e estado FEPAS compartilhados;
- traces são retidos somente em falha e os reporters existentes não foram alterados.

## 5. Implementações realizadas

### 5.1 Builders explícitos para o contrato legado

O arquivo `src/data/pricingRules.ts` recebeu três funções:

- `withoutTipoValor`: cria uma cópia antes de remover o campo, sem modificar a massa original;
- `legacyAbsoluteRule`: constrói campanha com `novoValor` e omite `tipoValor` deliberadamente;
- `legacyPercentageRule`: constrói campanha com `decrescimo` e omite `tipoValor` deliberadamente.

A decisão de não alterar o default de `pricingRule` e `percentageDiscountRule` preserva os testes
existentes que ainda precisam declarar o enum. A semântica legada fica visível no nome do builder,
o que reduz a chance de uma futura manutenção reinserir o campo por engano.

### 5.2 Importação Gestão VG

O describe de importação foi ampliado para `PRIC-001..PRIC-021`.

| Caso | Regra de negócio protegida |
|---|---|
| `PRIC-008` | infere absoluto e percentual quando `tipoValor` está ausente |
| `PRIC-014` | campo opcional informado continua restrito ao enum conhecido (`400.004`) |
| `PRIC-015` | declaração contrária ao campo de desconto falha nas duas direções (`400.039`) |
| `PRIC-016` | legado → explícito compatível é ignorado, sem atualização artificial |
| `PRIC-017` | lote único aceita campanhas legadas absoluta e percentual |
| `PRIC-018` | item divergente provoca rollback do item legado válido do mesmo lote |
| `PRIC-019` | `null` e espaços são tratados como ausência compatível |
| `PRIC-020` | opcionalidade não permite campanha sem `novoValor` nem `decrescimo` (`400.033`) |
| `PRIC-021` | explícito compatível → legado também é idempotente |

O `PRIC-011` passou a usar builders legados nas fronteiras exata e acima do limite. Assim, os
limites dinâmicos continuam protegidos especificamente no caminho em que a modalidade é inferida.

### 5.3 Consulta de preços

`PRICE-002` e `PRICE-003` agora usam `legacyAbsoluteRule` e `legacyPercentageRule`. As assertions
financeiras existentes foram mantidas:

- desconto absoluto: preço líquido vigente menos `novoValor`;
- desconto percentual: preço líquido vigente menos o percentual, com o mesmo arredondamento
  `HALF_EVEN` adotado pelo serviço;
- resposta pública sem metadados internos da campanha.

Essa mudança é relevante porque um HTTP 200 na importação, isoladamente, não comprova que a
modalidade inferida foi persistida e aplicada corretamente durante a cotação.

### 5.4 Fluxo FEPAS

O caso `FEP-001/FEP-002` passou a criar a campanha absoluta no formato legado. Ele continua
validando que os três campos monetários da primeira tag `404` recebem o preço final em centavos.

O novo `FEP-009` executa a sequência:

1. captura o preço líquido de referência;
2. importa campanha absoluta sem `tipoValor`;
3. carrega a versão FEPAS e valida os três valores da tag `404`;
4. reenvia a mesma campanha com `tipoValor=ABSOLUTO`;
5. confirma `totalIgnorado=1`, sem criação ou atualização;
6. confirma que o preço efetivo permanece o mesmo;
7. consulta a partir da versão já carregada e espera `BIT_70=001`, sem nova tabela pendente.

## 6. Decisões técnicas e justificativas

### 6.1 Sem consulta direta ao banco

A suíte não ganhou credenciais, driver SQL nem endpoint técnico para observar `tipo_valor` e
`payload_hash`. A inferência é demonstrada por efeitos públicos: importação aceita, cálculo correto,
idempotência canônica e estabilidade da versão FEPAS. Isso mantém os testes portáveis entre local e
HML e evita acoplamento ao esquema físico.

### 6.2 Contadores exatos para massas inéditas

Os novos casos geram `codigoRegra` exclusivo e validam `totalCriado`, `totalAtualizado` e
`totalIgnorado` separadamente. Assertions exatas detectam atualização ou colisão residual que uma
verificação genérica de “processado” não mostraria.

### 6.3 Atomicidade comprovada por reenvio

No `PRIC-018`, após a rejeição do lote, o item válido é reenviado sozinho e deve resultar em
`totalCriado=1`. Se tivesse ocorrido persistência parcial, o resultado seria ignorado ou atualizado.
Essa técnica fornece evidência transacional pela API pública.

### 6.4 Idempotência nas duas direções

Foram mantidas duas sequências: ausência → presença compatível e presença compatível → ausência.
O par protege consumidores em ritmos de implantação diferentes e confirma que a ordem das versões
do payload não altera a identidade comercial.

### 6.5 Documentação orientada a negócio

Cada `test(...)` novo é precedido por comentário `/** ... */` em português. O texto descreve a
intenção comercial, as entradas relevantes e os efeitos que devem ser observados, sem reproduzir
detalhes internos da implementação como se fossem o requisito.

## 7. Validações executadas

| Verificação | Resultado |
|---|---:|
| `npm run lint` | PASS — TypeScript sem erros |
| `npx playwright test --list` | PASS — 74 testes coletados em 12 arquivos |
| `npm run infra:config` | PASS — Compose renderizado e validado |
| health local do `ms-voucher` | PASS — status `UP` |
| Playwright de importação | PASS — 21/21 |
| Playwright de preços | PASS — 7/7 |
| `FEP-009` isolado com opt-ins | PASS — 1/1 |
| `npm run test:pricing-fix` com FEPAS habilitado | PASS — 40/40 |
| Maven focado em `GestaoVgPricingRuleImportServiceTest` | PASS — 24/24 |
| `mvn test` no `ms-voucher` | PASS — 369/369 |
| `git diff --check` | PASS — sem erros de whitespace |

O backend validado estava no commit `716915cb` da branch `issue/STRY0046423`. Nenhum arquivo do
repositório `ms-voucher` foi alterado por esta implementação.

### 7.1 Nota operacional sobre sobrescrita de ambiente

Para habilitar FEPAS pontualmente sem editar `.env.local`, foi usado
`PW_PROCESS_ENV_OVERRIDES=true`. Nesse modo, uma variável genérica `BASE_URL` já presente na estação
também passa a ter precedência. A execução confiável deve fixar explicitamente o destino:

```bash
PW_PROCESS_ENV_OVERRIDES=true \
BASE_URL=http://localhost:8001/voucher/v1 \
ENABLE_MUTATING_E2E=true \
ENABLE_FEPAS_E2E=true \
npm run test:pricing-fix
```

Essa observação evita que um teste seja enviado acidentalmente a outro serviço local, como o
LocalStack.

## 8. Riscos residuais e recomendações

- HML continua exigindo CNPJ, produto e documento FEPAS reservados, além da confirmação textual de
  mutação; a passagem local não autoriza execução mutante em ambiente compartilhado.
- A suíte comprova identidade por comportamento público. Caso auditoria regulatória exija o valor
  físico de `payload_hash` e `updated_at`, deve ser produzida evidência SQL separada e sanitizada,
  sem incorporar acesso ao banco no fluxo E2E padrão.
- O contrato OpenAPI foi conferido no backend, mas ainda não existe um teste Playwright estático do
  YAML. Uma futura pipeline pode validar o schema publicado como etapa de contrato independente.
- O aviso do npm sobre `min-release-age` pertence à configuração da estação e não afetou a execução.
- O Maven emite avisos de instrumentação dinâmica do Mockito no JDK 25; a suíte passa hoje, mas o
  projeto deverá configurar o agente conforme a evolução do JDK.

## 9. Critérios de aceite atendidos

- `tipoValor` omitido, nulo ou em branco é aceito quando há exatamente um desconto reconhecido;
- `novoValor` e `decrescimo` determinam, respectivamente, `ABSOLUTO` e `PERCENTUAL`;
- enum inválido e divergência continuam protegidos por `400.004` e `400.039`;
- ausência, ambiguidade, acréscimo e limites de desconto permanecem protegidos;
- lote inválido não persiste o item válido parcialmente;
- presença e ausência compatíveis são idempotentes nas duas direções;
- as duas modalidades legadas alteram o preço final corretamente;
- a tag FEPAS recebe o preço final e não cria versão por um campo redundante;
- a suíte Playwright e o serviço alvo permanecem compiláveis e com regressões verdes.

## 10. Fontes

- [Tarefa: Generate BDD and e2e Playwright test scenario for issue with the new Campain Price](https://app.notion.com/p/3aeb3def3e7c80d88e4dd1c06f7c84e8)
- [Relatório técnico — Guia de testes BDD e E2E da compatibilidade de tipoValor](./relatorio_tecnico_guia_testes_bdd_e2e_tipoValor_ms-voucher_2026-07-31.md)
- `ms-voucher/src/main/java/br/com/ultragaz/voucher/service/GestaoVgPricingRuleImportService.java`
- `ms-voucher/src/main/java/br/com/ultragaz/voucher/mapper/GestaoVgPricingRuleMapper.java`
- `ms-voucher/src/main/resources/swagger/swagger-voucher-backoffice_api_v1.yaml`
