export function parseBodies(requests: Array<{ body?: string }>): unknown[] {
  return requests.map(r => r.body ? JSON.parse(r.body) : undefined);
}
