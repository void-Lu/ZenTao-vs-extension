import { describe, expect, it, vi } from 'vitest';
import RequestLogger from '../requestLogger';
import { ZenTaoClient } from '../zentaoClient';

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

  it('fetches product stories with the v1 product stories endpoint', async () => {
    const urls: string[] = [];
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({ stories: [{ id: 101 }] });
      }
    });

    const data = await client.getProductStories(169);

    expect(data).toEqual({ stories: [{ id: 101 }] });
    expect(urls[0]).toBe('https://zentao.example.com/api.php/v1/products/169/stories');
  });

  it('fetches execution stories with the v1 execution stories endpoint', async () => {
    const urls: string[] = [];
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({ stories: [{ id: 101 }] });
      }
    });

    const data = await client.getExecutionStories(201);

    expect(data).toEqual({ stories: [{ id: 101 }] });
    expect(urls[0]).toBe('https://zentao.example.com/api.php/v1/executions/201/stories');
  });

  it('falls back to the legacy product query endpoint when product stories endpoint fails', async () => {
    const urls: string[] = [];
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return urls.length === 1
          ? jsonResponse({ error: 'forbidden' }, 403)
          : jsonResponse({ stories: [{ id: 101 }] });
      }
    });

    const data = await client.getProductStories(169);

    expect(data).toEqual({ stories: [{ id: 101 }] });
    expect(urls).toEqual([
      'https://zentao.example.com/api.php/v1/products/169/stories',
      'https://zentao.example.com/api.php/v1/stories?product=169'
    ]);
  });

  it('fetches accessible projects with pagination and token header', async () => {
    const urls: string[] = [];
    let sentHeaders: Headers | undefined;
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        urls.push(String(input));
        sentHeaders = new Headers(init?.headers);
        if (urls.length === 1) {
          return jsonResponse({ page: 1, total: 2, limit: 1, projects: [{ id: 1, name: 'Alpha' }] });
        }
        return jsonResponse({ page: 1, total: 2, limit: 2, projects: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }] });
      }
    });

    const data = await client.getProjects();

    expect(data).toEqual({ page: 1, total: 2, limit: 2, projects: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }] });
    expect(urls).toEqual([
      'https://zentao.example.com/api.php/v1/projects',
      'https://zentao.example.com/api.php/v1/projects?limit=2'
    ]);
    expect(sentHeaders?.get('Token')).toBe('abc');
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

  it('normalizes API paths with leading slashes or API prefixes', async () => {
    const fetches: string[] = [];
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => undefined,
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (input: RequestInfo | URL) => {
        fetches.push(String(input));
        return jsonResponse({ id: 1 });
      }
    });

    await client.get('/projects/123');
    await client.get('/api.php/v1/projects/456');

    expect(fetches).toEqual([
      'https://zentao.example.com/api.php/v1/projects/123',
      'https://zentao.example.com/api.php/v1/projects/456'
    ]);
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

  it('refreshes token once on 401 and retries the current request with the fresh token', async () => {
    const sentTokens: Array<string | null> = [];
    const refreshToken = vi.fn(async () => 'fresh-token');
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'expired-token',
      setToken: async () => undefined,
      refreshToken,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        sentTokens.push(headers.get('Token'));
        return sentTokens.length === 1 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse({ id: 123 });
      }
    });

    await expect(client.get('projects/123')).resolves.toEqual({ id: 123 });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(sentTokens).toEqual(['expired-token', 'fresh-token']);
  });

  it('retries up to 3 times on 401 before giving up', async () => {
    const refreshToken = vi.fn(async () => 'fresh-token');
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'expired-token',
      setToken: async () => undefined,
      refreshToken,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async () => jsonResponse({ error: 'unauthorized' }, 401)
    });

    await expect(client.get('projects/123')).rejects.toMatchObject({ status: 401 });
    // 初次请求 + 3 次自动重登重试 = refreshToken 调用 3 次。
    expect(refreshToken).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-401 errors', async () => {
    const refreshToken = vi.fn(async () => 'fresh-token');
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'expired-token',
      setToken: async () => undefined,
      refreshToken,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async () => jsonResponse({ error: 'forbidden' }, 403)
    });

    await expect(client.get('projects/123')).rejects.toMatchObject({ status: 403 });
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('succeeds when a later 401 retry returns 200', async () => {
    const refreshToken = vi.fn(async (call: number) => `fresh-${call}`);
    let refreshCalls = 0;
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'expired-token',
      setToken: async () => undefined,
      refreshToken: async () => {
        refreshCalls += 1;
        return refreshToken(refreshCalls);
      },
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const token = headers.get('Token');
        // 前两次重试仍 401，第三次成功。
        if (token === 'expired-token' || token === 'fresh-1' || token === 'fresh-2') {
          return jsonResponse({ error: 'unauthorized' }, 401);
        }
        return jsonResponse({ id: 123 });
      }
    });

    await expect(client.get('projects/123')).resolves.toEqual({ id: 123 });
    expect(refreshCalls).toBe(3);
  });

  it('stops retrying on 401 when refreshToken returns undefined', async () => {
    const refreshToken = vi.fn(async () => undefined);
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'expired-token',
      setToken: async () => undefined,
      refreshToken,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async () => jsonResponse({ error: 'unauthorized' }, 401)
    });

    await expect(client.get('projects/123')).rejects.toMatchObject({ status: 401 });
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it('does not pass internal withoutToken flag to fetch', async () => {
    let sentInit: Record<string, unknown> | undefined;
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => undefined,
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentInit = init as Record<string, unknown>;
        return jsonResponse({ token: 'abc' });
      }
    });

    await client.login('admin', 'secret');

    expect(sentInit).not.toHaveProperty('withoutToken');
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

  it('redacts sensitive values from API error paths', async () => {
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} } as any),
      fetch: async () => jsonResponse({ error: 'nope' }, 403)
    });

    await expect(client.get('projects/123?token=abc123&password=secret')).rejects.toMatchObject({
      status: 403,
      path: 'projects/123?token=[REDACTED]&password=[REDACTED]'
    });
  });
});
