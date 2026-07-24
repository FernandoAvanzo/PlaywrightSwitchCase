import { request, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

type HeaderPattern = {
  equalTo?: string;
  contains?: string;
  matches?: string;
  absent?: boolean;
};

type StubOptions = {
  name: string;
  urlPattern?: string;
  urlPath?: string;
  status: number;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  requestHeaders?: Record<string, HeaderPattern>;
  bodyPatterns?: unknown[];
  priority?: number;
  scenarioName?: string;
  requiredScenarioState?: string;
  newScenarioState?: string;
  fixedDelayMilliseconds?: number;
};

export type LoggedRequest = {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string[]>;
};

function normalizeLoggedRequest(value: unknown): LoggedRequest {
  const request = value as {
    method?: string;
    url?: string;
    body?: string;
    headers?: Record<string, unknown>;
  };

  const headers = Object.entries(request.headers ?? {}).reduce<Record<string, string[]>>((acc, [key, rawValue]) => {
    const wireMockHeader = rawValue as { values?: string[]; value?: string } | string[] | string;
    const values = Array.isArray(wireMockHeader)
      ? wireMockHeader.map(String)
      : typeof wireMockHeader === 'string'
        ? [wireMockHeader]
        : wireMockHeader.values ?? (wireMockHeader.value ? [wireMockHeader.value] : []);

    acc[key.toLowerCase()] = values;
    return acc;
  }, {});

  return {
    method: request.method ?? '',
    url: request.url ?? '',
    body: request.body ?? '',
    headers
  };
}

export function headerValues(request: LoggedRequest, headerName: string): string[] {
  return request.headers[headerName.toLowerCase()] ?? [];
}

export function requestJson<T>(request: LoggedRequest): T {
  return JSON.parse(request.body || '{}') as T;
}

export class MockInfraClient {
  private context?: APIRequestContext;

  constructor(private readonly baseURL?: string) {}

  private async api(): Promise<APIRequestContext> {
    if (!this.baseURL) {
      throw new Error('MOCK_BASE_URL não configurado para este ambiente.');
    }
    this.context ??= await request.newContext({ baseURL: this.baseURL });
    return this.context;
  }

  async reset(): Promise<void> {
    if (!this.baseURL) return;
    const api = await this.api();
    await api.delete('/__admin/mappings');
    await api.delete('/__admin/requests');
  }

  async stubPost(options: StubOptions): Promise<void> {
    const api = await this.api();
    const requestMatcher = options.urlPath
      ? { method: 'POST', urlPath: options.urlPath }
      : { method: 'POST', urlPattern: options.urlPattern };

    if (!options.urlPath && !options.urlPattern) {
      throw new Error(`Stub ${options.name} precisa informar urlPath ou urlPattern.`);
    }

    const response = await api.post('/__admin/mappings', {
      data: {
        name: options.name,
        ...(options.priority ? { priority: options.priority } : {}),
        ...(options.scenarioName ? { scenarioName: options.scenarioName } : {}),
        ...(options.requiredScenarioState ? { requiredScenarioState: options.requiredScenarioState } : {}),
        ...(options.newScenarioState ? { newScenarioState: options.newScenarioState } : {}),
        request: {
          ...requestMatcher,
          ...(options.requestHeaders ? { headers: options.requestHeaders } : {}),
          ...(options.bodyPatterns ? { bodyPatterns: options.bodyPatterns } : {})
        },
        response: {
          status: options.status,
          ...(options.rawBody !== undefined
            ? { body: options.rawBody }
            : { jsonBody: options.body ?? { status: 'OK', providerMessageId: `mock-${Date.now()}` } }),
          ...(options.fixedDelayMilliseconds
            ? { fixedDelayMilliseconds: options.fixedDelayMilliseconds }
            : {}),
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers ?? {})
          }
        }
      }
    });
    expect(response.ok()).toBeTruthy();
  }

  async stubBlipLookupWithAlternativeAccount(
    alternativeAccount = '5511988881234@wa.gw.msging.net',
    identity = '+5511988881234@wa.gw.msging.net'
  ): Promise<void> {
    await this.stubPost({
      name: 'blip-lookup-alternative-account',
      urlPath: '/commands',
      status: 200,
      body: {
        id: 'blip-command-id',
        status: 'success',
        resource: {
          identity,
          alternativeAccount
        }
      }
    });
  }

  async stubBlipLookupWithIdentity(identity = 'identity-11988881234@wa.gw.msging.net'): Promise<void> {
    await this.stubPost({
      name: 'blip-lookup-identity',
      urlPath: '/commands',
      status: 200,
      body: {
        id: 'blip-command-id',
        status: 'success',
        resource: { identity }
      }
    });
  }

  async stubBlipLookupWithoutDestination(): Promise<void> {
    await this.stubPost({
      name: 'blip-lookup-without-destination',
      urlPath: '/commands',
      status: 200,
      body: {
        id: 'blip-command-id',
        status: 'success',
        resource: {}
      }
    });
  }

  async stubBlipLookupFailure(status = 503): Promise<void> {
    await this.stubPost({
      name: `blip-lookup-failure-${status}`,
      urlPath: '/commands',
      status,
      body: {
        id: 'blip-command-id',
        status: 'failure',
        reason: `BLIP_COMMAND_${status}`
      }
    });
  }

  async stubBlipMessageSuccess(): Promise<void> {
    await this.stubPost({
      name: 'blip-message-success',
      urlPath: '/messages',
      status: 202,
      body: {
        id: 'blip-message-id',
        status: 'ACCEPTED'
      }
    });
  }

  async stubBlipMessageFailure(status = 400): Promise<void> {
    await this.stubPost({
      name: `blip-message-failure-${status}`,
      urlPath: '/messages',
      status,
      body: {
        id: 'blip-message-id',
        status: 'REJECTED',
        reason: `BLIP_MESSAGE_${status}`
      }
    });
  }

  async stubBlipSuccessWithAlternativeAccount(): Promise<void> {
    await this.stubBlipLookupWithAlternativeAccount();
    await this.stubBlipMessageSuccess();
  }

  async stubBlipSuccessWithIdentity(identity = 'identity-11988881234@wa.gw.msging.net'): Promise<void> {
    await this.stubBlipLookupWithIdentity(identity);
    await this.stubBlipMessageSuccess();
  }

  async stubSalesforceOAuthSuccess(
    accessToken = 'salesforce-access-token-synthetic',
    options: { fixedDelayMilliseconds?: number } = {}
  ): Promise<void> {
    await this.stubPost({
      name: 'salesforce-oauth-success',
      urlPath: '/services/oauth2/token',
      status: 200,
      body: {
        access_token: accessToken,
        instance_url: 'https://wiremock:8443',
        token_type: 'Bearer',
        expires_in: 1
      },
      requestHeaders: {
        'Content-Type': { contains: 'application/x-www-form-urlencoded' }
      },
      bodyPatterns: [
        { contains: 'grant_type=client_credentials' },
        { contains: 'client_id=local-salesforce-client' },
        { contains: 'client_secret=local-salesforce-secret' }
      ],
      fixedDelayMilliseconds: options.fixedDelayMilliseconds
    });
  }

  async stubSalesforceAccepted(
    flow: 'voucher' | 'appAuth' = 'voucher',
    correlationId = `sf-correlation-${Date.now()}`,
    message = 'Mensagem aceita para processamento'
  ): Promise<void> {
    await this.stubPost({
      name: `salesforce-${flow}-accepted`,
      urlPath: `/services/apexrest/messaging/${flow}`,
      status: 202,
      body: {
        success: true,
        correlationId,
        message
      },
      requestHeaders: {
        Authorization: { matches: '^Bearer .+' },
        'Content-Type': { contains: 'application/json' }
      }
    });
  }

  async stubSalesforceFailure(
    status: number,
    options: {
      flow?: 'voucher' | 'appAuth';
      body?: unknown;
      rawBody?: string;
      fixedDelayMilliseconds?: number;
    } = {}
  ): Promise<void> {
    const flow = options.flow ?? 'voucher';
    await this.stubPost({
      name: `salesforce-${flow}-failure-${status}`,
      urlPath: `/services/apexrest/messaging/${flow}`,
      status,
      body: options.body ?? {
        success: false,
        message: `Salesforce mocked failure ${status}`,
        errorMessage: `SALESFORCE_${status}`
      },
      rawBody: options.rawBody,
      fixedDelayMilliseconds: options.fixedDelayMilliseconds
    });
  }

  async stubSalesforceUnauthorizedThenAccepted(
    flow: 'voucher' | 'appAuth' = 'voucher',
    correlationId = `sf-correlation-refreshed-${Date.now()}`
  ): Promise<void> {
    const scenarioName = `salesforce-refresh-${flow}-${Date.now()}`;
    await this.stubPost({
      name: `salesforce-${flow}-first-unauthorized`,
      urlPath: `/services/apexrest/messaging/${flow}`,
      status: 401,
      body: { success: false, errorMessage: 'Token expirado' },
      scenarioName,
      requiredScenarioState: 'Started',
      newScenarioState: 'TOKEN_REFRESHED',
      priority: 1
    });
    await this.stubPost({
      name: `salesforce-${flow}-accepted-after-refresh`,
      urlPath: `/services/apexrest/messaging/${flow}`,
      status: 202,
      body: {
        success: true,
        correlationId,
        message: 'Mensagem aceita após renovação'
      },
      scenarioName,
      requiredScenarioState: 'TOKEN_REFRESHED',
      priority: 1
    });
  }

  async stubSmsSuccess(): Promise<void> {
    await this.stubPost({
      name: 'sms-provider-success',
      urlPattern: '.*(sms|infobip).*',
      status: 200,
      body: {
        sendSmsResponse: {
          statusCode: '00',
          statusDescription: 'OK',
          detailCode: '000',
          detailDescription: 'Message sent'
        },
        bulkId: 'bulk-sms-mock-ok',
        messages: [
          {
            messageId: 'sms-mock-ok',
            destination: '5511988881234',
            status: {
              groupId: 3,
              groupName: 'DELIVERED',
              id: 5,
              name: 'DELIVERED_TO_HANDSET',
              description: 'Message delivered'
            }
          }
        ]
      }
    });
  }

  async stubSmsFailure(status = 500): Promise<void> {
    await this.stubPost({
      name: `sms-provider-failure-${status}`,
      urlPattern: '.*(sms|infobip).*',
      status,
      body: { status: 'ERROR', code: status, message: 'SMS provider mocked failure' }
    });
  }

  async stubWhatsappSuccess(): Promise<void> {
    await this.stubBlipSuccessWithAlternativeAccount();
  }

  async stubWhatsappFailure(status = 500): Promise<void> {
    await this.stubBlipLookupWithAlternativeAccount();
    await this.stubBlipMessageFailure(status);
  }

  async stubShortenerSuccess(): Promise<void> {
    await this.stubPost({
      name: 'shortener-success',
      urlPattern: '.*(shortener|firebase).*',
      status: 200,
      body: { shortLink: 'https://short.local/abc123', previewLink: 'https://short.local/preview/abc123' }
    });
  }

  async stubShortenerFailure(): Promise<void> {
    await this.stubPost({
      name: 'shortener-failure',
      urlPattern: '.*(shortener|firebase).*',
      status: 500,
      body: { error: { message: 'shortener mocked failure' } }
    });
  }

  async countRequests(urlPattern: string): Promise<number> {
    const api = await this.api();
    const response = await api.post('/__admin/requests/count', {
      data: {
        method: 'POST',
        urlPattern
      }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json() as { count: number };
    return body.count;
  }

  async findRequests(urlPattern: string): Promise<LoggedRequest[]> {
    const api = await this.api();
    const response = await api.post('/__admin/requests/find', {
      data: {
        method: 'POST',
        urlPattern
      }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json() as { requests?: Array<{ request?: unknown }> };
    return (body.requests ?? []).map((entry) => normalizeLoggedRequest(entry.request ?? entry));
  }

  async latestRequest(urlPattern: string): Promise<LoggedRequest | undefined> {
    const requests = await this.findRequests(urlPattern);
    return requests.at(-1);
  }
}
