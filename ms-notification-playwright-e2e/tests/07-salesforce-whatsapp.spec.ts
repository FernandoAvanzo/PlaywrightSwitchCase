import { execFileSync } from 'node:child_process';
import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import {
  salesforceAppAuthPayload,
  salesforceVoucherPayload
} from '../src/data/payloads';
import { headerValues } from '../src/clients/mock-infra-client';
import { expectStatus } from '../src/utils/response';
import {
  expectNoSms,
  expectQueueEmpty,
  latestSalesforceRequest,
  salesforcePaths,
  waitForRequestCount
} from '../src/utils/salesforce-test';

test.describe('WhatsApp via Salesforce - contrato, compatibilidade e segurança', () => {
  /**
   * Garante que um Vale Gás válido seja aceito para processamento assíncrono
   * e encaminhado ao Salesforce com o contrato mínimo exigido pelo negócio.
   *
   * Regras de negócio: o Voucher usa o fluxo VOUCHER; o Salesforce recebe apenas
   * destinatário e código; a autenticação usa Client Credentials; um aceite
   * 202 com success=true não pode gerar retry, hospital ou SMS.
   */
  test('@local @local-only SF-F01/R01/S05 - aceitar Voucher com contrato mínimo e sem contingência', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess('sf-token-f01');
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-f01');

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-voucher-f01',
      message: 'VG-F01-123'
    }));

    await expectStatus(response, 202);
    expect((await response.body()).length).toBe(0);
    await waitForRequestCount(mockInfra, salesforcePaths.oauth, 1);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);

    const oauthRequest = await mockInfra.latestRequest(salesforcePaths.oauth);
    const oauthForm = new URLSearchParams(oauthRequest?.body);
    const { request, body } = await latestSalesforceRequest(mockInfra, salesforcePaths.voucher);

    expect(oauthForm.get('grant_type')).toBe('client_credentials');
    expect(oauthForm.get('client_id')).toBe('local-salesforce-client');
    expect(oauthForm.get('client_secret')).toBe('local-salesforce-secret');
    expect(headerValues(request, 'Authorization')).toEqual(['Bearer sf-token-f01']);
    expect(body).toEqual({
      to: '5511988881234',
      text: 'VG-F01-123'
    });
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
    await expectNoSms(mockInfra);
  });

  /**
   * Preserva a seleção do template padrão do Salesforce quando o consumidor
   * solicita autenticação do aplicativo sem informar uma sobrescrita.
   *
   * Regras de negócio: APP_AUTH usa endpoint próprio; texto é obrigatório; a
   * ausência de templateName deve ser preservada para o Salesforce aplicar seu padrão.
   */
  test('@local @local-only SF-F02 - enviar APP_AUTH sem sobrescrever o template padrão', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceAccepted('appAuth', 'sf-correlation-f02');

    const response = await salesforceApiClient.sendWhatsapp(salesforceAppAuthPayload({
      transactionId: 'trx-sf-app-auth-f02'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.appAuth, 1);
    const { body } = await latestSalesforceRequest(mockInfra, salesforcePaths.appAuth);

    expect(body).toEqual({
      to: '5511988881234',
      text: '482913'
    });
  });

  /**
   * Permite que jornadas autorizadas escolham um template específico para
   * autenticação, sem alterar o conteúdo nem o destino da mensagem.
   *
   * Regras de negócio: templateName só é propagado no fluxo APP_AUTH; o pedido
   * aceito continua sem SMS de contingência.
   */
  test('@local @local-only SF-F03 - propagar template customizado somente no APP_AUTH', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceAccepted('appAuth', 'sf-correlation-f03');

    const response = await salesforceApiClient.sendWhatsapp(salesforceAppAuthPayload({
      transactionId: 'trx-sf-app-auth-f03',
      templateName: 'AppAuth_Template_Premium'
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.appAuth, 1);
    const { body } = await latestSalesforceRequest(mockInfra, salesforcePaths.appAuth);

    expect(body).toEqual({
      to: '5511988881234',
      text: '482913',
      templateName: 'AppAuth_Template_Premium'
    });
    await expectNoSms(mockInfra);
  });

  const normalizedPhones = [
    { id: 'A', input: '11988881234' },
    { id: 'B', input: '5511988881234' },
    { id: 'C', input: '+5511988881234' }
  ];

  for (const phone of normalizedPhones) {
    /**
     * Evita perda de entrega e duplicidade de DDI ao aceitar os formatos de telefone
     * brasileiros suportados pelos consumidores do serviço.
     *
     * Regras de negócio: número local, número com 55 e número com +55 devem chegar
     * ao Salesforce no mesmo formato canônico, com exatamente um DDI 55.
     */
    test(`@local @local-only SF-F05${phone.id} - normalizar telefone ${phone.input}`, async ({
      salesforceApiClient,
      mockInfra
    }) => {
      await mockInfra.stubSalesforceOAuthSuccess();
      await mockInfra.stubSalesforceAccepted('voucher', `sf-correlation-f05-${phone.id}`);

      const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
        transactionId: `trx-sf-phone-f05-${phone.id}`,
        cellPhone: phone.input
      }));

      await expectStatus(response, 202);
      await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
      const { body } = await latestSalesforceRequest(mockInfra, salesforcePaths.voucher);

      expect(body.to).toBe('5511988881234');
    });
  }

  /**
   * Impede que um telefone com prefixo de operadora seja aceito como destinatário,
   * evitando envio para um número ambíguo e consumo desnecessário de infraestrutura.
   *
   * Regras de negócio: 0DDD é inválido; a API responde 400 antes de OAuth, Salesforce
   * ou filas; nenhuma tentativa de SMS deve ocorrer.
   */
  test('@local @local-only SF-F06/F07 - rejeitar 0DDD antes de chamar dependências', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-invalid-phone-f06',
      cellPhone: '01511988881234'
    }));

    await expectStatus(response, 400);
    expect(await mockInfra.countRequests(salesforcePaths.oauth)).toBe(0);
    expect(await mockInfra.countRequests(salesforcePaths.voucher)).toBe(0);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);
    await expectNoSms(mockInfra);
  });

  /**
   * Mantém consumidores legados operantes sem permitir que metadados exclusivos
   * do BLiP contaminem o contrato simplificado do Salesforce.
   *
   * Regras de negócio: aliases históricos resolvem o código canônico; VOUCHER envia
   * somente to e text; template, idioma, identificador e demais variáveis são omitidos.
   */
  test('@local @local-only SF-F08/F09 - resolver código legado e remover campos BLiP', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-f08');

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-legacy-f08',
      message: undefined,
      templateName: 'template-legado',
      templateId: 'template-id-legado',
      templateLanguage: 'pt_BR',
      templateVariables: {
        voucherCode: 'VG-LEGADO-909',
        cliente: 'não-propagar'
      }
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    const { body } = await latestSalesforceRequest(mockInfra, salesforcePaths.voucher);

    expect(body).toEqual({
      to: '5511988881234',
      text: 'VG-LEGADO-909'
    });
  });

  /**
   * Reduz autenticações desnecessárias e preserva a capacidade da Connected App
   * ao reutilizar um token ainda válido em envios sequenciais.
   *
   * Regras de negócio: duas mensagens dentro do TTL usam uma única autenticação;
   * cada mensagem ainda deve produzir sua própria chamada Apex.
   */
  test('@local @local-only SF-R02 - reutilizar token OAuth dentro do TTL', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess('sf-token-cache');
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-cache');

    const first = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-cache-001'
    }));
    const second = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId: 'trx-sf-cache-002',
      message: 'VG-CACHE-002'
    }));

    await expectStatus(first, 202);
    await expectStatus(second, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 2);
    expect(await mockInfra.countRequests(salesforcePaths.oauth)).toBe(1);
  });

  /**
   * Protege o Salesforce contra tempestade de autenticação quando vários envios
   * chegam ao mesmo tempo e ainda não existe token em cache.
   *
   * Regras de negócio: a renovação é single-flight; todos os pedidos concorrentes
   * usam o token compartilhado e seguem individualmente para o endpoint Voucher.
   */
  test('@local @local-only SF-R03 - obter um único token para envios concorrentes', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    await mockInfra.stubSalesforceOAuthSuccess('sf-token-concorrente', {
      fixedDelayMilliseconds: 300
    });
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-concorrente');

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
        transactionId: `trx-sf-concorrente-${index}`,
        message: `VG-CONCORRENTE-${index}`
      })))
    );

    for (const response of responses) {
      await expectStatus(response, 202);
    }
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 6, 20_000);
    expect(await mockInfra.countRequests(salesforcePaths.oauth)).toBe(1);
  });

  /**
   * Reconhece a resposta de deduplicação do Salesforce como sucesso de negócio,
   * impedindo reprocessamento local de uma solicitação já recebida.
   *
   * Regras de negócio: repetição equivalente mantém o correlationId informado pelo
   * provider; a resposta idempotente não gera retry nem hospital.
   */
  test('@local @local-only SF-F04 - tratar repetição idempotente como aceite', async ({
    salesforceApiClient,
    mockInfra,
    sqs
  }) => {
    const transactionId = 'trx-sf-idempotencia-f04';
    await mockInfra.stubSalesforceOAuthSuccess();
    await mockInfra.stubSalesforceAccepted(
      'voucher',
      'sf-correlation-idempotente',
      'Solicitação já processada de forma idempotente'
    );

    const first = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({ transactionId }));
    const second = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({ transactionId }));

    await expectStatus(first, 202);
    await expectStatus(second, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 2);
    await expectQueueEmpty(sqs, env.queues.whatsappRetry);
    await expectQueueEmpty(sqs, env.queues.whatsappHospital);

    await expect.poll(() => salesforceContainerLogs(), { timeout: 10_000 }).toContain(
      'providerMessageId=sf-correlation-idempotente'
    );
    expect(salesforceContainerLogs()).toContain('idempotent=true');
  });

  /**
   * Fornece rastreabilidade operacional sem expor dados pessoais, credenciais
   * ou o conteúdo comercial completo da mensagem.
   *
   * Regras de negócio: transactionId e correlationId devem ser pesquisáveis; token,
   * segredo, telefone integral e código do voucher não podem aparecer nos logs.
   */
  test('@local @local-only SF-S02/S03 - rastrear envio com logs sanitizados', async ({
    salesforceApiClient,
    mockInfra
  }) => {
    const transactionId = 'trx-sf-observabilidade-s03';
    const phone = '11987654321';
    const voucherCode = 'VG-SENSIVEL-445566';
    const accessToken = 'sf-token-nao-logar-445566';
    await mockInfra.stubSalesforceOAuthSuccess(accessToken);
    await mockInfra.stubSalesforceAccepted('voucher', 'sf-correlation-s03');

    const response = await salesforceApiClient.sendWhatsapp(salesforceVoucherPayload({
      transactionId,
      cellPhone: phone,
      message: voucherCode
    }));

    await expectStatus(response, 202);
    await waitForRequestCount(mockInfra, salesforcePaths.voucher, 1);
    await expect.poll(() => salesforceContainerLogs(), { timeout: 10_000 }).toContain(transactionId);

    const logs = salesforceContainerLogs();
    expect(logs).toContain('sf-correlation-s03');
    expect(logs).not.toContain(accessToken);
    expect(logs).not.toContain('local-salesforce-secret');
    expect(logs).not.toContain(phone);
    expect(logs).not.toContain(`55${phone}`);
    expect(logs).not.toContain(voucherCode);
  });
});

function salesforceContainerLogs(): string {
  return execFileSync('docker', [
    'compose',
    '--env-file',
    '.env.local',
    '-f',
    'infra/docker-compose.local.yml',
    'logs',
    '--no-color',
    '--tail',
    '500',
    'ms-notification-salesforce'
  ], { encoding: 'utf-8' });
}
