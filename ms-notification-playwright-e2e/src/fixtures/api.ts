import { test as base, expect, request } from '@playwright/test';
import { MsNotificationClient } from '../clients/ms-notification-client';
import { MockInfraClient } from '../clients/mock-infra-client';
import { SqsTestClient } from '../clients/sqs-test-client';
import { env, isLocal } from '../config/environment';

type Fixtures = {
  apiClient: MsNotificationClient;
  mockInfra: MockInfraClient;
  sqs: SqsTestClient;
};

export const test = base.extend<Fixtures>({
  apiClient: async ({ request }, use) => {
    await use(new MsNotificationClient(request, env));
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
