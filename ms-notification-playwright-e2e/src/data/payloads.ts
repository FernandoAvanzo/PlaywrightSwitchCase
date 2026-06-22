export const phones = {
  valid: '11988881234',
  invalid: '123'
};

export function smsPayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: `trx-sms-${Date.now()}`,
    cellPhone: phones.valid,
    message: 'Seu codigo Vale Gas e 123456',
    extraInfo: {
      Origem: 'Playwright E2E',
      voucherId: 'VCH-TESTE-001'
    },
    ...overrides
  };
}

export function whatsappPayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: `trx-whatsapp-${Date.now()}`,
    cellPhone: phones.valid,
    message: 'Seu codigo Vale Gas e 123456',
    notificationType: 'SELL',
    extraInfo: {
      Origem: 'Playwright E2E',
      voucherId: 'VCH-TESTE-001'
    },
    ...overrides
  };
}

export function whatsappTemplatePayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: `trx-whatsapp-template-${Date.now()}`,
    cellPhone: phones.valid,
    templateName: 'vale_gas_codigo_venda',
    templateLanguage: 'pt_BR',
    templateVariables: {
      '1': '123456',
      voucherCode: '123456'
    },
    notificationType: 'SELL',
    extraInfo: {
      voucherId: 'VCH-TESTE-001'
    },
    ...overrides
  };
}

export function voucherAdhocPayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: `trx-voucher-${Date.now()}`,
    voucherId: 'VCH-TESTE-001',
    cellPhone: phones.valid,
    message: 'Seu codigo Vale Gas e 123456',
    notificationType: 'SELL',
    primaryChannel: 'WHATSAPP',
    fallbackChannel: 'SMS',
    origin: 'GESTAO_VG',
    extraInfo: {
      Solicitante: 'Playwright E2E'
    },
    ...overrides
  };
}

export function routeasyPayload(overrides: Record<string, unknown> = {}) {
  return {
    current: {
      entity: {
        status: 'sent',
        type: 'message'
      },
      values: {
        message_type: 'job_start'
      },
      tracking: 'https://tracking.exemplo.com/abc123',
      visibilityUrl: 'https://visibility.exemplo.com/abc123',
      services: [
        {
          phone: '(11) 98888-1234'
        }
      ]
    },
    ...overrides
  };
}

export function notificationPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Pedido atualizado',
    body: 'Seu pedido foi atualizado com sucesso.',
    url: 'https://exemplo.com/pedidos/123',
    ownerId: `usuario-${Date.now()}`,
    type: 'ORDER',
    ...overrides
  };
}
