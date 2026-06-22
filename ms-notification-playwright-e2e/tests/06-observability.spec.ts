import { execFileSync } from 'node:child_process';
import { test, expect } from '../src/fixtures/api';
import { whatsappPayload } from '../src/data/payloads';
import { expectStatus } from '../src/utils/response';

test.describe('Observabilidade e segurança operacional', () => {
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
