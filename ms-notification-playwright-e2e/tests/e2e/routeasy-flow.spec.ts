import { test, expect } from '../../src/fixtures/api';
import { routeasyPayload } from '../../src/data/payloads';
import { expectStatus } from '../../src/utils/response';

test.describe('E2E - Routeasy', () => {
  /**
   * Valida o fluxo ponta a ponta do webhook da Routeasy para um evento válido
   * que deve resultar no envio de SMS de acompanhamento ao cliente.
   *
   * Regras de negócio cobertas:
   * - O webhook da Routeasy deve aceitar um payload válido e reconhecido pelo domínio.
   * - A API deve responder com HTTP 202, indicando que o evento foi recebido para
   *   processamento assíncrono.
   * - Antes do envio da mensagem, o fluxo deve conseguir integrar com o serviço de
   *   encurtamento de URL com sucesso.
   * - Um evento Routeasy mapeado deve acionar o canal de SMS para acompanhamento.
   * - A integração externa de SMS, ou provedor equivalente como Infobip, deve receber
   *   ao menos uma requisição de envio.
   * - O cenário garante que o fluxo E2E mínimo de recebimento do webhook, preparação
   *   da mensagem e disparo para o provedor esteja funcional em ambiente local.
   */
  test('@e2e @local @local-only E2E-005 - webhook dispara SMS de acompanhamento', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubShortenerSuccess();
    await mockInfra.stubSmsSuccess();

    const response = await apiClient.routeasyWebhook(routeasyPayload());

    await expectStatus(response, 202);
    await expect.poll(() => mockInfra.countRequests('.*(sms|infobip).*')).toBeGreaterThanOrEqual(1);
  });
});
