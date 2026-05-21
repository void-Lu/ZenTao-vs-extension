import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, readExtensionConfig, CredentialsStore, KEY_ACCOUNT, KEY_PASSWORD, KEY_TOKEN } from './configuration';

class InMemorySecrets {
  private storage = new Map<string, string>();
  constructor(private failOnStoreKey?: string) {}
  get(key: string): Thenable<string | undefined> {
    return Promise.resolve(this.storage.get(key));
  }
  store(key: string, value: string): Thenable<void> {
    if (this.failOnStoreKey && key === this.failOnStoreKey) {
      return Promise.reject(new Error('simulated store failure'));
    }
    this.storage.set(key, value);
    return Promise.resolve();
  }
  delete(key: string): Thenable<void> {
    this.storage.delete(key);
    return Promise.resolve();
  }
}

describe('normalizeBaseUrl', () => {
  it('keeps https URLs and appends a trailing slash', () => {
    expect(normalizeBaseUrl('https://zentao.example.com')).toBe('https://zentao.example.com/');
  });

  it('rejects non-http URLs', () => {
    expect(() => normalizeBaseUrl('file:///tmp/zentao')).toThrow('ZenTao URL must use http or https.');
  });
});

describe('readExtensionConfig', () => {
  it('reads normalized workspace configuration', () => {
    const config = readExtensionConfig({
      get<T>(key: string): T | undefined {
        const values: Record<string, unknown> = {
          baseUrl: 'http://127.0.0.1/zentao',
          projectId: 123,
          requestTimeout: 5000
        };
        return values[key] as T | undefined;
      }
    });

    expect(config).toEqual({
      baseUrl: 'http://127.0.0.1/zentao/',
      projectId: 123,
      requestTimeout: 5000
    });
  });

  it('rejects invalid project IDs', () => {
    const badConfigs = [0, -1, 1.5, undefined];
    for (const val of badConfigs) {
      expect(() =>
        readExtensionConfig({
          get<T>(key: string): T | undefined {
            const values: Record<string, unknown> = {
              baseUrl: 'http://127.0.0.1/zentao',
              projectId: val as unknown,
              requestTimeout: 5000
            };
            return values[key] as T | undefined;
          }
        })
      ).toThrow('ZenTao project ID must be a positive integer.');
    }
  });
});

describe('CredentialsStore', () => {
  it('stores and retrieves credentials successfully', async () => {
    const mem = new InMemorySecrets();
    const store = new CredentialsStore(mem as any);

    await store.storeLogin('alice', 's3cr3t', 'tok-1');
    const creds = await store.getCredentials();
    expect(creds.account).toBe('alice');
    expect(creds.password).toBe('s3cr3t');
    expect(creds.token).toBe('tok-1');
  });

  it('rolls back when a store operation fails', async () => {
    // fail on password write (middle operation)
    const mem = new InMemorySecrets(KEY_PASSWORD);
    const store = new CredentialsStore(mem as any);

    await expect(store.storeLogin('bob', 'hunter2', 'tok-2')).rejects.toThrow('simulated store failure');

    const creds = await store.getCredentials();
    // All keys should have been removed by the rollback
    expect(creds.account).toBeUndefined();
    expect(creds.password).toBeUndefined();
    expect(creds.token).toBeUndefined();
  });

  it('validates inputs for storeLogin and storeToken', async () => {
    const mem = new InMemorySecrets();
    const store = new CredentialsStore(mem as any);

    await expect(store.storeLogin('   ', 'pw', 'tok')).rejects.toThrow('account is required');
    await expect(store.storeLogin('alice', '', 'tok')).rejects.toThrow('password is required');
    await expect(store.storeLogin('alice', 'pw', '   ')).rejects.toThrow('token is required');

    await expect(store.storeToken('   ')).rejects.toThrow('token is required');
  });

  it('serializes concurrent write operations in-process', async () => {
    // Recording secrets that delay operations to make interleaving visible
    class RecordingSecrets {
      storage = new Map<string, string>();
      ops: string[] = [];
      delay(ms: number) {
        return new Promise((res) => setTimeout(res, ms));
      }
      async get(key: string): Promise<string | undefined> {
        return this.storage.get(key);
      }
      async store(key: string, value: string): Promise<void> {
        this.ops.push(`store:${key}:${value}`);
        // delay to allow potential interleaving if not serialized
        await this.delay(20);
        this.storage.set(key, value);
      }
      async delete(key: string): Promise<void> {
        this.ops.push(`delete:${key}`);
        await this.delay(5);
        this.storage.delete(key);
      }
    }

    const mem = new RecordingSecrets();
    const store = new CredentialsStore(mem as any);

    // start storeLogin then immediately start storeToken concurrently
    const p1 = store.storeLogin('carol', 'pw', 'tok-A');
    const p2 = store.storeToken('tok-B');

    await Promise.all([p1, p2]);

    // Expect that the three stores for storeLogin happened before the concurrent storeToken
    const expectedPrefix = [`store:${KEY_ACCOUNT}:carol`, `store:${KEY_PASSWORD}:pw`, `store:${KEY_TOKEN}:tok-A`, `store:${KEY_TOKEN}:tok-B`];
    expect(mem.ops).toEqual(expectedPrefix);
    // Final stored token should be the one from the second operation (tok-B)
    const creds = await store.getCredentials();
    expect(creds.token).toBe('tok-B');
  });
});
