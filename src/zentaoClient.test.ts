import { describe, expect, it, vi } from 'vitest';
import RequestLogger from './requestLogger';
import { ZenTaoClient } from './zentaoClient';

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0)
  } as any;
}

describe('ZenTaoClient', () => {
  it('login posts to tokens and returns token', async () => {
    const fetches: Array<{ url: string; init?: RequestInit | undefined }> = [];

    const client = new (ZenTaoClient as any)({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => undefined,
      setToken: async (_: string) => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        fetches.push({ url: String(input), init });
        return jsonResponse({ token: 'abc' });
      }
    });

    await expect(client.login('admin', 'secret')).resolves.toBe('abc');
    expect(fetches[0].url).toBe('https://zentao.example.com/api.php/v1/tokens');
    expect(fetches[0].init?.method).toBe('POST');
    // ensure request body does not leak token and carries account/password
    expect(fetches[0].init?.body).toBeDefined();
    const body = JSON.parse(String(fetches[0].init?.body));
    expect(body).toEqual({ account: 'admin', password: 'secret' });
  });

  it('fetches paged data again with total as limit', async () => {
    const urls: string[] = [];
    const client = new (ZenTaoClient as any)({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo) => {
        urls.push(String(input));
        if (urls.length === 1) {
          return jsonResponse({ page: 1, total: 2, limit: 1, stories: [{ id: 1 }, { id: 2 }] });
        }
        return jsonResponse({ page: 1, total: 2, limit: 2, stories: [{ id: 1 }, { id: 2 }] });
      }
    });

    const data = await client.getAll('projects/123/stories');
    expect(data.stories.map((item: any) => item.id)).toEqual([1, 2]);
    expect(urls[1]).toBe('https://zentao.example.com/api.php/v1/projects/123/stories?limit=2');
  });

  it('supports baseUrl that already contains /api.php/v1/', async () => {
    const fetches: string[] = [];
    const client = new (ZenTaoClient as any)({
      baseUrl: 'https://zentao.example.com/api.php/v1/',
      timeoutMs: 5000,
      getToken: async () => undefined,
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo) => {
        fetches.push(String(input));
        return jsonResponse({ token: 'tok' });
      }
    });

    await client.login('u', 'p');
    expect(fetches[0]).toBe('https://zentao.example.com/api.php/v1/tokens');
  });

  it('sets Token header and preserves caller headers', async () => {
    let sentHeaders: Headers | undefined;
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentHeaders = new Headers(init?.headers);
        return jsonResponse({ id: 1 });
      }
    });

    await client.get('projects/123');

    expect(sentHeaders?.get('Token')).toBe('abc');
  });

  it('throws a clear error when no fetch implementation is available', () => {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: undefined });

    try {
      expect(() => new ZenTaoClient({
        baseUrl: 'https://zentao.example.com/',
        timeoutMs: 5000,
        getToken: async () => undefined,
        setToken: async () => undefined,
        logger: new RequestLogger({ appendLine() {}, show() {} } as any)
      })).toThrow('No fetch implementation available. Pass fetch in ZenTaoClientOptions.');
    } finally {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    }
  });
});
