#!/usr/bin/env bash
set -euo pipefail

url="${1:-http://localhost:18001/notification/v1/actuator/health}"

for i in $(seq 1 60); do
  if curl -fsS "$url" | grep -q "UP"; then
    echo "Aplicação UP: $url"
    exit 0
  fi
  sleep 2
done

echo "Health check não ficou UP: $url" >&2
exit 1
