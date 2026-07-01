# Relatório técnico - suíte BDD e E2E manual do ms-voucher

Data: 30/06/2026  
Projeto: `ms-voucher`  
Branch analisada: `release`  
Commit base local: `9c1b627a` (`Merge branch 'feat/STSK0030117' into 'release'`)

## 1. Objetivo

Este relatório consolida o entendimento técnico e funcional das alterações recentes do `ms-voucher` e define uma suíte de testes manuais em BDD/E2E para validar os comportamentos entregues.

O foco da suíte é cobrir:

- configuração de canal de notificação do Vale Gás (`SMS`, `WHATSAPP`, `AMBOS`);
- envio de notificação de venda, cancelamento, reenvio e finalização FEPAS;
- fallback SMS quando o canal configurado é `AMBOS`;
- importação de regras de precificação do Gestão VG;
- aplicação das regras de precificação na consulta de preços por CNPJ;
- atualização de mensagens funcionais PT-BR e propagação correta de argumentos dinâmicos;
- compatibilidade temporária de payload legado e riscos de contrato.

## 2. Fontes analisadas

Relatórios fornecidos:

| Arquivo | Uso na análise |
|---|---|
| `relatorio-tecnico-ms-voucher.md` | visão geral do produto, APIs, integrações e regras centrais do ciclo de vida do voucher |
| `relatorio-tecnico-feat-STSK0030108-whatsapp-voucher-setup.md` | alteração inicial para WhatsApp, fallback SMS e evento genérico de notificação |
| `relatorio_tecnico_voucher_setup_notification_channel.md` | simplificação do contrato público de setup para `notificationChannel` |
| `relatorio_tecnico_gestao_vg_pricing_rules.md` | importação e persistência das regras de precificação do Gestão VG |
| `relatorio_tecnico_mensageria_voucher.md` | revisão de mensagens PT-BR e propagação de placeholders |
| `commands.txt` | não trouxe comandos de commit; continha apenas comando Maven e identificador |

Commits recentes considerados:

| Commit | Escopo |
|---|---|
| `c34ccc99` | introduz integração WhatsApp e evento genérico de notificação |
| `22f2cbc4` | simplifica contrato de canal do setup |
| `15f1d26e` | revisa tratamento do canal de notificação e helper de setup |
| `0fc6dbd9` | adiciona endpoint, domínio, migration e testes da importação Gestão VG |
| `3eb50965` | aplica regras Gestão VG na consulta de preços por CNPJ |
| `94523185` | remove obrigatoriedade funcional de `tipoValor` e passa a inferir o tipo |
| `75b1e305` | ajuste de aplicação de pricing rules |
| `48b8436b` | melhora mensagens funcionais e logging de erros |

Arquivos de código verificados:

- `src/main/java/br/com/ultragaz/voucher/controller/VoucherBackofficeController.java`
- `src/main/java/br/com/ultragaz/voucher/request/VoucherSetupRequest.java`
- `src/main/java/br/com/ultragaz/voucher/response/VoucherSetupResponse.java`
- `src/main/java/br/com/ultragaz/voucher/service/VoucherSetupService.java`
- `src/main/java/br/com/ultragaz/voucher/enums/VoucherNotificationChannel.java`
- `src/main/java/br/com/ultragaz/voucher/utils/VoucherNotificationSetupHelper.java`
- `src/main/java/br/com/ultragaz/voucher/event/SendVoucherNotificationEvent.java`
- `src/main/java/br/com/ultragaz/voucher/event/dispatcher/ApplicationEventDispatcher.java`
- `src/main/java/br/com/ultragaz/voucher/client/service/NotificationClientService.java`
- `src/main/java/br/com/ultragaz/voucher/service/GestaoVgPricingRuleImportService.java`
- `src/main/java/br/com/ultragaz/voucher/service/PriceService.java`
- `src/main/java/br/com/ultragaz/voucher/repository/GestaoVgPricingRuleRepository.java`
- `src/main/resources/internationalization/messages_pt_BR.properties`
- `src/main/resources/db/migration/V75__add_whatsapp_notification_setup.sql`
- `src/main/resources/db/migration/V76__simplify_voucher_setup_notification_channel.sql`
- `src/main/resources/db/migration/V77__create_gestao_vg_pricing_rule.sql`
- `src/main/resources/swagger/swagger-voucher-backoffice_api_v1.yaml`

## 3. Visão do projeto

O `ms-voucher` é o microserviço responsável pelo ciclo de vida do Vale Gás Digital. Ele expõe APIs REST sob `/voucher/v1`, persiste dados transacionais em MySQL, consulta preços em Oracle ou base local, usa Redis para limites de venda, integra transações com SOA/EBS via SOAP, publica eventos em SQS/Events Hub e envia notificações por `ms-notification`.

Fluxos relevantes para esta suíte:

