import { test as base, expect, request } from '@playwright/test';
import { MsNotificationClient } from '../clients/ms-notification-client';
import { MockInfraClient } from '../clients/mock-infra-client';
import { SqsTestClient } from '../clients/sqs-test-client';
import { env, isLocal } from '../config/environment';

type Fixtures = {
  apiClient: MsNotificationClient;
  salesforceApiClient: MsNotificationClient;
  mockInfra: MockInfraClient;
  sqs: SqsTestClient;
};

export const test = base.extend<Fixtures>({
  apiClient: async ({ request }, use) => {
    await use(new MsNotificationClient(request, env));
  },

  salesforceApiClient: async ({ mockInfra }, use) => {
    // O token do mock expira em um segundo. A espera isola o cache da instância
    // Salesforce entre cenários sem reiniciar o container da aplicação.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const context = await request.newContext({
      baseURL: env.salesforceBaseURL,
      extraHTTPHeaders: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'pt-BR'
      }
    });

    try {
      await use(new MsNotificationClient(context, env));
    } finally {
      await context.dispose();
    }
  },

  mockInfra: async ({}, use) => {
    const client = new MockInfraClient(env.mockBaseURL);
    if (isLocal()) {
      await client.reset();
    }
    await use(client);
  },

  sqs: async ({}, use) => {
    const client = new SqsTestClient(env);
    if (isLocal()) {
      await client.purgeKnownQueues();
    }
    await use(client);
  }
});

export { expect, request };
export type { APIRequestContext } from '@playwright/test';
