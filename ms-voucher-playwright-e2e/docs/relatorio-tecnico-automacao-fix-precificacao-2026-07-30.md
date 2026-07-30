# Relatório técnico — Automação E2E da correção de precificação

**Data:** 30/07/2026  
**Projeto de testes:** `ms-voucher-playwright-e2e`  
**Serviço validado:** `ms-voucher`  
**Status:** implementação e validações concluídas

## Resumo executivo

Foi ampliada a regressão automatizada da correção de precificação do `ms-voucher`, cobrindo a governança dos limites globais de desconto, a importação de campanhas da Gestão VG, o cálculo do preço público e a propagação do preço efetivo para o protocolo FEPAS.

A entrega adiciona ou revisa **31 cenários focados** distribuídos em quatro especificações Playwright. Os testes exercitam tanto o caminho feliz quanto as principais fronteiras e proteções comerciais: desconto absoluto como abatimento, desconto percentual, proibição de aumento, limites dinâmicos, atomicidade de lote, prioridade pelo menor preço final, inatividade de campanha, compatibilidade do contrato público e versionamento do estado comercial enviado ao FEPAS.

As decisões foram fundamentadas no [guia BDD/E2E da correção de precificação](./guia_testes_e2e_bdd_fix_precificacao_ms-voucher_2026-07-30.md), na página Notion [[task] Generate BDD and E2E Playwright test scenario for Price Rules](https://app.notion.com/p/3adb3def3e7c800fa5daf0445786e710), no código do serviço alvo e nos padrões já adotados pelo projeto Playwright.

Resultado das validações:

- `npm run lint`: aprovado;
- descoberta Playwright: 31 cenários focados reconhecidos;
- `npm run test:pricing-fix`: **31 aprovados**, sem falhas;
- `npm run test:local`: **42 aprovados e 23 ignorados por guardas de massa/contrato**, sem falhas;
- `mvn -q -DskipTests compile` no `ms-voucher`: aprovado;
- seleção de testes Java críticos para precificação/FEPAS/setup: aprovada;
- `mvn -q test` no `ms-voucher`: **365 aprovados**, sem falhas, erros ou testes ignorados.

## Objetivo e escopo

O objetivo foi transformar as regras descritas em BDD em verificações executáveis contra a API real, preservando os padrões existentes e validando o serviço de ponta a ponta sem alterar seu código-fonte.

O escopo implementado compreende:

1. leitura e atualização dos limites globais de desconto;
2. validação de compatibilidade com payload legado de setup;
3. importação e atualização de regras de preço;
4. validação dos limites dinâmicos configurados;
5. rejeição de aumentos, ambiguidades e filtros sem suporte;
6. atomicidade da importação em lote;
7. cálculo de descontos absolutos e percentuais;
8. seleção da campanha pelo menor preço final;
9. comportamento de campanhas inativas;
10. estabilidade do contrato JSON público;
11. propagação do preço efetivo para a tag `404` do FEPAS;
12. idempotência e versionamento do estado efetivo.

Não foram feitas alterações no repositório do `ms-voucher`. Ele foi inspecionado como fonte técnica e executado como sistema sob teste.

## Fontes analisadas

### Guia BDD/E2E

O [guia local](./guia_testes_e2e_bdd_fix_precificacao_ms-voucher_2026-07-30.md) forneceu:

- a matriz `SET`, `IMP/PRIC`, `PRICE` e `FEP`;
- exemplos de payloads e códigos funcionais;
- as regras de cálculo e precedência;
- as condições de versionamento FEPAS;
- os cuidados com setup, massa, limpeza e execução em ambiente compartilhado.

### Notion

A página Notion [[task] Generate BDD and E2E Playwright test scenario for Price Rules](https://app.notion.com/p/3adb3def3e7c800fa5daf0445786e710) foi consultada pelo conector Notion. Ela registra a tarefa em andamento, confirma o guia manual como referência concluída e mantém a automação Playwright como etapa da entrega.

### Serviço alvo

Foram inspecionados os componentes do `ms-voucher` responsáveis pelas regras exercitadas, principalmente:

- `GestaoVgPricingRuleImportService` e seu controller;
- `PriceService`;
- `VoucherSetupService`;
- `VoucherSetupPricingDiscountLimitsProvider`;
- `EffectivePriceStateService`;
- `SeFepasService`;
- `SeFepasUtils`.

Essa leitura foi importante para validar detalhes que não deveriam ser inferidos apenas pelos exemplos, como os códigos funcionais, a semântica do `novoValor`, o arredondamento, a precedência e o conteúdo utilizado no hash do estado efetivo.

## Estrutura do projeto Playwright

O projeto separa responsabilidades de modo consistente:

```text
ms-voucher-playwright-e2e/
├── docker/
│   ├── docker-compose.local.yml
│   └── ms-voucher-migrations/
├── docs/
├── src/
│   ├── api/       # clientes HTTP e encapsulamento dos endpoints
│   ├── config/    # leitura e validação das variáveis de ambiente
│   ├── data/      # builders e massa dinâmica
│   └── utils/     # asserções, guardas e parsers reutilizáveis
└── tests/
    ├── e2e/
    ├── prices/
    ├── pricing/
    └── setup/
```

As especificações não acessam o banco para criar ou remover campanhas. A preparação, a execução e a limpeza usam os endpoints públicos/oficiais, mantendo o teste próximo do uso real e preservando a trilha de auditoria da aplicação.

## Implementações realizadas

### Configuração e segurança de execução

O contrato de ambiente passou a representar explicitamente a correção:

- `SETUP_CONTRACT=pricing-discount-limits`;
- `SETUP_ID`;
- `PRICING_TECHNICAL_CEILING`;
- `PRICING_MAX_ABSOLUTE_DISCOUNT`;
- `PRICING_MAX_PERCENTAGE_DISCOUNT`;
- `PRICING_ALLOW_LEGACY_CAMPAIGN_REPAIR`;
- `ENABLE_FEPAS_E2E`;
- `FEPAS_DISTRIBUTOR_DOCUMENT`.

Os exemplos `.env` de local, local-HML, HML e produção documentam essas entradas. As mutações continuam protegidas pelas guardas já existentes e o FEPAS exige uma habilitação adicional. Isso impede que cenários comerciais sejam executados acidentalmente em ambiente compartilhado ou produtivo.

Quando variáveis fornecidas pelo processo precisarem prevalecer sobre `.env.local`, a execução deve declarar `PW_PROCESS_ENV_OVERRIDES=true`. Essa opção é explícita para evitar que uma variável genérica da estação redirecione a suíte silenciosamente.

### Massa dinâmica de regras

O builder `src/data/pricingRules.ts` foi alinhado ao domínio:

- domingo usa o valor esperado pelo `DayOfWeek` Java;
- período e dia da semana são derivados no fuso `America/Bahia`;
- as datas usam uma janela relativa ao ano corrente;
- a regra absoluta padrão usa um desconto seguro, e não um preço substituto;
- `tipoValor` é explícito para regras absolutas e percentuais;
- filtros opcionais sem suporte podem ser enviados intencionalmente em testes negativos;
- códigos de regra são únicos por execução;
- a limpeza gera uma nova fotografia inativa da campanha.

O uso de datas e códigos dinâmicos reduz colisões e evita que a suíte envelheça por causa de datas fixas.

### Cliente HTTP e asserções

O cliente do `ms-voucher` ganhou uma operação dedicada ao `POST /se-fepas`. Também foi criada uma asserção reutilizável para respostas funcionais, validando simultaneamente status HTTP e código de negócio.

Essa abordagem mantém os testes orientados ao comportamento, sem repetir detalhes de transporte em cada cenário.

### Cálculo decimal

Os cálculos esperados de percentual usam inteiros escalados e arredondamento `HALF_EVEN`, reproduzindo a semântica monetária do `BigDecimal` Java sem depender do ponto flutuante binário do JavaScript.

Isso evita falsos negativos em valores situados exatamente nas fronteiras de arredondamento.

### Parser FEPAS

Foi criado um utilitário restrito ao que os testes precisam observar:

- construção das requisições de logon e carga;
- leitura da versão informada no TLV;
- localização da primeira tag `404`;
- extração dos três campos monetários da entrada.

Os testes validam o protocolo pela interface externa. O parser não replica a regra de negócio de seleção de preço; ele apenas decodifica a resposta para que o valor decidido pelo serviço possa ser verificado.

### Limpeza e isolamento

Cada campanha ativa criada pela suíte é inativada pela API oficial no `afterEach`. Os testes de setup guardam a fotografia inicial e tentam restaurá-la ao final.

Essa limpeza é deliberadamente idempotente e não apaga registros diretamente. Ainda assim, a execução focada deve usar uma base controlada, pois campanhas preexistentes podem competir pelo menor preço ou impedir a redução dos limites globais.

A migration local `V80.1__local_align_product_id_for_fepas.sql` alinha o identificador do produto semeado com o código esperado na serialização FEPAS. Ela é exclusiva do ambiente Docker local de testes e não altera migrations do serviço alvo.

## Cobertura implementada

### Setup — limites globais

Arquivo: `tests/setup/pricing-discount-limits.spec.ts`

| ID | Regra de negócio verificada |
|---|---|
| SET-001 | Consulta da política efetiva de descontos |
| SET-002 | Atualização e leitura dos dois limites globais |
| SET-003 | Payload legado não apaga limites já vigentes |
| SET-004 | Limite exatamente igual ao teto técnico é aceito |
| SET-005 | Valores fora da faixa são rejeitados sem persistência parcial |
| SET-006 | Redução incompatível com campanha ativa é bloqueada |
| SET-008 | Limite igual à maior campanha ativa é aceito |

### Importação de regras

Arquivo: `tests/pricing/import-pricing-rules.spec.ts`

| ID | Regra de negócio verificada |
|---|---|
| PRIC-001 | Importação válida e normalizações |
| PRIC-002 | Reimportação idêntica é idempotente |
| PRIC-003 | Mesmo `codigoRegra` atualiza a campanha |
| PRIC-004 | Código duplicado no lote é rejeitado |
| PRIC-005 | Lote vazio é rejeitado |
| PRIC-006 | Enums e formatos inválidos são rejeitados |
| PRIC-007 | Intervalo de datas invertido é rejeitado |
| PRIC-008 | Ausência de `tipoValor` é rejeitada pelo contrato vigente |
| PRIC-009 | `novoValor` com `decrescimo` é ambíguo e inválido |
| PRIC-010 | Qualquer tentativa de acréscimo é rejeitada |
| PRIC-011 | Fronteiras dos limites configurados são respeitadas |
| PRIC-012 | Filtros sem suporte falham explicitamente |
| PRIC-013 | Um item inválido impede a persistência do lote inteiro |

### Preço público

Arquivo: `tests/prices/prices.spec.ts`

| ID | Regra de negócio verificada |
|---|---|
| PRICE-001 | Consulta por CNPJ retorna uma lista contratualmente válida |
| PRICE-002 | `novoValor` absoluto é abatido do preço líquido vigente |
| PRICE-003 | Decréscimo percentual usa o preço líquido e arredondamento correto |
| PRICE-004 | Acréscimo é rejeitado e o preço público permanece preservado |
| PRICE-006 | Campanha inativa não altera a oferta |
| PRICE-007 | Menor preço final precede especificidade da campanha |
| PRICE-015 | Metadados internos da campanha não vazam no JSON público |

### Integração preço–FEPAS

Arquivo: `tests/e2e/pricing-to-fepas.spec.ts`

| ID | Regra de negócio verificada |
|---|---|
| FEP-001/FEP-002 | Preço final é propagado aos três campos monetários da tag `404` |
| FEP-004 | Estado efetivo idêntico não cria nova versão |
| FEP-005 | Mudança comercial com os mesmos IDs de preço cria nova versão |
| FEP-008 | Inativação da campanha atualiza a tabela distribuída |

Todos os testes novos ou reescritos possuem bloco de documentação `/** ... */` imediatamente acima do `test(...)`. O texto está em português do Brasil e descreve valor, regra e proteção de negócio, em vez de repetir somente os passos técnicos.

## Decisões técnicas

### `novoValor` absoluto é desconto

O nome do campo pode sugerir substituição, mas o comportamento vigente o trata como abatimento absoluto sobre o preço líquido. Os builders e as expectativas foram corrigidos para refletir essa regra e impedir que uma regressão volte a transformar o campo em preço final.

### Menor preço final antes da especificidade

Quando duas campanhas elegíveis concorrem, a suíte primeiro comprova que vence o menor preço final. Especificidade e código funcionam apenas como critérios posteriores de desempate. Essa ordem protege o benefício econômico concedido ao cliente.

### Setup dinâmico como fonte de verdade

Os testes de fronteira não codificam permanentemente os limites comerciais. Eles consultam ou configuram uma fotografia válida e usam essa fotografia para testar igualdade, excesso e conflito. O teto técnico permanece configurável para que a suíte represente a implantação testada.

### Estado FEPAS inclui conteúdo comercial

O teste de versionamento mantém os identificadores de preço estáveis e muda a campanha aplicada. A versão precisa avançar mesmo quando o SHA-1 do protocolo continua igual, pois o estado efetivo contém também o preço comercial distribuído.

### Execução serial

O projeto mantém `workers: 1` porque setup, campanhas e preço efetivo compartilham estado. Paralelizar esses casos sem particionamento de base criaria competição não determinística entre campanhas.

## Evidências de validação

### Projeto Playwright

Execução focada em ambiente Docker isolado e descartável:

```text
npm run test:pricing-fix
31 passed (3.6s)
```

Execução completa no mesmo ambiente:

```text
npm run test:local
42 passed
23 skipped
0 failed
```

Os 23 casos ignorados dependem de massas específicas de lote/vale ou de outro contrato de setup/canal de notificação. As guardas mantiveram esses cenários fora da execução, como projetado.

Também foram aprovados:

```text
npm run lint
npx playwright test --list
```

### Serviço `ms-voucher`

O projeto alvo compilou e seus testes críticos de setup, importação, preço efetivo e FEPAS passaram. A suíte Maven completa produziu:

```text
47 relatórios de teste
365 testes
0 falhas
0 erros
0 ignorados
```

Os avisos de instrumentação dinâmica do Mockito/JDK e os logs de exceções esperadas por testes negativos não causaram falhas.

### Ambiente de validação

Foi criado um projeto Docker isolado, com portas e volumes próprios, para impedir interferência da base local compartilhada. Após os testes, somente esse projeto temporário foi removido com seus volumes. Containers e dados do projeto Docker padrão não foram alterados.

## Riscos e limitações

### Estado compartilhado

Uma base que já contenha campanhas ativas acima dos limites desejados pode responder `409.001` durante o setup. Campanhas anteriores também podem vencer a seleção por menor preço. Para regressão determinística, deve-se usar base descartável ou massa reservada e previamente conhecida.

### Compatibilidade entre versões

O contrato de setup de precificação não é o mesmo contrato que expõe `notificationChannel`. A variável `SETUP_CONTRACT` seleciona a versão esperada e as guardas evitam afirmar compatibilidade onde ela não existe.

### FEPAS opt-in

Os cenários FEPAS modificam o estado efetivo de distribuição. Eles só devem ser habilitados em ambiente autorizado com documento de distribuidor conhecido. Em HML compartilhado, além do opt-in específico, permanecem obrigatórias todas as confirmações de mutação do projeto.

### Migração local de produto

O alinhamento do identificador do produto é uma conveniência da massa Docker. Ambientes reais precisam possuir relacionamento consistente entre produto, preço e distribuidor; a suíte não deve corrigir dados de HML ou produção.

## Comandos de execução

Regressão focada:

```bash
npm run test:pricing-fix
```

Domínios separados:

```bash
npm run test:setup
npm run test:pricing
npm run test:prices
npm run test:fepas
```

Para FEPAS local mutante:

```dotenv
ALLOW_MUTATION=true
ENABLE_MUTATING_E2E=true
ENABLE_FEPAS_E2E=true
FEPAS_DISTRIBUTOR_DOCUMENT=03282579000110
```

## Recomendações

1. Executar `test:pricing-fix` em uma base efêmera no pipeline do `ms-voucher`.
2. Reservar documentos e produtos exclusivos quando a execução precisar ocorrer em ambiente compartilhado.
3. Manter o FEPAS fora do smoke de ambientes compartilhados e executá-lo em estágio controlado.
4. Tratar os códigos funcionais e o contrato público verificados pela suíte como parte da compatibilidade da API.
5. Preservar a limpeza por inativação oficial para manter histórico e auditoria.
6. Avaliar futuramente os cenários restantes da matriz do guia, principalmente desempates completos por especificidade/código e combinações adicionais de filtros suportados.

## Conclusão

A automação cobre o encadeamento crítico da correção: a configuração governa o que pode ser importado, a campanha altera corretamente o preço público e o preço efetivo chega ao FEPAS com versionamento coerente. A suíte foi estruturada para evidenciar regras comerciais, proteger ambientes sensíveis e reduzir falsos resultados causados por datas, arredondamento ou estado residual.

As verificações Playwright e Maven concluíram sem regressões no ambiente isolado utilizado para a entrega.