| Fluxo | Papel no negócio |
|---|---|
| Setup global de voucher | controla regras globais de bloqueio e canal de envio do código |
| Venda | gera voucher vendido, transação, eventos de integração e notificação ao consumidor |
| Cancelamento | altera voucher para cancelado, integra o cancelamento e notifica consumidor quando aplicável |
| Reenvio | reenvia o código do voucher a partir do NSU de venda |
| FEPAS | conclui venda iniciada por TEF/Software Express e dispara eventos posteriores |
| Gestão VG pricing rules | recebe campanhas/regras comerciais externas e altera preço final de consulta por CNPJ |
| Mensagens funcionais | retorna mensagens PT-BR de validação e regra de negócio para consumidores internos/externos |

## 4. Regras de negócio consolidadas

### 4.1 Setup e canal de notificação

Endpoint interno:

```http
GET /voucher/v1/backoffice/vouchers/setup
PUT /voucher/v1/backoffice/vouchers/setup
```

Endpoint de gateway documentado:

```http
GET /residential/voucher-backoffice/v1/vouchers/setup
PUT /residential/voucher-backoffice/v1/vouchers/setup
```

Regras:

| Regra | Comportamento esperado |
|---|---|
| Canal obrigatório em atualização nova | `PUT /setup` exige `notificationChannel`, exceto payload legado com `isSendSms` |
| Canais aceitos | `SMS`, `WHATSAPP`, `AMBOS` |
| Canal inválido | valores como `EMAIL` ou `NONE` devem retornar `400` |
| Default sem registro | setup normalizado para `id=default`, `consumerDataRequiredOnBlock=NONE` e `notificationChannel=SMS` |
| Compatibilidade legada | `isSendSms=true` sem `notificationChannel` é interpretado como `SMS` |
| Campo legado na resposta | `isSendSms` não deve aparecer na resposta |
| Campos técnicos antigos | `fallbackChannel`, `sendWhatsapp`, `sendSms`, `sendSmsFallback` e templates WhatsApp não devem aparecer na resposta |
| `AMBOS` | não significa envio simultâneo; significa WhatsApp primário com SMS fallback |
| Canal físico | dispatcher só envia `SMS` ou `WHATSAPP`; `AMBOS` nunca deve ser enviado diretamente ao `ms-notification` |

### 4.2 Envio de notificação

Regras:

| Fluxo | Regra |
|---|---|
| Venda com `SMS` | envia SMS conforme comportamento legado: request, subtipo ou `distributor.isSendSms()` |
| Venda com `WHATSAPP` | envia WhatsApp quando há telefone válido e o request não define `mustSendSms=false` |
| Venda com `AMBOS` | tenta WhatsApp; se falhar, envia SMS fallback |
| Cancelamento com WhatsApp | envia notificação mesmo que `distributor.isSendSms()` esteja falso |
| Cancelamento com SMS | mantém regra legada baseada em `distributor.isSendSms()` |
| Reenvio | usa o canal configurado; em `AMBOS`, tenta WhatsApp e usa SMS se WhatsApp falhar |
| FEPAS | ao finalizar venda, publica notificação seguindo o setup global |
| Telefone ausente/inválido | não deve enviar notificação |
| Logs | telefone deve ser mascarado nos logs novos de envio |

### 4.3 Regras de precificação Gestão VG

Endpoint interno:

```http
POST /voucher/v1/backoffice/vouchers/pricing-rules/gestao-vg
```

Endpoint de gateway documentado:

```http
POST /residential/voucher-backoffice/v1/vouchers/pricing-rules/gestao-vg
```

Regras de importação:

| Regra | Comportamento esperado |
|---|---|
| Payload | deve ser array JSON |
| Tamanho | lote deve ter 1 a 1000 itens |
| `codigoRegra` | obrigatório, positivo e único dentro do lote |
| Upsert | chave idempotente é `codigoRegra` |
| Idempotência | payload normalizado igual é contabilizado como `totalIgnorado` |
| Atualização | payload alterado para mesmo `codigoRegra` atualiza a regra |
| `statusRegra` | obrigatório; aceita `A` ou `I` |
| `codPeriodo` | opcional; aceita `MAN`, `TAR`, `NOI`, `MAD` |
| `diaDaSemana` | opcional; deve estar entre 1 e 7 |
| Vigência ativa | regra ativa exige `dataInicio` |
| Datas | `dataFim` não pode ser anterior a `dataInicio` |
| Valor | deve informar `novoValor`, `decrescimo` ou `acrescimo` |
| Ambiguidade | `novoValor` não pode ser combinado com `decrescimo` ou `acrescimo` |
| Percentual composto | `decrescimo` e `acrescimo` juntos são aceitos como regra percentual |
| `tipoValor` | é ignorado como fonte de verdade e inferido pelos campos de valor |
| CNPJ | máscara é aceita; persistência normalizada com 14 dígitos |
| UF | deve ter duas letras; persistência em caixa alta |
| Observabilidade | logs devem conter metadados e correlação, não payload completo |

