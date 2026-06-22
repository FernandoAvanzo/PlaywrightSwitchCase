# Guia de Ambientes

## Local

Use quando quiser executar a aplicação alvo e toda a infraestrutura mockada na máquina local.

```bash
MS_NOTIFICATION_SOURCE_DIR=../ms-notification npm run test:local
```

## HML

Use para validar homologação. Edite `.env.hml` com a URL real.

```bash
cp .env.hml.example .env.hml
npm run test:hml
```

## PROD

Use somente para validações não destrutivas.

```bash
cp .env.prod.example .env.prod
npm run test:prod
```

O filtro PROD executa apenas `@smoke` e `@contract`.
