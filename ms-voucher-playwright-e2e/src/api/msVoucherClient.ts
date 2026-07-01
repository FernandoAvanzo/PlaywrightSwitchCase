import { APIRequestContext } from '@playwright/test';
import { SuiteEnv } from '../config/env';

export class MsVoucherClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly env: SuiteEnv
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      customerId: this.env.data.customerId,
      customerSiteId: this.env.data.customerSiteId,
      ...extra
    };
  }

  getSetup() {
    return this.request.get('/backoffice/vouchers/setup');
  }

  updateSetup(payload: Record<string, unknown>) {
    return this.request.put('/backoffice/vouchers/setup', { data: payload });
  }

  importGestaoVgPricingRules(payload: unknown) {
    return this.request.post('/backoffice/vouchers/pricing-rules/gestao-vg', { data: payload });
  }

  getPrices(params: Record<string, string>) {
    return this.request.get('/prices', {
      params,
      headers: this.headers()
    });
  }

  sellVoucherBackoffice(payload: unknown) {
    return this.request.post('/backoffice/vouchers', {
      data: payload,
      headers: this.headers()
    });
  }

  changeVoucherStatus(payload: unknown) {
    return this.request.post('/backoffice/vouchers/change-status', { data: payload });
  }

  confirmSell(payload: unknown) {
    return this.request.post('/backoffice/vouchers/confirm-sell', { data: payload });
  }
}