Ponto de atenção de contrato: o Swagger atual ainda lista `tipoValor` como obrigatório em `GestaoVgPricingRuleRequest`, mas o código removeu essa obrigatoriedade e infere o tipo. A suíte inclui caso específico para registrar esse desalinhamento.

### 4.4 Aplicação de pricing rules em `GET /prices`

Endpoint:

```http
GET /voucher/v1/prices
```

Regras:

| Regra | Comportamento esperado |
|---|---|
| Método por CNPJ | regras Gestão VG são consultadas e podem alterar `netPriceProduct` |
| Método por localização/Oracle | regras Gestão VG não devem ser consultadas |
| Elegibilidade | regra deve estar ativa, vigente e compatível com filtros informados |
| Filtros | CNPJ, dia da semana, período, produto, cidade, UF, micromercado e CIA participam da elegibilidade |
| Prioridade | entre regras elegíveis, vence a mais específica; empate usa maior `codigoRegra` pelo comparator atual |
| Valor absoluto | `novoValor` substitui o preço final |
| Percentual de desconto | `decrescimo` reduz o preço final atual |
| Percentual de acréscimo | `acrescimo` aumenta o preço final atual |
| Escala | preço calculado deve retornar com escala de 2 casas, usando arredondamento `HALF_EVEN` |

### 4.5 Mensagens funcionais PT-BR

Regras:

| Código | Validação esperada |
|---|---|
| `422.014` | limite de vales por pedido inclui o limite configurado |
| `422.028` | telefone inválido ou ausente para envio de SMS/notificação |
| `422.031` | canal de validação inválido ou vazio |
| `422.041` | limite mensal atingido exibe limite mensal configurado |
| `422.044` | reserva inválida exibe status atual do vale |
| `422.045` | cancelamento de reserva inválido exibe status atual do vale |
| `422.051` | confirmação de venda já realizada |
| `422.052` | venda não permitida exibe status atual |
| `422.053` | limite diário atingido exibe saldo restante diário |
| `422.056` | distribuidor sem endereço principal |
| `422.057` | venda por barcode limitada a um vale |
| `422.058` | produto incompatível no bloqueio |
| `422.059` | falha de cadastro intercompany |
| `422.061` | id externo FEPAS ausente exibe o id informado |
| `422.063` | divergência de CIA entre revenda de reserva e bloqueio |

Critério comum: nenhuma resposta funcional deve expor placeholder literal como `{0}`.

## 5. Estratégia de testes

A suíte proposta combina BDD e E2E manual porque as mudanças alteram contratos HTTP, persistência, efeitos assíncronos, integração externa e mensagens de erro. Testes unitários já existem para parte do comportamento, mas os maiores riscos estão na composição entre camadas.

Justificativas:

| Abordagem | Justificativa |
|---|---|
| BDD | traduz regras de negócio em cenários verificáveis por QA, negócio e engenharia |
| E2E manual | valida contrato real, banco, eventos pós-commit, cliente de notificação e respostas HTTP |
| Stubs para integrações | WhatsApp, SMS, SOA, Oracle e SQS podem gerar efeitos externos; stub reduz risco operacional e torna falhas reproduzíveis |
| Validação em banco | necessária para provar migrations, normalização, idempotência e upsert |
| Verificação de logs | necessária para confirmar mascaramento de telefone e ausência de payload sensível |
| Matriz de regressão | protege comportamento legado de SMS, setup e mensagens existentes |

## 6. Ambiente manual recomendado

### 6.1 Pré-condições técnicas

- JDK 25, Maven e Docker disponíveis.
- Jar interno de auditoria instalado no Maven local, conforme instrução do repositório.
- Banco MySQL com migrations `V75`, `V76` e `V77` aplicadas.
- Redis disponível quando o teste envolver limite diário/mensal.
- `ms-notification` substituído por stub HTTP que registre chamadas a `/notification/v1/sms` e `/notification/v1/whatsapp`.
- Integrações SOA/Oracle/SQS preferencialmente stubadas ou isoladas em ambiente de homologação controlado.
- Jobs e consumers assíncronos desligados em execução local, exceto quando o caso exigir explicitamente o consumidor.

Base local sugerida:

```text
BASE_URL=http://localhost:8001/voucher/v1
BACKOFFICE_SETUP=$BASE_URL/backoffice/vouchers/setup
PRICING_RULES=$BASE_URL/backoffice/vouchers/pricing-rules/gestao-vg
PRICES=$BASE_URL/prices
```

### 6.2 Dados manuais parametrizados

Substituir pelos valores válidos do ambiente:

