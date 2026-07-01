#!/usr/bin/env bash
set -euo pipefail

awslocal s3 mb s3://ms-voucher-ultragaz-store-sheet-local || true

for queue in \
  ms-voucher-events-local \
  ms-voucher-integration-local \
  ms-voucher-notification-local \
  ms-voucher-dlq-local
do
  awslocal sqs create-queue --queue-name "$queue" >/dev/null || true
done

echo "LocalStack resources ready"
