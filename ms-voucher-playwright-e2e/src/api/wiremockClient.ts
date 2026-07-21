import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

type WireMockCountResponse = {
  count: number;
};

type WireMockRequestJournalResponse = {
  requests: Array<{
    body?: string;
    request?: {
      body?: string;
    };
  }>;
};

type SoapBlockResult = {
  voucherCode: string;
  responseCode: string;
  responseMessage: string;
};

const SOAP_ENVELOPE_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/';
const EVALE_SERVICE_NAMESPACE = 'http://service.ultragaz.com.br/ebs/Evale/v5';
const EVALE_CANONICAL_NAMESPACE = 'http://canonico.ultragaz.com.br/ebs/v1';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export class WireMockClient {
  private context?: APIRequestContext;

  constructor(private readonly adminUrl: string) {}

  private async api() {
    if (!this.adminUrl) {
      throw new Error('WIREMOCK admin URL não configurada.');
    }

    if (!this.context) {
      this.context = await playwrightRequest.newContext({
        extraHTTPHeaders: { 'Content-Type': 'application/json' }
      });
    }

    return this.context;
  }

  private url(path: string) {
    return `${this.adminUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  private soapBlockBodyPattern(voucherCode: string) {
    const code = escapeRegex(voucherCode);
    const voucherElement = '(?:codigoAutorizacao|numeroEvale)';
    return `(?s).*<(?:[A-Za-z_][\\w.-]*:)?${voucherElement}(?:\\s[^>]*)?>\\s*${code}\\s*</(?:[A-Za-z_][\\w.-]*:)?${voucherElement}>.*`;
  }

  private async addMapping(mapping: Record<string, unknown>) {
    const api = await this.api();
    const response = await api.post(this.url('mappings'), { data: mapping });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async resetAllToDefaultMappings() {
    const api = await this.api();
    const response = await api.post(this.url('reset'));
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async resetRequests() {
    const api = await this.api();
    const response = await api.delete(this.url('requests'));
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async setEndpointFailure(path: string, status = 500) {
    await this.addMapping({
      priority: 1,
      request: { method: 'POST', urlPath: path },
      response: {
        status,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { error: `forced failure for ${path}` }
      }
    });
  }

  async stubSoapBlockResult({ voucherCode, responseCode, responseMessage }: SoapBlockResult) {
    const body = [
      `<soapenv:Envelope xmlns:soapenv="${SOAP_ENVELOPE_NAMESPACE}"`,
      ` xmlns:evale="${EVALE_SERVICE_NAMESPACE}"`,
      ` xmlns:canonical="${EVALE_CANONICAL_NAMESPACE}">`,
      '<soapenv:Body>',
      '<evale:BloquearResponse>',
      '<canonical:nrSolicitacaoContact></canonical:nrSolicitacaoContact>',
      `<canonical:resposta>${escapeXml(responseCode)}</canonical:resposta>`,
      `<canonical:descricaoResposta>${escapeXml(responseMessage)}</canonical:descricaoResposta>`,
      '</evale:BloquearResponse>',
      '</soapenv:Body>',
      '</soapenv:Envelope>'
    ].join('');

    await this.addMapping({
      priority: 1,
      request: {
        method: 'POST',
        urlPath: '/soa',
        bodyPatterns: [{ matches: this.soapBlockBodyPattern(voucherCode) }]
      },
      response: {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
        body
      }
    });
  }

  async stubSoapBlockHttpError(voucherCode: string, status = 503) {
    await this.addMapping({
      priority: 1,
      request: {
        method: 'POST',
        urlPath: '/soa',
        bodyPatterns: [{ matches: this.soapBlockBodyPattern(voucherCode) }]
      },
      response: {
        status,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
        body: 'Falha técnica simulada no SOA/EBS.'
      }
    });
  }

  async stubSoapBlockFault(voucherCode: string, faultCode: string, faultMessage: string) {
    const body = [
      `<soapenv:Envelope xmlns:soapenv="${SOAP_ENVELOPE_NAMESPACE}"`,
      ` xmlns:evale="${EVALE_SERVICE_NAMESPACE}"`,
      ` xmlns:canonical="${EVALE_CANONICAL_NAMESPACE}">`,
      '<soapenv:Body>',
      '<soapenv:Fault>',
      '<faultcode>soapenv:Server</faultcode>',
      `<faultstring>${escapeXml(faultMessage)}</faultstring>`,
      '<detail>',
      '<evale:BloquearFault>',
      `<canonical:codigo>${escapeXml(faultCode)}</canonical:codigo>`,
      `<canonical:mensagem>${escapeXml(faultMessage)}</canonical:mensagem>`,
      '<canonical:instrucao>Acione o suporte do SOA/EBS.</canonical:instrucao>',
      '<canonical:detalhe>Falha técnica controlada pelo teste.</canonical:detalhe>',
      '<canonical:tipo>ERRO_DE_SISTEMA</canonical:tipo>',
      '</evale:BloquearFault>',
      '</detail>',
      '</soapenv:Fault>',
      '</soapenv:Body>',
      '</soapenv:Envelope>'
    ].join('');

    await this.addMapping({
      priority: 1,
      request: {
        method: 'POST',
        urlPath: '/soa',
        bodyPatterns: [{ matches: this.soapBlockBodyPattern(voucherCode) }]
      },
      response: {
        status: 500,
        headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
        body
      }
    });
  }

  async countSoapBlockRequests(voucherCode: string) {
    const api = await this.api();
    const response = await api.post(this.url('requests/count'), {
      data: {
        method: 'POST',
        urlPath: '/soa',
        bodyPatterns: [{ matches: this.soapBlockBodyPattern(voucherCode) }]
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as WireMockCountResponse;
    return body.count;
  }

  async countPostRequests(path: string) {
    const api = await this.api();
    const response = await api.post(this.url('requests/count'), {
      data: {
        method: 'POST',
        urlPath: path
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as WireMockCountResponse;
    return body.count;
  }

  async postRequestBodies(path: string) {
    const api = await this.api();
    const response = await api.post(this.url('requests/find'), {
      data: {
        method: 'POST',
        urlPath: path
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as WireMockRequestJournalResponse;
    return body.requests
      .map(entry => entry.body ?? entry.request?.body)
      .filter((requestBody): requestBody is string => typeof requestBody === 'string');
  }

  async dispose() {
    await this.context?.dispose();
    this.context = undefined;
  }
}
