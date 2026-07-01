#!/usr/bin/env bash
set -euo pipefail
docker compose --env-file .env.local -f docker/docker-compose.local.yml down -v
