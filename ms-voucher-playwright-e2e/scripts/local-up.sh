#!/usr/bin/env bash
set -euo pipefail
cp -n .env.local.example .env.local || true
docker compose --env-file .env.local -f docker/docker-compose.local.yml up -d --build
