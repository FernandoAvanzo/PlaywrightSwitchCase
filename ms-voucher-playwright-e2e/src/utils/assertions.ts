import { expect, APIResponse } from '@playwright/test';

export async function expectJsonResponse(response: APIResponse, expectedStatus = 200) {
  expect(response.status(), await response.text()).toBe(expectedStatus);
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toContain('application/json');
  return response.json();
}

export function expectNoSetupTechnicalFields(body: Record<string, unknown>) {
  const forbidden = [
    'isSendSms',
    'fallbackChannel',
    'sendWhatsapp',
    'sendSms',
    'sendSmsFallback',
    'whatsappTemplate',
    'templateWhatsapp',
    'whatsappTemplateName'
  ];

  for (const field of forbidden) {
    expect(body, `Campo técnico/legado não deve ser exposto: ${field}`).not.toHaveProperty(field);
  }
}

export function expectNoLiteralPlaceholder(value: unknown) {
  expect(JSON.stringify(value)).not.toContain('{0}');
}
