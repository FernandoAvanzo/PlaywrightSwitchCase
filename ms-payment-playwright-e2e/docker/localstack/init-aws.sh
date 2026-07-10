#!/bin/sh
set -eu
awslocal sqs create-queue --queue-name payment-events.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true
awslocal sqs create-queue --queue-name payment-reconciliation.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true
awslocal sqs create-queue --queue-name payment-start-reconciliation.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true
awslocal ssm put-parameter --name "${MALGA_API_KEY_PARAMETER:-/ms-payment/local/malga/api-key}" --type SecureString --value "${MALGA_API_KEY:-test-api-key}" --overwrite
awslocal ssm put-parameter --name "${MALGA_CLIENT_ID_PARAMETER:-/ms-payment/local/malga/client-id}" --type String --value "${MALGA_CLIENT_ID:-test-client-id}" --overwrite
