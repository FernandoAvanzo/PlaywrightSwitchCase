import { defineConfig } from '@playwright/test';
import { loadEnvironment } from './src/config/environment';

const env = loadEnvironment();

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: `${env.baseUrl}/`,
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR',
      'Content-Type': 'application/json'
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  outputDir: 'test-results/artifacts'
});
