#!/usr/bin/env bash
set -euo pipefail

queues=(
  "${SQS_SMS_RETRY_QUEUE:-ms-notification-sms-retry}"
  "${SQS_SMS_HOSPITAL_QUEUE:-ms-notification-sms-hospital}"
  "${SQS_WHATSAPP_RETRY_QUEUE:-ms-notification-whatsapp-retry}"
  "${SQS_WHATSAPP_HOSPITAL_QUEUE:-ms-notification-whatsapp-hospital}"
  "${SQS_ROUTEASY_HOSPITAL_QUEUE:-ms-notification-routeasy-hospital}"
  "${SQS_NOTIFICATION_RETRY_QUEUE:-ms-notification-notification-retry}"
)

for q in "${queues[@]}"; do
  awslocal sqs create-queue --queue-name "$q" >/dev/null
done

awslocal sqs list-queues
