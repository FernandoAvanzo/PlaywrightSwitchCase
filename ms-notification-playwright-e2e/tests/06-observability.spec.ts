import { execFileSync } from 'node:child_process';
import { test, expect } from '../src/fixtures/api';
import { whatsappPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Observabilidade e segurança operacional', () => {
  /**
   * Valida que o fluxo de envio de WhatsApp não expõe dados sensíveis de forma integral
   * nos logs operacionais da aplicação, mesmo quando ocorre falha no provedor externo.
   *
   * Regras de negócio cobertas:
   * - A API deve aceitar a solicitação de envio de WhatsApp com HTTP 202, mantendo o
   *   contrato de processamento assíncrono.
   * - Dados sensíveis presentes no payload, como código de voucher, não devem ser
   *   registrados integralmente nos logs da aplicação.
   * - Informações pessoais do destinatário, como número de telefone, não devem aparecer
   *   nos logs em formato bruto dentro do payload serializado.
   * - Falhas simuladas na integração externa não devem comprometer as regras de
   *   mascaramento, anonimização ou não exposição de dados sensíveis.
   * - O serviço deve preservar requisitos de segurança operacional e observabilidade,
   *   permitindo análise de falhas sem vazar informações confidenciais do cliente.
   */
  test('@local @local-only CT-029/CT-030 - logs não devem expor payload sensível integral', async ({ apiClient, mockInfra }) => {
    await mockInfra.stubWhatsappFailure(500);

    const sensitivePhone = '11988881234';
    const sensitiveVoucherCode = '987654';
    const response = await apiClient.sendWhatsapp(whatsappPayload({
      transactionId: 'trx-observability-001',
      cellPhone: sensitivePhone,
      message: `Seu codigo Vale Gas e ${sensitiveVoucherCode}`,
      extraInfo: { voucherId: 'VCH-OBS-001' }
    }));

    await expectStatus(response, 202);

    const logs = execFileSync('docker', [
      'compose',
      '--env-file',
      '.env.local',
      '-f',
      'infra/docker-compose.local.yml',
      'logs',
      '--no-color',
      '--tail',
      '250',
      'ms-notification'
    ], { encoding: 'utf-8' });

    expect(logs).not.toContain(sensitiveVoucherCode);
    expect(logs).not.toContain(`"cellPhone":"${sensitivePhone}"`);
  });
});