| Placeholder | Descrição |
|---|---|
| `<CUSTOMER_ID>` | distribuidor ativo |
| `<CUSTOMER_SITE_ID>` | endereço/site ativo do distribuidor |
| `<CNPJ_DISTRIBUIDOR>` | CNPJ normalizado ou mascarado do distribuidor |
| `<PRODUCT_CODE>` | produto com preço local ativo |
| `<PRODUCT_CODE_BARCODE>` | produto inferível por barcode, se necessário |
| `<PHONE_DDD>` e `<PHONE_NUMBER>` | telefone válido para notificação |
| `<NSU_VENDA>` | NSU gerado em uma venda válida |
| `<AUTH_CODE>` | código de autorização de voucher válido |
| `<FEPAS_EFFECTIVE_ID>` | id externo de venda FEPAS |

## 7. Matriz de rastreabilidade

| Tema | Casos |
|---|---|
| Setup público e legado | SETUP-001 a SETUP-007 |
| Envio e fallback de notificação | NOTIF-001 a NOTIF-010 |
| Importação Gestão VG | PRIC-001 a PRIC-009 |
| Consulta de preços com regras | PRICE-001 a PRICE-008 |
| Mensagens funcionais | MSG-001 a MSG-008 |
| Fluxos ponta a ponta críticos | E2E-001 a E2E-003 |

## 8. Casos de teste BDD/E2E manuais

### 8.1 Setup de voucher

| ID | Cenário | BDD | Execução manual | Resultado esperado | Justificativa |
|---|---|---|---|---|---|
| SETUP-001 | Consultar setup default sem registro | Dado que não existe registro em `voucher_setup`; Quando consultar `GET /setup`; Então o retorno deve ser default SMS | Limpar ou isolar tabela `voucher_setup`; chamar `GET $BACKOFFICE_SETUP` | HTTP `200`, `id=default`, `notificationChannel=SMS`, `consumerDataRequiredOnBlock=none/NONE` conforme serialização | Garante compatibilidade do comportamento legado quando ambiente ainda não possui setup salvo |
| SETUP-002 | Atualizar setup para SMS | Dado payload com `notificationChannel=SMS`; Quando atualizar setup; Então a configuração deve ser persistida e retornada sem campos técnicos | `PUT $BACKOFFICE_SETUP` com `{"id":"default","consumerDataRequiredOnBlock":"none","notificationChannel":"SMS"}` | HTTP `200`; resposta contém `notificationChannel=SMS`; não contém `fallbackChannel`, `sendWhatsapp`, `sendSms`, `sendSmsFallback` nem templates WhatsApp | Protege o contrato público simplificado e evita vazamento de parâmetros técnicos ao Apex/front |
| SETUP-003 | Atualizar setup para WhatsApp | Dado payload com `notificationChannel=WHATSAPP`; Quando atualizar e consultar; Então o canal deve ser WhatsApp | Executar `PUT` e depois `GET $BACKOFFICE_SETUP` | Ambos retornam `WHATSAPP`; banco contém `notification_channel='WHATSAPP'` | Valida o canal primário novo sem fallback |
| SETUP-004 | Atualizar setup para AMBOS | Dado payload com `notificationChannel=AMBOS`; Quando atualizar e consultar; Então a API deve refletir `AMBOS` | Executar `PUT` com `AMBOS` e depois `GET` | HTTP `200`; resposta contém somente campos públicos; banco contém `AMBOS` | `AMBOS` é regra de negócio central, mas não deve reintroduzir flags técnicas |
| SETUP-005 | Compatibilidade com `isSendSms=true` | Dado consumidor legado envia apenas `isSendSms=true`; Quando atualizar setup; Então o setup deve ser interpretado como SMS | `PUT $BACKOFFICE_SETUP` com `{"id":"default","isSendSms":true}` | HTTP `200`; resposta `notificationChannel=SMS`; resposta não contém `isSendSms` | Garante migração suave de consumidores antigos sem transformar campo legado em contrato novo |
| SETUP-006 | Rejeitar canal inválido | Dado payload com `notificationChannel=EMAIL`; Quando atualizar setup; Então a API deve rejeitar | `PUT $BACKOFFICE_SETUP` com `EMAIL`; repetir com `NONE` | HTTP `400`; erro de formato de `notificationChannel` | Evita configuração operacional impossível |
| SETUP-007 | Validar migração V75/V76 | Dado banco com colunas antigas de WhatsApp/fallback; Quando aplicar V76; Então configuração antiga de WhatsApp com fallback vira `AMBOS` e colunas técnicas somem | Em banco descartável, aplicar V75, inserir registro `WHATSAPP` + fallback SMS, aplicar V76 | `notification_channel='AMBOS'`; colunas `send_whatsapp`, `fallback_channel`, templates WhatsApp inexistentes | Cobre risco de upgrade em ambiente com dados intermediários de V75 |

### 8.2 Notificação SMS, WhatsApp e fallback

