import { defineConfig } from '@playwright/test';
import { loadEnv } from './src/config/env.js';

const currentEnv = (process.env.TEST_ENV ?? 'local') as 'local' | 'local-hml' | 'hml' | 'prod';
const env = loadEnv(currentEnv);

const commonUse = {
  baseURL: env.baseUrl,
  extraHTTPHeaders: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Accept-Language': env.acceptLanguage,
    'x-correlation-id': `pw-${currentEnv}-${Date.now()}`
  },
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
  video: 'off' as const
};

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: Number(process.env.PW_TEST_TIMEOUT_MS ?? 60_000),
  expect: {
    timeout: Number(process.env.PW_EXPECT_TIMEOUT_MS ?? 10_000)
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  projects: [
    {
      name: 'api-local',
      testMatch: /.*\.spec\.ts/,
      use: commonUse,
      metadata: { environment: 'local' }
    },
    {
      name: 'api-local-hml',
      testMatch: /.*\.spec\.ts/,
      use: commonUse,
      metadata: { environment: 'local-hml', remoteDependencies: 'hml', readOnlyByDefault: true }
    },
    {
      name: 'api-hml',
      testMatch: /.*\.spec\.ts/,
      use: commonUse,
      metadata: { environment: 'hml' }
    },
    {
      name: 'api-prod',
      testMatch: /.*\.spec\.ts/,
      use: commonUse,
      metadata: { environment: 'prod', readOnly: true }
    }
  ].filter(project => project.metadata.environment === currentEnv)
});
