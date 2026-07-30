import { APIRequestContext } from '@playwright/test';
import { SuiteEnv } from '../config/env.js';
import { BatchRequestOptions, VoucherBatchBlockPayload } from './voucherBatchOperations.js';

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

  private url(path: string) {
    return `${this.env.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  private languageHeaders(options: BatchRequestOptions = {}): Record<string, string> {
    if (options.acceptLanguage === null) {
      return {};
    }
    return {
      'Accept-Language': options.acceptLanguage ?? this.env.acceptLanguage
    };
  }

  getHealth() {
    return this.request.get(this.url('actuator/health'));
  }

  getSetup() {
    return this.request.get(this.url('backoffice/vouchers/setup'));
  }

  updateSetup(payload: Record<string, unknown>) {
    return this.request.put(this.url('backoffice/vouchers/setup'), { data: payload });
  }

  importGestaoVgPricingRules(payload: unknown) {
    return this.request.post(this.url('backoffice/vouchers/pricing-rules/gestao-vg'), { data: payload });
  }

  getPrices(params: Record<string, string>) {
    return this.request.get(this.url('prices'), {
      params,
      headers: this.headers()
    });
  }

  handleFepas(payload: Record<string, unknown>) {
    return this.request.post(this.url('se-fepas'), { data: payload });
  }

  sellVoucherBackoffice(payload: unknown) {
    return this.request.post(this.url('backoffice/vouchers'), {
      data: payload,
      headers: this.headers()
    });
  }

  changeVoucherStatus(payload: unknown) {
    return this.request.post(this.url('backoffice/vouchers/change-status'), { data: payload });
  }

  confirmSell(payload: unknown) {
    return this.request.post(this.url('backoffice/vouchers/confirm-sell'), { data: payload });
  }

  createVoucherBatchBlock(payload: VoucherBatchBlockPayload | Record<string, unknown>, options: BatchRequestOptions = {}) {
    return this.request.post(this.url('voucher-batch-operations/block'), {
      data: payload,
      headers: this.languageHeaders(options)
    });
  }

  getVoucherBatchOperation(operationId: string, options: BatchRequestOptions = {}) {
    return this.request.get(this.url(`voucher-batch-operations/${encodeURIComponent(operationId)}`), {
      headers: this.languageHeaders(options)
    });
  }
}
