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
});