| ID | Cenário | BDD | Execução manual | Resultado esperado | Justificativa |
|---|---|---|---|---|---|
| NOTIF-001 | Venda com setup SMS mantém SMS legado | Dado setup `SMS` e distribuidor com envio SMS habilitado; Quando vender voucher com telefone válido; Então deve haver chamada a `/sms` | Configurar setup SMS; preparar venda válida; verificar stub `ms-notification` | Uma chamada `/notification/v1/sms`; nenhuma chamada `/whatsapp`; voucher vendido | Protege o comportamento existente do canal SMS |
| NOTIF-002 | Venda com setup WhatsApp usa WhatsApp | Dado setup `WHATSAPP`; Quando vender voucher com telefone válido; Então deve enviar WhatsApp | Configurar setup WHATSAPP; vender voucher | Uma chamada `/notification/v1/whatsapp`; nenhuma chamada `/sms` em sucesso | Valida canal primário novo e evita duplicidade de notificação |
| NOTIF-003 | Venda com `AMBOS` e sucesso WhatsApp não envia SMS | Dado setup `AMBOS` e WhatsApp retorna sucesso; Quando vender voucher; Então SMS fallback não deve ser usado | Stub `/whatsapp` com HTTP 200; vender voucher | Uma chamada `/whatsapp`; zero chamadas `/sms` | Confirma que `AMBOS` não é envio simultâneo |
| NOTIF-004 | Venda com `AMBOS` e falha WhatsApp usa SMS fallback | Dado setup `AMBOS` e WhatsApp retorna erro; Quando vender voucher; Então deve tentar SMS fallback | Stub `/whatsapp` com HTTP 500; stub `/sms` com HTTP 200; vender voucher | Primeiro `/whatsapp`, depois `/sms`; transação local permanece confirmada | Cobre a regra de fallback, principal risco funcional da mudança |
| NOTIF-005 | `mustSendSms=false` suprime notificação | Dado setup `WHATSAPP` ou `AMBOS`; Quando request de venda define `mustSendSms=false`; Então nenhuma notificação deve ser enviada | Enviar venda com flag de não envio conforme contrato do endpoint | Zero chamadas `/sms` e `/whatsapp` | Garante respeito à decisão explícita do request |
| NOTIF-006 | Telefone ausente ou inválido não dispara envio | Dado setup `WHATSAPP`; Quando venda não possui telefone válido; Então não deve chamar `ms-notification` | Enviar consumidor sem telefone ou com número sentinela inválido usado pelo sistema | Venda segue conforme regra aplicável; zero chamadas de notificação ou erro funcional esperado de telefone, conforme fluxo | Evita chamadas externas com destino inválido |
| NOTIF-007 | Cancelamento com WhatsApp mesmo sem SMS legado | Dado setup `WHATSAPP` e distribuidor com `isSendSms=false`; Quando cancelar voucher disponível; Então deve enviar WhatsApp de cancelamento | Criar venda válida; configurar distribuidor sem SMS; cancelar voucher | Chamada `/whatsapp` com mensagem de cancelamento; voucher `CANCELADO` | Valida que WhatsApp não depende da flag legada do distribuidor |
| NOTIF-008 | Cancelamento com SMS respeita legado | Dado setup `SMS` e distribuidor sem SMS; Quando cancelar voucher; Então não deve notificar | Configurar setup SMS e `isSendSms=false`; cancelar | Zero chamadas ao stub de notificação | Evita regressão do comportamento legado |
| NOTIF-009 | Reenvio com `AMBOS` usa fallback quando WhatsApp falha | Dado NSU de venda e setup `AMBOS`; Quando reenviar e WhatsApp falha; Então SMS deve ser enviado | Stub `/whatsapp` 500; chamar endpoint de reenvio de SMS/notificação pelo NSU | Chamada `/whatsapp` seguida de `/sms`; resposta do reenvio sem erro quando SMS fallback sucesso | Reenvio é síncrono e possui lógica própria, por isso precisa de caso dedicado |
| NOTIF-010 | Logs mascaram telefone | Dado envio de notificação; Quando consultar logs; Então telefone completo não deve aparecer | Executar qualquer cenário de envio; buscar por DDD+número completo no log | Logs exibem número mascarado, preservando no máximo últimos dígitos; não há mensagem completa com código exposto nos logs novos | Cobre requisito de segurança operacional e privacidade |

### 8.3 Importação de regras Gestão VG

Payload base:

```json
[
  {
    "codigoRegra": 548,
    "descricaoRegra": "Acao teste Gestao VG",
    "cnpj": "03.282.579/0001-10",
    "diaDaSemana": 5,
    "codPeriodo": "MAN",
    "produto": "0110035",
    "cidade": "Salvador",
    "uf": "ba",
    "micromercado": "MM",
    "novoValor": 80,
    "statusRegra": "A",
    "dataInicio": "2026-01-01",
    "dataFim": "2027-01-01",
    "cia": "UG"
  }
]
```

