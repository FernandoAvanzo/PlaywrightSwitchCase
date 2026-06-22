import { defineConfig } from '@playwright/test';
import { loadEnvironment } from './src/config/environment';

const env = loadEnvironment();

export default defineConfig({
  testDir: './tests',
  timeout: env.testTimeoutMs,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: env.name === 'local' || env.name === 'prod' ? 1 : undefined,
  outputDir: `test-results/${env.name}`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `reports/html/${env.name}`, open: 'never' }],
    ['junit', { outputFile: `reports/junit/${env.name}.xml` }],
    ['json', { outputFile: `reports/json/${env.name}.json` }]
  ],
  use: {
    baseURL: env.baseURL,
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': 'pt-BR'
    },
    trace: 'retain-on-failure'
  },
  metadata: {
    environment: env.name,
    baseURL: env.baseURL
  },
  projects: [
    {
      name: `${env.name}-api`,
      testMatch: /.*\.spec\.ts/
    }
  ]
});
