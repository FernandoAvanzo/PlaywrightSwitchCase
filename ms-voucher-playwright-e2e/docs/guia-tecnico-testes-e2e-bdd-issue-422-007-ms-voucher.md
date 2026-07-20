# Guia técnico de testes E2E e BDD — tratamento do código `422.007` na operação em lote do `ms-voucher`

**Data:** 17/07/2026  
**Projeto:** `ms-voucher`  
**Branch de referência:** `issue/STRY0048887`  
**Task:** `[task] issue "code": "422.062" and not be used in the batch operation`  
**Escopo principal:** `POST /voucher-batch-operations/block`, processamento assíncrono dos itens e fluxo de troca de CIA  
**Idioma do relatório:** Português do Brasil

## 1. Objetivo

Este guia define a estratégia, a massa, os cenários BDD, os critérios de aceite e o roteiro de execução manual necessários para validar a correção da classificação de falta de estoque no fluxo de bloqueio de Vales em lote.

A entrega deve comprovar que:

- estoque insuficiente de Vales `NAO_VENDIDO` para gerar o Vale substituto é tratado como falha funcional `422.007`;
- o erro `422.062` continua reservado para ausência de latitude/longitude no fluxo aplicável;
- falhas técnicas reais continuam protegidas pelo fallback `500.000`;
- os itens de um lote misto são processados de forma independente;
- latitude e longitude são propagadas até o bloqueio de cada item;
- a mensagem PT-BR de `422.007` é devolvida com acentuação correta;
- a resposta pública não expõe códigos, argumentos internos, stack trace ou detalhes de infraestrutura.

## 2. Resumo executivo da análise

A correção não adiciona tratamento especial para `422.062`. O processador em lote já preserva qualquer `UnprocessableEntityException`, inclusive `422.062`, e copia `orderLatitude` e `orderLongitude` para cada `VoucherBlockRequest`.

O defeito estava em `VoucherSellingService.obtainAndLockVouchers(...)`: quando o repositório devolvia menos Vales do que a quantidade solicitada, a condição de negócio era classificada como `InternalServerErrorException`, fazendo o lote persistir o fallback `500.000` e mostrar “Erro interno do servidor.”.

Após a alteração:

| Condição | Classificação interna | Resultado público esperado no item |
|---|---|---|
| Lista com quantidade menor que a solicitada | `422.007` | `ERROR` + “Não foi possível obter vouchers o suficiente.” |
| Lista com quantidade exata | fluxo normal | `COMPLETED` |
| Retorno `null` do repositório | `500.000` | `ERROR` + “Erro interno do servidor.” |
| Latitude/longitude ausentes no fluxo de troca de CIA | `422.062` | `ERROR` + mensagem com a CIA |
| Vale inexistente | `422.064` | `ERROR` + mensagem com o código do Vale |

O contrato HTTP não foi alterado. O `messageCode` e seus argumentos são internos; o DTO público de cada item contém apenas `voucherCode`, `status` e `message`, além dos identificadores e datas.

## 3. Fontes e evidências analisadas

### 3.1 Fontes funcionais e técnicas

