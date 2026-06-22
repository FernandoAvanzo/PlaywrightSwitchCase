import { expect } from '@playwright/test';
import type { APIResponse } from '@playwright/test';

export async function expectStatus(response: APIResponse, expected: number): Promise<void> {
  const text = await response.text();
  expect(response.status(), `Body recebido: ${text}`).toBe(expected);
}

export async function optionalJson<T = Record<string, unknown>>(response: APIResponse): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