| ID | Cenário | BDD | Execução manual | Resultado esperado | Justificativa |
|---|---|---|---|---|---|
| PRIC-001 | Importar regra válida | Dado lote válido; Quando importar; Então regra deve ser criada | `POST $PRICING_RULES` com payload base | HTTP `200`; `totalRecebido=1`, `totalCriado=1`; banco com CNPJ normalizado, UF alta, `tipo_valor=ABSOLUTO` | Cobre caminho principal e normalizações |
| PRIC-002 | Reimportar payload idêntico | Dado regra já importada; Quando reenviar o mesmo payload; Então deve ignorar | Executar PRIC-001 duas vezes | Segunda resposta `totalIgnorado=1`; `updated_at` não deve indicar alteração funcional | Valida idempotência por hash normalizado |
| PRIC-003 | Atualizar regra existente | Dado regra existente; Quando alterar `novoValor`; Então deve atualizar | Reenviar mesmo `codigoRegra` com `novoValor=75` | `totalAtualizado=1`; banco reflete novo valor e novo hash | Confirma upsert por `codigoRegra` |
| PRIC-004 | Rejeitar `codigoRegra` duplicado no lote | Dado dois itens com mesmo `codigoRegra`; Quando importar; Então lote inteiro deve falhar | Enviar array com duplicidade | HTTP `400`; nenhum item persistido/atualizado | Evita resultado ambíguo dentro da mesma transação |
| PRIC-005 | Rejeitar lote vazio, objeto isolado e lote >1000 | Dado payload inválido; Quando importar; Então deve retornar `400` | Testar `[]`, `{...}` e array com 1001 itens | HTTP `400`; sem persistência | Cobre contrato estrutural do endpoint |
| PRIC-006 | Rejeitar enum e formato inválidos | Dado campos inválidos; Quando importar; Então deve retornar mensagens 400 | Testar `statusRegra=X`, `codPeriodo=XYZ`, `diaDaSemana=8`, CNPJ com 3 dígitos, UF com 3 letras | HTTP `400`; erro aponta campo/regra inválida | Cobre validações de borda e entrada do Gestão VG |
| PRIC-007 | Rejeitar datas inválidas | Dado `dataFim` anterior a `dataInicio`; Quando importar; Então deve rejeitar | Enviar `dataInicio=2026-12-17`, `dataFim=2026-12-16` | HTTP `400`, código `400.032` ou mensagem equivalente | Evita campanha vigente invertida |
| PRIC-008 | Validar inferência de `tipoValor` sem campo no payload | Dado payload sem `tipoValor` e com `decrescimo`; Quando importar; Então deve persistir `PERCENTUAL` | Remover `tipoValor`, usar `decrescimo=10`, sem `novoValor` | HTTP `200`; banco `tipo_valor=PERCENTUAL` | Registra comportamento atual do commit `94523185` e evidencia divergência com Swagger |
| PRIC-009 | Rejeitar valor ambíguo | Dado `novoValor` junto com `decrescimo` ou `acrescimo`; Quando importar; Então deve rejeitar | Enviar `novoValor=80` e `decrescimo=10` | HTTP `400`, mensagem `400.036` | Evita regra comercial impossível de interpretar |

### 8.4 Aplicação das regras em consulta de preço

| ID | Cenário | BDD | Execução manual | Resultado esperado | Justificativa |
|---|---|---|---|---|---|
| PRICE-001 | Consulta por CNPJ sem regra elegível | Dado distribuidor `BY_CNPJ` e sem regra ativa; Quando consultar preço; Então retorna preço local original | Limpar regras elegíveis; chamar `GET $PRICES?code-product=<PRODUCT_CODE>` com headers do distribuidor | `netPriceProduct` igual ao preço local/desconto configurado | Estabelece baseline antes de aplicar regra |
| PRICE-002 | Aplicar `novoValor` absoluto | Dado regra ativa com `novoValor=80`; Quando consultar preço por CNPJ; Então preço final vira 80,00 | Importar regra compatível e consultar `GET /prices` | `netPriceProduct=80.00` | Cobre regra de preço absoluto |
| PRICE-003 | Aplicar `decrescimo` percentual sobre preço final atual | Dado preço final atual 90,00 e `decrescimo=10`; Quando consultar; Então retorna 81,00 | Configurar produto com preço 100 e desconto local 10%; importar regra percentual de desconto | `priceProduct=100`, `netPriceProduct=81.00` | Confirma que percentual aplica sobre o preço final vigente, não sobre preço bruto |
| PRICE-004 | Aplicar `acrescimo` percentual | Dado preço 100 e `acrescimo=15`; Quando consultar; Então retorna 115,00 | Importar regra com `acrescimo=15` | `netPriceProduct=115.00` | Cobre aumento comercial |
| PRICE-005 | Priorizar regra mais específica | Dado regra genérica e regra específica compatível; Quando consultar; Então vence a específica | Importar duas regras: uma só por CNPJ/produto e outra também por cidade, UF, micromercado e CIA | Retorno usa valor da regra com mais filtros preenchidos | Cobre critério de prioridade que evita campanha genérica sobrepor campanha específica |
| PRICE-006 | Não aplicar regra inativa, futura ou expirada | Dado regras `I`, `dataInicio` futura ou `dataFim` passada; Quando consultar; Então preço não muda | Importar cada variação e consultar | `netPriceProduct` permanece baseline | Evita aplicação fora de vigência |
| PRICE-007 | Não consultar regras em método por localização | Dado distribuidor com estratégia por localização/Oracle; Quando consultar preço com lat/long; Então regras Gestão VG não devem alterar preço | Usar distribuidor `BY_LOCATION` ou equivalente; importar regra que seria compatível por produto | Retorno segue Oracle/local existente; logs não indicam aplicação de pricing rule | Garante escopo do commit `3eb50965`: regras apenas no método por CNPJ |
| PRICE-008 | Validar filtros de período e dia da semana | Dado regra com `codPeriodo` e `diaDaSemana`; Quando consultar dentro e fora da janela; Então só aplica na janela correta | Executar em janela controlada ou ajustar data/hora do ambiente de teste; testar também domingo como borda | Dentro da janela aplica; fora não aplica; registrar resultado de domingo | Cobre maior risco temporal da seleção de regras |

