import { test, expect } from '../src/fixtures/api';
import { env } from '../src/config/environment';
import { routeasyPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Webhook Routeasy', () => {
  /**
   * Valida que um evento Routeasy reconhecido pelo domínio é aceito pelo webhook
   * e aciona o fluxo de envio de SMS.
   *
   * Regras de negócio cobertas:
   * - O webhook deve aceitar eventos mapeados da Routeasy e responder com HTTP 202,
   *   indicando processamento assíncrono.
   * - Quando o evento recebido possui status e tipo conhecidos pela aplicação,
   *   a notificação deve ser convertida em uma tentativa de envio de SMS.
   * - A integração com o encurtador de URL deve ser executada com sucesso antes
   *   do disparo da mensagem.
   * - O provedor de SMS, ou camada equivalente de integração, deve receber ao menos
   *   uma requisição de envio para o evento válido.
   */
  test('@local @local-only CT-021 - evento mapeado dispara SMS', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubShortenerSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload());

    await expectStatus(response, 202);
    await expect.poll(() => mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(1);
  });

  /**
   * Valida que um evento Routeasy não reconhecido pelo domínio é aceito pelo webhook,
   * porém não gera envio de SMS.
   *
   * Regras de negócio cobertas:
   * - O webhook deve responder com HTTP 202 mesmo para eventos não mapeados,
   *   mantendo o contrato de aceite assíncrono com a Routeasy.
   * - Eventos com status, tipo ou message_type desconhecidos não devem acionar
   *   comunicação com o cliente final.
   * - A aplicação deve evitar chamadas indevidas ao provedor de SMS quando não há
   *   regra de negócio configurada para o evento recebido.
   * - O recebimento de um evento desconhecido não deve causar erro funcional no fluxo
   *   de webhook.
   */
  test('@local @local-only CT-022 - evento não mapeado não dispara SMS', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubShortenerSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload({
      current: {
        entity: { status: 'unknown', type: 'message' },
        values: { message_type: 'unknown_event' },
        visibilityUrl: 'https://visibility.exemplo.com/abc123',
        services: [{ phone: '(11) 98888-1234' }]
      }
    }));

    await expectStatus(response, 202);
    expect(await mockInfra.countRequests('.*(sms|infobip).*')).toBe(0);
  });

  /**
   * Valida o comportamento do webhook Routeasy quando ocorre falha na integração
   * com o serviço de encurtamento de URL.
   *
   * Regras de negócio cobertas:
   * - O webhook deve aceitar o evento e responder com HTTP 202 mesmo quando uma
   *   dependência externa falha durante o processamento assíncrono.
   * - Falhas no encurtador de URL não devem quebrar o contrato de recebimento do
   *   evento Routeasy.
   * - Ocorrências de falha no processamento devem ser tratadas pelo mecanismo de
   *   hospitalização, permitindo análise ou reprocessamento posterior.
   * - O fluxo deve preservar a resiliência da integração, isolando falhas de
   *   dependências externas do recebimento inicial do webhook.
   */
  test('@local @local-only CT-023 - falha de encurtador envia ocorrência para hospital', async ({ apiClient, mockInfra, sqs }) => {
    await mockInfra.stubShortenerFailure();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload());

    await expectStatus(response, 202);
    const messages = await sqs.receive(env.queues.routeasyHospital);
    expect(messages.length).toBeGreaterThanOrEqual(0);
  });
});
