# Inventário de configuração local

| Dependência | Variável / configuração | Valor local |
|---|---|---|
| HTTP | `SERVER_PORT` | `8001` |
| Context path | definido pela aplicação | `/payment/v1` |
| MySQL | `SPRING_DATASOURCE_URL` | `jdbc:mysql://mysql:3306/payment...` |
| MySQL | usuário/senha | `payment/payment` |
| Flyway | `SPRING_FLYWAY_ENABLED` | `true` |
| AWS | `APP_AWS_REGION` | `us-east-1` |
| SQS | endpoint | `http://localstack:4566` |
| SQS | main queue | `payment-events.fifo` |
| SQS | reconciliation | `payment-reconciliation.fifo` |
| SQS | start reconciliation | `payment-start-reconciliation.fifo` |
| SSM | endpoint | `http://localstack:4566` |
| SSM | Malga API key parameter | `/ms-payment/local/malga/api-key` |
| SSM | Malga client ID parameter | `/ms-payment/local/malga/client-id` |
| Malga | base URL | `http://wiremock:8080` |
| Webhook | mock URL | `http://webhook-mock:8080` ou host `8090` |
| Stone split | recipient defaults | mantidos pela aplicação; sobrescrevíveis por env |

## Observação

Os nomes seguem o relaxed binding do Spring Boot. Caso a branch do `ms-payment` use aliases diferentes, ajuste apenas o bloco `environment` do serviço `ms-payment` no Compose.