### 8.5 Mensagens funcionais PT-BR

| ID | Cenário | BDD | Execução manual | Resultado esperado | Justificativa |
|---|---|---|---|---|---|
| MSG-001 | Limite diário exibe saldo restante | Dado distribuidor com limite diário e vendas já computadas; Quando nova venda exceder limite; Então mensagem informa saldo restante | Preparar Redis com vendas do dia ou executar vendas até limite; tentar exceder | HTTP `422`; mensagem `Você atingiu o limite diário de vendas. Você ainda pode emitir X vale(s) hoje.`; sem `{0}` | Cobre ajuste de argumento de `422.053` |
| MSG-002 | Limite mensal exibe limite configurado | Dado distribuidor no limite mensal; Quando tentar vender; Então mensagem mensal deve ser clara | Preparar contador mensal; executar venda | HTTP `422`; mensagem `Não foi possível gerar vales... Limite mensal...` com valor esperado | Garante que alteração diária não quebrou mensagem mensal |
| MSG-003 | Reserva inválida exibe status atual | Dado voucher em status não reservável; Quando reservar; Então resposta inclui status | Usar voucher `RESERVADO`, `TROCADO` ou status não permitido; chamar reserva | HTTP `422`; mensagem `O Vale está com o status <STATUS> e não pode ser reservado.` | Cobre propagação de status em `422.044` |
| MSG-004 | Cancelamento de reserva inválido exibe status atual | Dado voucher não reservado; Quando cancelar reserva; Então resposta inclui status | Usar voucher `DISPONIVEL` ou `TROCADO`; chamar cancelamento de reserva | HTTP `422`; mensagem `O Vale está com o status <STATUS> e não é possível cancelar a reserva do Vale.` | Cobre `422.045` |
| MSG-005 | Confirmação de venda já realizada | Dado venda já confirmada; Quando confirmar novamente; Então mensagem específica deve retornar | Chamar confirmação de venda duas vezes para mesmo voucher | HTTP `422`; mensagem `A confirmação da transação de venda do Vale já foi realizada.` | Evita mensagem genérica em fluxo backoffice |
| MSG-006 | Venda por barcode com quantidade maior que 1 | Dado request por barcode com mais de um vale; Quando vender; Então retorna mensagem específica | Enviar venda com `voucher-barcode` e quantidade > 1 | HTTP `422`; mensagem `É permitido vender somente 1 vale por vez.` | Protege regra de venda por barcode |
| MSG-007 | Bloqueio com produto incompatível | Dado voucher vendido para produto A; Quando bloquear informando produto B; Então retorna mensagem de produto incompatível | Executar bloqueio com produto divergente | HTTP `422`; mensagem `o vale informado não corresponde ao peso do botijão selecionado` | Cobre `422.058`, regra crítica de troca |
| MSG-008 | FEPAS sem id efetivo exibe id informado | Dado finalização FEPAS com id inexistente; Quando finalizar; Então mensagem inclui id | Chamar finalização com `<FEPAS_EFFECTIVE_ID>` inexistente | HTTP `422`; mensagem `O Id de venda <id> informado não foi encontrado.` | Cobre `422.061` e evita perda de contexto operacional |

### 8.6 Cenários E2E integrados

