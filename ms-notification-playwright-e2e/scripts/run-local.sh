#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

echo "==> Subindo infraestrutura local e ms-notification"
docker compose --env-file .env.local -f infra/docker-compose.local.yml up -d --build

echo "==> Aguardando health check da aplicação"
bash scripts/wait-health.sh "${MS_NOTIFICATION_BASE_URL:-http://localhost:18001/notification/v1}/actuator/health"

echo "==> Executando suíte local Playwright"
TEST_ENV=local npx playwright test --grep "@(smoke|contract|local|e2e)"