- [Task no Notion — issue `422.062` na operação em lote](https://app.notion.com/p/3a0b3def3e7c8011ab55dee45ac17a61)
- relatório anexado `relatorio-tecnico-issue-422-007-operacao-lote-ms-voucher.md`;
- [README do projeto](https://drive.google.com/file/d/1gG-mFPx15WGTc4BVSrrtN5TXamOeDh-0/view?usp=drivesdk);
- [relatório técnico anterior da suíte BDD/E2E](https://drive.google.com/file/d/1-i_8wlxSch1bi11-Ckmrk5wGVDV-av9v/view?usp=drivesdk);
- [Swagger da API](https://drive.google.com/file/d/19S7MGJnuyX7OLLVg-p36zm0ok77pVbYe/view?usp=drivesdk).

### 3.2 Código-fonte rastreado

| Arquivo | Evidência relevante |
|---|---|
| [`VoucherBatchOperationController.java`](https://drive.google.com/file/d/1LX5ArcpVITHjKtjAu0eyfhhGRj8dXypf/view?usp=drivesdk) | `POST /voucher-batch-operations/block` retorna `201`; `GET /voucher-batch-operations/{id}` retorna o estado atual. |
| [`VoucherBatchOperationService.java`](https://drive.google.com/file/d/1Y4oNyduQicrQCzfs6MBgdhyKH8dpNtJC/view?usp=drivesdk) | cria a operação em `NOT_STARTED`, limita o lote a 100 Vales, persiste o locale e publica o evento assíncrono. |
| [`VoucherBatchOperationProcessingService.java`](https://drive.google.com/file/d/1BwvoP8GXIchdrXglP72edC5K3GXtS8ef/view?usp=drivesdk) | processa cada item isoladamente, propaga coordenadas, preserva exceções funcionais e aplica `500.000` a falhas inesperadas. |
| [`VoucherSellingService.java`](https://drive.google.com/file/d/1J7_kQaPh75N8QIPrXpfBV7XG9cA5Yb36/view?usp=drivesdk) | diferencia estoque insuficiente (`422.007`) de retorno nulo do repositório (erro técnico). |
| [`VoucherBatchBlockRequest.java`](https://drive.google.com/file/d/1VKLkHXklsB-DuHzL0yLg9i9qcZY-aZf-/view?usp=drivesdk) | contrato de entrada e lista de 1 a 100 Vales. |
| [`VoucherBatchItemResponse.java`](https://drive.google.com/file/d/19HiFGRh9ZCd9s6dpspnA1mqq2WzC_Ppm/view?usp=drivesdk) | confirma que a resposta pública contém `message`, mas não `messageCode`. |
| [`VoucherBatchItemDomain.java`](https://drive.google.com/file/d/1OPdD1h9H3nDsCRNprs6qPkgF3yR68WXc/view?usp=drivesdk) | persiste internamente `message_code`, `message_arguments`, `message_detail` e mensagem compatível com registros legados. |
| [`Messages.java`](https://drive.google.com/file/d/1eLNuze5bzeFd6QFaJ-P3F__BSrQHs-nf/view?usp=drivesdk) | mapeia `422.007`, `422.062`, `422.064` e `500.000`. |
| [`messages_pt_BR.properties`](https://drive.google.com/file/d/1wCEY47_HQ2UDNc7_T4fXuIyFASO005Do/view?usp=drivesdk) | contém as mensagens localizadas, incluindo “possível” com acento. |
| [`VoucherSellingTest.java`](https://drive.google.com/file/d/1qVwfbARkXl-VFsPKjRpQXxjzvI2bCcSD/view?usp=drivesdk) | cobre lista insuficiente, quantidade exata e retorno nulo. |
| [`VoucherBatchOperationProcessingServiceTest.java`](https://drive.google.com/file/d/1laWxyNfi82uYDkrgpdcEi36qdkSXBNV8/view?usp=drivesdk) | cobre coordenadas, `422.062`, lote misto, localização e fallback técnico. |

## 4. Escopo e níveis de teste

### 4.1 Dentro do escopo

- criação e consulta de operação de bloqueio em lote;
- processamento assíncrono e independência dos itens;
- troca de CIA e obtenção de Vale substituto;
- cenários `422.007`, `422.062`, `422.064` e `500.000`;
- localização PT-BR e sobrescrita por `Accept-Language`;
- persistência do contexto estruturado da mensagem;
- atomicidade do item que falha;
- webhook opcional da operação;
- validações mínimas do contrato diretamente relacionadas ao lote.

### 4.2 Fora do escopo funcional da alteração

- mudança de DTO, Swagger, controller, banco ou migration;
- revisão geral de todos os códigos funcionais do `ms-voucher`;
- validação completa de venda, cancelamento, precificação ou notificações;
- reclassificação de outros `InternalServerErrorException` do fluxo de troca de CIA.

### 4.3 Abordagem

| Nível | Objetivo | Ambiente recomendado |
|---|---|---|
| Unidade/componente | forçar retorno menor, exato ou `null` do repositório de forma determinística | local, com Mockito |
| Integração entre serviços | validar persistência de código/argumentos, localização e independência dos itens | local/test profile |
| E2E caixa-preta | validar contrato HTTP, processamento assíncrono e mensagens públicas | ambiente local integrado ou HML controlado |
| E2E com observabilidade | confirmar código interno, logs e ausência de efeitos parciais | HML controlado, com acesso somente leitura ao banco/logs |

Falhas como retorno `null` do repositório não devem ser induzidas em um HML compartilhado. Elas pertencem aos testes controlados de unidade/componente.

## 5. Ambiente e pré-condições

### 5.1 Requisitos técnicos

- JDK 25;
- Maven;
- Docker, quando a execução local depender de serviços em contêiner;
- JAR `ultragaz-audit-logging` instalado no repositório Maven local conforme o README;
- MySQL acessível e schema do `ms-voucher` atualizado;
- consumidor responsável pelo evento de operação em lote habilitado;
- integrações externas necessárias ao fluxo configuradas ou substituídas por stubs;
- `curl` e `jq` para a execução manual sugerida;
- acesso aos logs por `correlation-id` ou pelo identificador da operação;
- acesso somente leitura às tabelas da operação, caso seja necessária a comprovação do código interno.

Configuração confirmada no projeto:

```text
porta: 8001
context-path: /voucher/v1
BASE_URL local: http://localhost:8001/voucher/v1
```

### 5.2 Limitação conhecida do ambiente

O smoke test documentado encontrou `ORA-12514` para o serviço Oracle `ugsistemashml_low`. O endpoint base da aplicação respondeu `200`, mas casos que dependam desse datasource podem ficar bloqueados até a correção do alias/service name. O erro é ambiental e não foi causado pela task.

### 5.3 Segurança da execução

- não remover estoque real nem alterar status de Vales de outros testes em HML compartilhado;
- preparar massa dedicada ou usar banco local descartável;
- registrar o estado anterior e posterior dos Vales usados;
- não incluir credenciais, tokens, documentos reais ou telefones reais nas evidências;
- usar webhook stub, nunca uma URL de consumidor produtivo;
- alinhar previamente qualquer manipulação de estoque em HML com a equipe responsável.

## 6. Massa de teste necessária

Reservar códigos exclusivos para a rodada e preencher a tabela antes da execução.

| Identificador | Massa necessária | Estado inicial comprovado |
|---|---|---|
| `<VALE_CIA_DIF_SEM_ESTOQUE>` | Vale existente em CIA diferente da revenda | fluxo de troca de CIA aplicável; destino com zero Vales `NAO_VENDIDO` |
| `<VALE_CIA_DIF_COM_ESTOQUE>` | Vale existente em CIA diferente da revenda | destino com exatamente ou pelo menos um Vale substituto elegível |
| `<VALE_MESMA_CIA>` | Vale existente compatível com a revenda | caminho de sucesso sem troca de CIA, se aplicável |
| `<VALE_INEXISTENTE>` | código válido em formato, porém não cadastrado | consulta confirma ausência |
| `<VALE_SEGUNDO_SEM_ESTOQUE>` | segundo Vale para lote misto | não reutilizado por outra execução |
| `<REVENDA_DESTINO>` | revenda ativa usada no bloqueio | `codeResale`, `documentResale` e `addressValidation` válidos |
| `<PRODUTO>` | produto compatível com os Vales | por exemplo `P13`, conforme massa |
| `<CIA_DESTINO>` | organização escolhida no fluxo intercompany | nome conhecido para validar a mensagem `422.062` |

Antes de executar, registrar:

1. organização do Vale original;
2. organização da revenda;
3. organização de destino escolhida pelo fluxo;
4. quantidade de Vales `NAO_VENDIDO` na organização de destino;
5. status e transações relacionadas aos Vales da massa;
6. branch, commit, build, schema e horário da rodada.

## 7. Contrato HTTP sob teste

### 7.1 Criar operação

```http
POST /voucher/v1/voucher-batch-operations/block
Content-Type: application/json
Accept-Language: pt-BR
```

Payload parametrizado:

```json
{
  "caseId": "CASE-422007-001",
  "validationChannel": "APP",
  "codeResale": "<CODIGO_REVENDA>",
  "addressValidation": "<ENDERECO_REVENDA>",
  "documentResale": "<CNPJ_REVENDA>",
  "userType": "CONSUMIDOR_FINAL",
  "codeProduct": "<PRODUTO>",
  "orderLatitude": "-23.550520",
  "orderLongitude": "-46.633308",
  "consumerDocument": "<CPF_TESTE>",
  "consumerPhoneNumber": "<TELEFONE_TESTE>",
  "vouchers": [
    "<VALE_1>",
    "<VALE_2>"
  ]
}
```

Campos obrigatórios no Swagger: `caseId`, `validationChannel`, `codeResale`, `addressValidation`, `documentResale`, `userType`, `codeProduct` e `vouchers`. A lista aceita de 1 a 100 itens. `webhookUrl`, quando usado, deve conter uma URL HTTP/HTTPS codificada em Base64.

Resposta inicial esperada: HTTP `201`, operação `NOT_STARTED`, itens `NOT_STARTED` e `message: null`.

### 7.2 Consultar operação

```http
GET /voucher/v1/voucher-batch-operations/{id}
Accept-Language: pt-BR
```

A consulta deve retornar HTTP `200`. A operação normalmente termina como `COMPLETED` mesmo quando um ou mais itens terminam em `ERROR`, pois `COMPLETED` indica que todos os itens foram tratados. `ERROR` no nível da operação é reservado a falha do contexto externo do processamento.

### 7.3 Observação crítica sobre o código da mensagem

O JSON público não expõe `messageCode`. Portanto:

- validação caixa-preta: conferir `status` e `message`;
- validação de caixa-branca opcional: conferir `message_code` e `message_arguments` no banco ou evidência equivalente nos testes;
- não reprovar a API por ausência de `messageCode`, pois essa ausência é intencional.

## 8. Procedimento manual padrão

### 8.1 Preparar variáveis

```bash
export BASE_URL="http://localhost:8001/voucher/v1"
export ACCEPT_LANGUAGE="pt-BR"
export REQUEST_FILE="request-batch-422007.json"
```

Criar o arquivo `request-batch-422007.json` a partir do payload da seção 7, substituindo todos os placeholders por massa válida.

### 8.2 Criar e capturar a operação

```bash
curl --silent --show-error \
  --request POST \
  --url "$BASE_URL/voucher-batch-operations/block" \
  --header "Content-Type: application/json" \
  --header "Accept-Language: $ACCEPT_LANGUAGE" \
  --data "@$REQUEST_FILE" \
  --write-out "\nHTTP_STATUS:%{http_code}\n" \
  | tee create-response.txt
```

Extrair o JSON da resposta conforme a ferramenta usada e registrar o `id`:

```bash
export OPERATION_ID="<ID_RETORNADO_NO_POST>"
```

### 8.3 Aguardar o processamento assíncrono

```bash
for attempt in $(seq 1 60); do
  curl --silent --show-error \
    --url "$BASE_URL/voucher-batch-operations/$OPERATION_ID" \
    --header "Accept-Language: $ACCEPT_LANGUAGE" \
    --dump-header get-headers.txt \
    --output get-response.json

  pending=$(jq '[.items[] | select(.status == "NOT_STARTED" or .status == "RUNNING")] | length' get-response.json)
  jq '{id, status, items: [.items[] | {voucherCode, status, message}]}' get-response.json

  if [ "$pending" -eq 0 ]; then
    break
  fi

  sleep 2
done
```

O critério de término deve usar os status dos itens, não apenas o status da operação.

### 8.4 Evidência interna opcional

Executar consulta somente leitura, adaptando schema e credenciais do ambiente:

```sql
SELECT
    operation_id,
    voucher_code,
    status,
    message_code,
    message_arguments,
    message,
    message_detail,
    last_update_date
FROM voucher_batch_items
WHERE operation_id = '<OPERATION_ID>'
ORDER BY creation_date;
```

Para `422.007`, a evidência interna esperada é `message_code = '422.007'`. A resposta pública deve continuar sem esse campo.

### 8.5 Coleta de evidências

Salvar, por caso:

- request sanitizado;
- resposta do `POST` e status HTTP;
- última resposta do `GET` e header `Vary`;
- consulta somente leitura do estado anterior e posterior;
- trecho de log por `operationId`, sem credenciais ou dados pessoais;
- versão/commit/build e horário;
- conclusão: `APROVADO`, `REPROVADO`, `BLOQUEADO` ou `NÃO EXECUTADO`.

## 9. Matriz de rastreabilidade

| Requisito/risco | Casos |
|---|---|
| Estoque insuficiente vira `422.007` | E2E-422007-001, CMP-422007-001 |
| Quantidade exata continua com sucesso | E2E-SUCCESS-001, CMP-SUCCESS-001 |
| `422.062` continua funcional e recebe a CIA | E2E-422062-001 |
| Coordenadas são propagadas e não geram falso `422.062` | E2E-COORD-001, INT-COORD-001 |
| Vale inexistente continua `422.064` | E2E-422064-001 |
| Itens do lote são independentes | E2E-MIXED-001 |
| Retorno nulo e falha inesperada continuam `500.000` | CMP-500-001, INT-500-001 |
| Localização e contrato público | E2E-I18N-001, E2E-WEBHOOK-001 |
| Atomicidade e ausência de efeitos parciais | E2E-ROLLBACK-001 |
| Validação de entrada e limite do lote | E2E-CONTRACT-001 |

## 10. Cenários BDD e E2E

### E2E-422007-001 — estoque insuficiente no fluxo de troca de CIA

**Prioridade:** P0 — bloqueante  
**Tipo:** E2E caixa-preta + evidência interna opcional

```gherkin
Funcionalidade: Classificação da falta de estoque no bloqueio em lote

  Cenário: Retornar mensagem funcional quando não há Vale substituto suficiente
    Dado que existe um Vale elegível pertencente a uma CIA diferente da revenda
    E que latitude e longitude válidas foram informadas
    E que a CIA de destino não possui Vale NAO_VENDIDO suficiente
    Quando eu criar uma operação de bloqueio em lote para esse Vale
    E aguardar o processamento assíncrono do item
    Então a operação deve concluir o processamento
    E o item deve terminar com status ERROR
    E a mensagem deve ser "Não foi possível obter vouchers o suficiente."
    E a mensagem não deve ser a mensagem de localização ausente
    E a mensagem não deve ser "Erro interno do servidor."
```

Execução:

1. confirmar, sem alterar dados de terceiros, que o destino possui zero Vales elegíveis;
2. enviar o `POST` com `<VALE_CIA_DIF_SEM_ESTOQUE>` e as duas coordenadas;
3. confirmar HTTP `201` e capturar o ID;
4. consultar até nenhum item ficar `NOT_STARTED` ou `RUNNING`;
5. validar `items[0].status = ERROR` e a mensagem exata;
6. opcionalmente, validar `message_code = '422.007'` no banco;
7. validar log `WARN` de estoque insuficiente com organização, quantidade solicitada e encontrada, sem dados sensíveis.

Resultado esperado adicional: nenhuma venda substituta parcial deve permanecer persistida.

### E2E-SUCCESS-001 — quantidade exata disponível

**Prioridade:** P0  
**Tipo:** E2E

```gherkin
  Cenário: Bloquear o Vale quando existe quantidade exata de substitutos
    Dado que existe um Vale em CIA diferente da revenda
    E que a CIA de destino possui a quantidade necessária de Vales NAO_VENDIDO
    E que latitude e longitude válidas foram informadas
    Quando eu solicitar o bloqueio em lote
    Então o item deve terminar com status COMPLETED
    E não deve retornar as mensagens 422.007, 422.062 ou 500.000
```

Execução:

1. reservar massa com estoque suficiente e registrar o Vale substituto esperado;
2. enviar um lote unitário;
3. aguardar o término dos itens;
4. validar item `COMPLETED` e mensagem de sucesso localizada;
5. validar estados e transações resultantes conforme a regra de troca de CIA;
6. garantir que apenas a quantidade solicitada foi consumida.

### E2E-422062-001 — localização obrigatória ausente

**Prioridade:** P0 — regressão  
**Tipo:** E2E

```gherkin
  Cenário: Preservar 422.062 quando latitude e longitude não são enviadas
    Dado que o bloqueio exige geração de novo Vale em outra CIA
    E que latitude e longitude não foram informadas
    Quando eu processar o Vale em uma operação em lote
    Então o item deve terminar com status ERROR
    E a mensagem deve informar que não foi possível gerar o novo Vale na CIA de destino
    E a mensagem deve informar que Latitude/Longitude não foram enviadas
```

Resultado público PT-BR esperado:

```text
Não foi possível gerar o novo Vale na <CIA_DESTINO>. Dados de Latitude/Longitude não enviados.
```

Evidência interna opcional: `message_code = '422.062'` e argumento com o nome da CIA.

### E2E-COORD-001 — coordenadas presentes não podem gerar `422.062`

**Prioridade:** P0  
**Tipo:** E2E de regressão

```gherkin
  Esquema do Cenário: Propagar latitude e longitude para cada item
    Dado um lote que entra no fluxo de troca de CIA
    E que orderLatitude é "<latitude>"
    E que orderLongitude é "<longitude>"
    Quando os itens forem processados
    Então nenhum item deve falhar com a mensagem 422.062 por perda das coordenadas

    Exemplos:
      | latitude   | longitude  |
      | -23.550520 | -46.633308 |
      | -25.428400 | -49.273300 |
```

Para tornar o resultado determinístico, usar massa sem estoque no destino. Nesse caso, o erro correto é `422.007`, o que também comprova que o fluxo passou pela validação de localização.

### E2E-422064-001 — Vale não localizado

**Prioridade:** P1 — regressão  
**Tipo:** E2E

```gherkin
  Cenário: Preservar a mensagem de Vale inexistente
    Dado um código de Vale com formato válido que não existe
    Quando ele for incluído em uma operação de bloqueio em lote
    Então o item deve terminar com status ERROR
    E a mensagem deve identificar o código informado
    E o erro não deve ser convertido para 422.007 ou 500.000
```

Resultado PT-BR esperado:

```text
O Vale <VALE_INEXISTENTE> não foi localizado. Verifique o código informado.
```

Evidência interna opcional: `message_code = '422.064'`.

### E2E-MIXED-001 — lote misto e independência dos itens

**Prioridade:** P0  
**Tipo:** E2E crítico

```gherkin
  Cenário: Processar resultados diferentes no mesmo lote sem efeito cascata
    Dado um lote com um Vale válido
    E um Vale inexistente
    E um Vale que exige substituição sem estoque disponível
    Quando a operação for processada
    Então o Vale válido deve terminar com status COMPLETED
    E o Vale inexistente deve terminar com status ERROR e mensagem 422.064
    E o Vale sem estoque deve terminar com status ERROR e mensagem 422.007
    E a operação deve terminar como COMPLETED após tratar todos os itens
    E nenhuma falha funcional deve ser convertida para erro interno
```

Payload de massa:

```json
"vouchers": [
  "<VALE_MESMA_CIA_OU_SUCESSO>",
  "<VALE_INEXISTENTE>",
  "<VALE_CIA_DIF_SEM_ESTOQUE>"
]
```

Validar também que todos os três itens continuam presentes e associados ao mesmo `operationId`.

### CMP-422007-001 — lista menor do que a quantidade solicitada

**Prioridade:** P0  
**Tipo:** unidade/componente obrigatório

```gherkin
  Cenário: Classificar quantidade insuficiente como erro funcional
    Dado que foram solicitados dois Vales NAO_VENDIDO
    E que o repositório retornou apenas um Vale
    Quando obtainAndLockVouchers for executado
    Então deve ser lançada UnprocessableEntityException
    E o código deve ser 422.007
```

Comando:

```bash
mvn -Dtest=VoucherSellingTest#shouldThrow422007WhenAvailableVoucherQuantityIsInsufficient test
```

### CMP-SUCCESS-001 — lista com quantidade exata

**Prioridade:** P0  
**Tipo:** unidade/componente obrigatório

```gherkin
  Cenário: Retornar a lista quando a quantidade é exata
    Dado que foram solicitados dois Vales
    E que o repositório retornou exatamente dois Vales
    Quando obtainAndLockVouchers for executado
    Então a mesma lista bloqueada deve ser retornada
    E nenhuma exceção deve ser lançada
```

Comando:

```bash
mvn -Dtest=VoucherSellingTest#shouldReturnLockedVouchersWhenExactQuantityIsAvailable test
```

### CMP-500-001 — retorno nulo permanece falha técnica

**Prioridade:** P0 — segurança  
**Tipo:** unidade/componente; não executar por sabotagem de HML

```gherkin
  Cenário: Proteger falha de contrato do repositório
    Dado que o repositório retornou null em vez de uma lista
    Quando obtainAndLockVouchers for executado
    Então deve ser lançada InternalServerErrorException
    E a condição não deve ser classificada como 422.007
```

Comando:

```bash
mvn -Dtest=VoucherSellingTest#shouldKeepNullRepositoryResultAsTechnicalFailure test
```

### INT-500-001 — falha inesperada vira `500.000` no item

**Prioridade:** P0 — segurança  
**Tipo:** integração entre serviços com mock/stub

```gherkin
  Cenário: Manter fallback genérico para falha inesperada
    Dado que o processamento de um item lança uma exceção técnica inesperada
    Quando o lote capturar a falha
    Então o item deve terminar com status ERROR
    E a mensagem pública deve ser "Erro interno do servidor."
    E detalhes técnicos não devem ser expostos
```

Comando recomendado:

```bash
mvn -Dtest=VoucherBatchOperationProcessingServiceTest#shouldKeepUnexpectedFailuresAsInternalServerErrors test
```

Evidência interna esperada: `message_code = '500.000'`.

### INT-COORD-001 — propagação estrutural das coordenadas

**Prioridade:** P0  
**Tipo:** integração entre serviços

```gherkin
  Cenário: Copiar coordenadas da operação para o request de cada Vale
    Dado uma operação com latitude e longitude persistidas
    Quando o processador criar VoucherBlockRequest
    Então o request deve conter exatamente a latitude da operação
    E deve conter exatamente a longitude da operação
```

Executar a classe de teste focada:

```bash
mvn -Dtest=VoucherBatchOperationProcessingServiceTest test
```

### E2E-I18N-001 — locale persistido e sobrescrita no `GET`

**Prioridade:** P1  
**Tipo:** E2E de contrato

```gherkin
  Cenário: Localizar a mesma falha conforme o idioma solicitado
    Dado que uma operação foi criada com Accept-Language pt-BR
    E que um item falhou com código funcional estruturado
    Quando eu consultar a operação sem Accept-Language
    Então a mensagem deve usar o locale pt-BR salvo na criação
    Quando eu consultar a mesma operação com Accept-Language en-US
    Então a mensagem deve ser localizada em inglês
    E o header Vary deve incluir Accept-Language
```

Execução:

```bash
curl --silent --show-error \
  --url "$BASE_URL/voucher-batch-operations/$OPERATION_ID" \
  --dump-header headers-default.txt \
  | jq '.items[] | {voucherCode, status, message}'

curl --silent --show-error \
  --url "$BASE_URL/voucher-batch-operations/$OPERATION_ID" \
  --header "Accept-Language: en-US" \
  --dump-header headers-en.txt \
  | jq '.items[] | {voucherCode, status, message}'
```

O status e a classificação interna devem permanecer iguais; apenas a representação de `message` pode mudar.

### E2E-WEBHOOK-001 — callback usa o contrato público

**Prioridade:** P2  
**Tipo:** E2E com stub HTTP

```gherkin
  Cenário: Enviar callback localizado sem campos internos
    Dado que a operação possui webhookUrl válido codificado em Base64
    E que um item termina com 422.007
    Quando toda a operação for concluída
    Então o webhook deve receber o mesmo DTO público do GET
    E o item deve conter a mensagem localizada
    E não deve conter messageCode, messageArguments, messageDetail ou stack trace
```

Usar um servidor stub local e registrar uma única chamada após o término da operação.

### E2E-ROLLBACK-001 — ausência de efeitos parciais na falha funcional

**Prioridade:** P0  
**Tipo:** E2E com verificação de persistência

```gherkin
  Cenário: Reverter efeitos do item quando não há estoque suficiente
    Dado um Vale que entra no fluxo de troca de CIA sem substituto disponível
    Quando o processamento lançar 422.007
    Então o item deve terminar com ERROR
    E nenhuma venda substituta incompleta deve permanecer
    E nenhum Vale de estoque deve ficar consumido ou bloqueado indevidamente
    E os demais itens do lote devem manter seus próprios resultados
```

Comparar snapshots somente leitura antes e depois da execução. A exceção funcional é uma `RuntimeException`, portanto deve manter o rollback transacional do item.

### E2E-CONTRACT-001 — validações do lote

**Prioridade:** P1 — regressão de contrato  
**Tipo:** E2E

```gherkin
  Esquema do Cenário: Rejeitar lista de Vales inválida
    Dado um request de bloqueio em lote com <condicao>
    Quando eu enviar o POST
    Então a API deve retornar HTTP 400
    E nenhuma operação assíncrona deve ser criada

    Exemplos:
      | condicao                         |
      | lista vouchers ausente           |
      | lista vouchers vazia             |
      | lista com 101 Vales               |
      | código de Vale em formato inválido|
```

Para 101 itens, a mensagem esperada em PT-BR deve informar que `vouchers` aceita no máximo 100 Vales.

## 11. Execução automatizada de apoio

### 11.1 Testes focados

```bash
mvn -Dtest=VoucherSellingTest,VoucherBatchOperationProcessingServiceTest test
```

Resultado de referência registrado no relatório da implementação: 38 testes focados, zero falhas e zero erros.

### 11.2 Regressão completa

```bash
mvn test
```

Resultado de referência registrado: 329 testes, zero falhas, zero erros e zero ignorados.

### 11.3 Build

```bash
mvn -DskipTests package
```

### 11.4 Cobertura

Após `mvn test`, abrir:

```text
target/site/jacoco/index.html
```

Não usar apenas percentual global como critério. Confirmar execução das linhas e ramos de:

- `VoucherSellingService.obtainAndLockVouchers(...)`;
- `VoucherBatchOperationProcessingService.createVoucherBlockRequest(...)`;
- `VoucherBatchOperationProcessingService.extractFallbackMessage(...)`;
- localização do `messageCode` com argumentos.

## 12. Critérios de aceite

A entrega pode ser aprovada quando:

- todos os casos P0 forem aprovados;
- estoque insuficiente produzir mensagem pública de `422.007`, nunca `422.062` ou `500.000`;
- retorno nulo/falha inesperada continuar protegido por `500.000`;
- coordenadas válidas não forem perdidas entre a operação e o request do item;
- lote misto concluir todos os itens de forma independente;
- a operação puder ficar `COMPLETED` com itens `ERROR`, conforme o contrato assíncrono;
- a mensagem PT-BR usar “possível” com acento;
- nenhuma resposta pública ou webhook expuser `messageCode`, argumentos internos, stack trace ou detalhes de banco;
- nenhum efeito parcial de venda/substituição permanecer após `422.007`;
- `mvn test` e o build concluírem sem falhas;
- toda reprovação possuir request, response, massa, horário, build e evidência correlacionável.

## 13. Critérios de bloqueio

Marcar o caso como `BLOQUEADO`, e não como reprovado, quando:

- não houver massa que diferencie a CIA do Vale e da revenda;
- não for possível comprovar a quantidade de estoque no destino;
- o consumidor assíncrono estiver parado;
- o Oracle necessário ao cenário estiver indisponível por `ORA-12514`;
- outra execução consumir a massa dedicada;
- o ambiente não permitir consulta do resultado da operação;
- uma integração externa não controlada impedir a reprodução.

## 14. Modelo de relatório de execução

### 14.1 Identificação da rodada

| Campo | Valor |
|---|---|
| Data/hora | |
| Responsável | |
| Ambiente | Local / HML |
| Branch/commit | |
| Build/versão | |
| Banco/schema | |
| Consumidor do lote | Ativo / Inativo |
| Integrações | Reais / Stubs |
| Massa reservada | |
| Observações | |

### 14.2 Resultado por caso

| Caso | Prioridade | Status | Evidência | Defeito/observação |
|---|---|---|---|---|
| E2E-422007-001 | P0 | NÃO EXECUTADO | | |
| E2E-SUCCESS-001 | P0 | NÃO EXECUTADO | | |
| E2E-422062-001 | P0 | NÃO EXECUTADO | | |
| E2E-COORD-001 | P0 | NÃO EXECUTADO | | |
| E2E-422064-001 | P1 | NÃO EXECUTADO | | |
| E2E-MIXED-001 | P0 | NÃO EXECUTADO | | |
| CMP-422007-001 | P0 | NÃO EXECUTADO | | |
| CMP-SUCCESS-001 | P0 | NÃO EXECUTADO | | |
| CMP-500-001 | P0 | NÃO EXECUTADO | | |
| INT-500-001 | P0 | NÃO EXECUTADO | | |
| INT-COORD-001 | P0 | NÃO EXECUTADO | | |
| E2E-I18N-001 | P1 | NÃO EXECUTADO | | |
| E2E-WEBHOOK-001 | P2 | NÃO EXECUTADO | | |
| E2E-ROLLBACK-001 | P0 | NÃO EXECUTADO | | |
| E2E-CONTRACT-001 | P1 | NÃO EXECUTADO | | |

## 15. Riscos residuais e recomendações

| Risco | Tratamento recomendado |
|---|---|
| Estoque de HML muda durante a execução | reservar massa, registrar contagem imediatamente antes e executar em janela coordenada |
| Mensagem pública não comprova sozinha o código interno | combinar caixa-preta com teste automatizado e, quando permitido, consulta somente leitura |
| Operação `COMPLETED` pode ser interpretada como sucesso de todos os itens | sempre avaliar `items[*].status` e `items[*].message` |
| Retorno `null` não é reproduzível por API real | manter cobertura por Mockito; não adulterar o repositório de HML |
| Outros pontos técnicos ainda podem produzir `500.000` | investigar por `operationId` sem reclassificar genericamente toda exceção técnica |
| Oracle HML com `ORA-12514` | corrigir alias/service name antes dos cenários dependentes do datasource |
| Reuso do mesmo Vale altera o estado da massa | usar Vale novo por cenário ou restaurar somente em ambiente descartável |

## 16. Conclusão

A suíte proposta cobre o comportamento alterado, suas fronteiras e as regressões críticas. O principal critério de qualidade é distinguir corretamente falta de estoque de falha técnica: a primeira deve produzir `422.007` e mensagem funcional; a segunda deve continuar protegida por `500.000`.

O teste E2E mais importante é o lote misto com coordenadas válidas, um item de sucesso, um Vale inexistente e um item intercompany sem estoque. Ele comprova simultaneamente propagação de localização, `422.007`, preservação de `422.064`, independência dos itens e conclusão assíncrona da operação.

## Glossário

| Termo | Significado |
|---|---|
| BDD | Desenvolvimento Orientado por Comportamento; descreve regras como `Dado/Quando/Então`. |
| E2E | Ponta a ponta; valida a composição real entre contrato, aplicação, persistência e integrações. |
| CIA | Companhia/organização operacional usada na vinculação de Vale e revenda. |
| HML | Ambiente de homologação. |
| DTO | Objeto do contrato de entrada ou saída da API. |
| Fallback | resposta segura usada quando a falha não possui classificação funcional reconhecida. |
| Stub | substituto controlado de uma integração externa durante o teste. |
| `NAO_VENDIDO` | status de Vale disponível para venda/substituição no fluxo analisado. |