| ID | Cenário | BDD | Execução manual | Resultado esperado | Justificativa |
|---|---|---|---|---|---|
| E2E-001 | Setup AMBOS, regra de preço e venda com fallback | Dado setup `AMBOS`, regra Gestão VG absoluta e WhatsApp falhando; Quando consultar preço e vender voucher; Então preço aplicado e SMS fallback enviado | Configurar setup AMBOS; importar regra `novoValor`; consultar `GET /prices`; vender usando preço retornado; stub `/whatsapp` 500 e `/sms` 200 | Preço final reflete regra; venda concluída; evento tenta WhatsApp e depois SMS | Valida a cadeia mais crítica: setup + pricing + venda + fallback |
| E2E-002 | Setup WhatsApp, venda e cancelamento | Dado setup `WHATSAPP`; Quando vender e cancelar voucher; Então ambas notificações usam WhatsApp | Configurar setup; vender voucher; cancelar o voucher vendido; verificar stub | Duas chamadas `/whatsapp`: venda e cancelamento; nenhuma chamada `/sms` | Cobre continuidade do canal em dois pontos do ciclo de vida |
| E2E-003 | Regressão SMS legado | Dado setup default/SMS e distribuidor SMS habilitado; Quando vender, reenviar e cancelar; Então o fluxo usa SMS como antes | Configurar SMS; executar venda, reenvio por NSU e cancelamento | Chamadas `/sms` esperadas; sem `/whatsapp`; mensagens e status preservados | Garante que a evolução WhatsApp não quebrou clientes existentes |

## 9. Relatório de execução manual

Usar o modelo abaixo por rodada de testes.

| Campo | Valor |
|---|---|
| Data/hora |  |
| Responsável |  |
| Ambiente | Local / HML / outro |
| Branch/commit |  |
| Build/versão |  |
| Banco/schema |  |
| `ms-notification` | Real / Stub |
| SOA/Oracle/SQS | Real / Stub / Desabilitado |
| Observações de massa |  |

Resultado por caso:

| Caso | Status | Evidência | Observações |
|---|---|---|---|
| SETUP-001 | Não executado / Aprovado / Reprovado / Bloqueado | URL, print, log ou query |  |
| SETUP-002 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| SETUP-003 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| SETUP-004 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| SETUP-005 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| SETUP-006 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| SETUP-007 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| NOTIF-001 a NOTIF-010 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| PRIC-001 a PRIC-009 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| PRICE-001 a PRICE-008 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| MSG-001 a MSG-008 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |
| E2E-001 a E2E-003 | Não executado / Aprovado / Reprovado / Bloqueado |  |  |

## 10. Critérios de aceite da suíte

A rodada pode ser considerada aprovada quando:

- todos os casos críticos `SETUP-002`, `SETUP-004`, `NOTIF-004`, `PRIC-001`, `PRIC-002`, `PRIC-008`, `PRICE-002`, `PRICE-005`, `MSG-001` e `E2E-001` forem aprovados;
- nenhum fluxo legado SMS crítico falhar;
- nenhuma resposta expuser campos técnicos removidos do setup;
- nenhuma mensagem funcional retornar placeholder literal `{0}`;
- nenhuma notificação duplicada ocorrer em `AMBOS` quando WhatsApp tiver sucesso;
- fallback SMS ocorrer somente após falha do WhatsApp;
- regra de preço for aplicada somente para consulta por CNPJ;
- evidências de log não exibirem telefone completo nos logs novos de notificação.

## 11. Riscos e recomendações

| Risco | Recomendação |
|---|---|
| Swagger ainda marca `tipoValor` como obrigatório, mas código infere o tipo | Ajustar `swagger-voucher-backoffice_api_v1.yaml` para remover `tipoValor` de `required` ou alinhar novamente com regra funcional |
| Aplicação de pricing rules depende de horário/dia do servidor | Executar casos com data/hora controlada ou incluir massa sem filtro temporal para smoke e massa temporal para regressão |
| WhatsApp/SMS dependem de serviço externo | Usar stub com registro de chamadas para validar ordem, fallback e ausência de duplicidade |
| Eventos são pós-commit e assíncronos | Nos testes manuais, aguardar processamento e consultar stub/logs com correlation-id |
| Ambiente HML pode aplicar migrations e disparar integrações reais | Executar smoke local com jobs/listeners desligados antes da validação integrada |
| Regras de preço por CNPJ podem afetar venda se preço usado pelo parceiro vier divergente | Em E2E de venda, sempre consultar preço primeiro e vender com o `netPriceProduct` retornado |

## 12. Conclusão

A suíte proposta cobre as mudanças funcionais e técnicas mais relevantes dos relatórios e commits analisados. A separação por BDD facilita validação de negócio, enquanto os cenários E2E garantem que contrato HTTP, persistência, eventos assíncronos, integração de notificação e cálculo de preços funcionem em conjunto.

O ponto mais importante de regressão é confirmar que o setup público ficou simples (`notificationChannel`) sem quebrar o SMS legado. O ponto mais importante de integração é confirmar que `AMBOS` opera como WhatsApp primário com SMS fallback, sem envio duplicado. Na frente de preço, o ponto crítico é provar que as regras do Gestão VG são idempotentes na importação e aplicadas apenas quando a consulta de preço por CNPJ encontra uma regra ativa, vigente e mais específica.
