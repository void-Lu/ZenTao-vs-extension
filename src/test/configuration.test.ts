import { describe, expect, it, vi } from 'vitest';
import { migrateLegacyBaseUrlToGlobal, normalizeBaseUrl, readConnectionConfig, readExtensionConfig, readOptionalProjectId, readAccount, storeAccount, CredentialsStore, KEY_PASSWORD, KEY_TOKEN, KEY_ADMIN_TOKEN } from '../configuration';

class InMemorySecrets {
  private storage = new Map<string, string>();
  constructor(private failOnStoreKey?: string, private failOnDeleteKey?: string) {}
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
    if (this.failOnDeleteKey && key === this.failOnDeleteKey) {
      return Promise.reject(new Error('simulated delete failure'));
    }
    this.storage.delete(key);
    return Promise.resolve();
  }
}

describe('normalizeBaseUrl', () => {
  it('keeps https URLs and appends a trailing slash', () => {
    expect(normalizeBaseUrl('https://zentao.example.com')).toBe('https://zentao.example.com/');
  });

  it('rejects URLs containing embedded credentials', () => {
    expect(() => normalizeBaseUrl('https://user:pass@zentao.example.com')).toThrow('ZenTao URL must not include credentials.');
  });

  it('rejects non-http URLs', () => {
    expect(() => normalizeBaseUrl('file:///tmp/zentao')).toThrow('ZenTao URL must use http or https.');
  });
});

describe('readConnectionConfig', () => {
  it('reads global base URL and timeout without requiring a project ID', () => {
    const config = readConnectionConfig({
      get<T>(key: string): T | undefined {
        const values: Record<string, unknown> = {
          requestTimeout: 7000
        };
        return values[key] as T | undefined;
      },
      inspect<T>(key: string): { globalValue?: T } | undefined {
        return key === 'baseUrl' ? { globalValue: 'http://127.0.0.1/zentao' as T } : undefined;
      }
    });

    expect(config).toEqual({
      baseUrl: 'http://127.0.0.1/zentao/',
      requestTimeout: 7000
    });
  });

  it('does not fall back to workspace baseUrl when global baseUrl is invalid', () => {
    expect(() => readConnectionConfig({
      get<T>(key: string): T | undefined {
        return (key === 'requestTimeout' ? 7000 : undefined) as T | undefined;
      },
      inspect<T>(key: string): { globalValue?: T; workspaceValue?: T } | undefined {
        return key === 'baseUrl'
          ? { globalValue: 'not-a-url' as T, workspaceValue: 'https://workspace.example.com' as T }
          : undefined;
      }
    })).toThrow('ZenTao URL must be a valid URL.');
  });

  it('does not read workspace baseUrl as canonical when global baseUrl is missing', () => {
    expect(() => readConnectionConfig({
      get<T>(key: string): T | undefined {
        return (key === 'requestTimeout' ? 7000 : undefined) as T | undefined;
      },
      inspect<T>(key: string): { workspaceValue?: T } | undefined {
        return key === 'baseUrl' ? { workspaceValue: 'https://workspace.example.com' as T } : undefined;
      }
    })).toThrow('ZenTao URL is required.');
  });
});

describe('migrateLegacyBaseUrlToGlobal', () => {
  it('migrates a valid workspace baseUrl to global when global is missing', async () => {
    const updates: Array<{ key: string; value: unknown; target: unknown }> = [];
    const configuration = {
      get<T>(): T | undefined {
        return undefined;
      },
      inspect<T>(key: string): { globalValue?: T; workspaceValue?: T } | undefined {
        return key === 'baseUrl' ? { workspaceValue: 'https://workspace.example.com' as T } : undefined;
      },
      update: vi.fn(async (key: string, value: unknown, target: unknown) => {
        updates.push({ key, value, target });
      })
    };

    const confirmMigration = vi.fn(async () => true);
    const migrated = await migrateLegacyBaseUrlToGlobal(configuration, 'global', confirmMigration);

    expect(confirmMigration).toHaveBeenCalledWith('https://workspace.example.com/');
    expect(migrated).toBe('https://workspace.example.com/');
    expect(updates).toEqual([{ key: 'baseUrl', value: 'https://workspace.example.com/', target: 'global' }]);
  });

  it('does not migrate valid workspace baseUrl when migration is not confirmed', async () => {
    const configuration = {
      get<T>(): T | undefined {
        return undefined;
      },
      inspect<T>(key: string): { workspaceValue?: T } | undefined {
        return key === 'baseUrl' ? { workspaceValue: 'https://workspace.example.com' as T } : undefined;
      },
      update: vi.fn()
    };

    await expect(migrateLegacyBaseUrlToGlobal(configuration, 'global', vi.fn(async () => false))).resolves.toBeUndefined();
    expect(configuration.update).not.toHaveBeenCalled();
  });

  it('does not migrate invalid workspace baseUrl values', async () => {
    const configuration = {
      get<T>(): T | undefined {
        return undefined;
      },
      inspect<T>(key: string): { workspaceValue?: T } | undefined {
        return key === 'baseUrl' ? { workspaceValue: 'file:///tmp/zentao' as T } : undefined;
      },
      update: vi.fn()
    };

    await expect(migrateLegacyBaseUrlToGlobal(configuration, 'global', vi.fn(async () => true))).resolves.toBeUndefined();
    expect(configuration.update).not.toHaveBeenCalled();
  });

  it('keeps valid global baseUrl authoritative and does not migrate workspace values', async () => {
    const configuration = {
      get<T>(): T | undefined {
        return undefined;
      },
      inspect<T>(key: string): { globalValue?: T; workspaceValue?: T } | undefined {
        return key === 'baseUrl'
          ? { globalValue: 'https://global.example.com' as T, workspaceValue: 'https://workspace.example.com' as T }
          : undefined;
      },
      update: vi.fn()
    };

    await expect(migrateLegacyBaseUrlToGlobal(configuration, 'global', vi.fn(async () => true))).resolves.toBeUndefined();
    expect(configuration.update).not.toHaveBeenCalled();
  });
});

describe('readOptionalProjectId', () => {
  it('returns a positive integer project ID when configured', () => {
    const projectId = readOptionalProjectId({
      get<T>(key: string): T | undefined {
        return (key === 'projectId' ? 123 : undefined) as T | undefined;
      }
    });

    expect(projectId).toBe(123);
  });

  it('returns undefined when project ID is missing or invalid', () => {
    for (const value of [undefined, 0, -1, 1.5, '123']) {
      const projectId = readOptionalProjectId({
        get<T>(key: string): T | undefined {
          return (key === 'projectId' ? value : undefined) as T | undefined;
        }
      });

      expect(projectId).toBeUndefined();
    }
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

  it('throws when baseUrl is missing or blank', () => {
    expect(() =>
      readExtensionConfig({
        get<T>(key: string): T | undefined {
          const values: Record<string, unknown> = {
            baseUrl: '   ',
            projectId: 1,
            requestTimeout: 5000
          };
          return values[key] as T | undefined;
        }
      })
    ).toThrow('ZenTao URL is required.');

    expect(() =>
      readExtensionConfig({
        get<T>(key: string): T | undefined {
          const values: Record<string, unknown> = {
            projectId: 1,
            requestTimeout: 5000
          };
          return values[key] as T | undefined;
        }
      })
    ).toThrow('ZenTao URL is required.');
  });

  it('throws for malformed baseUrl', () => {
    expect(() =>
      readExtensionConfig({
        get<T>(key: string): T | undefined {
          const values: Record<string, unknown> = {
            baseUrl: 'not-a-url',
            projectId: 1,
            requestTimeout: 5000
          };
          return values[key] as T | undefined;
        }
      })
    ).toThrow('ZenTao URL must be a valid URL.');
  });
});

describe('CredentialsStore', () => {
  it('stores and retrieves credentials successfully without persisting account to SecretStorage', async () => {
    const mem = new InMemorySecrets();
    const store = new CredentialsStore(mem as any);

    // storeLogin 不再接收 account；账号由配置层维护。
    await store.storeLogin('s3cr3t', 'tok-1', 'https://zentao.example.com/');
    const creds = await store.getCredentials('https://zentao.example.com/');
    expect(creds.account).toBeUndefined();
    expect(creds.password).toBe('s3cr3t');
    expect(creds.token).toBe('tok-1');
    expect((await store.getCredentials('https://other.example.com/')).token).toBeUndefined();
  });

  it('does not read legacy SecretStorage account as the current account', async () => {
    const mem = new InMemorySecrets();
    // 模拟旧版本写入的 account secret。
    await mem.store('zentao.account', 'legacy-user');
    const store = new CredentialsStore(mem as any);

    const creds = await store.getCredentials();
    expect(creds.account).toBeUndefined();
  });

  it('rolls back when a store operation fails', async () => {
    // fail on password write (first operation)
    const mem = new InMemorySecrets(KEY_PASSWORD);
    const store = new CredentialsStore(mem as any);

    await expect(store.storeLogin('hunter2', 'tok-2')).rejects.toThrow('simulated store failure');

    const creds = await store.getCredentials();
    // All keys should have been removed by the rollback
    expect(creds.account).toBeUndefined();
    expect(creds.password).toBeUndefined();
    expect(creds.token).toBeUndefined();
  });

  it('surfaces rollback delete failures as AggregateError', async () => {
    // fail on password write (first operation) and fail to delete password during rollback
    const mem = new InMemorySecrets(KEY_PASSWORD, KEY_PASSWORD);
    const store = new CredentialsStore(mem as any);

    await expect(store.storeLogin('pw', 'tok-3')).rejects.toBeInstanceOf(AggregateError);

    try {
      await store.storeLogin('pw', 'tok-3');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AggregateError);
      expect(err.message).toBe('Failed to store credentials and rollback cleanup failed.');
      // first error should be the original store failure
      expect(err.errors[0].message).toBe('simulated store failure');
      // subsequent errors should include the simulated delete failure
      const hasDeleteFailure = err.errors.some((e: any) => e.message === 'simulated delete failure');
      expect(hasDeleteFailure).toBe(true);
    }
  });

  it('validates inputs for storeLogin and storeToken', async () => {
    const mem = new InMemorySecrets();
    const store = new CredentialsStore(mem as any);

    await expect(store.storeLogin('', 'tok')).rejects.toThrow('password is required');
    await expect(store.storeLogin('pw', '   ')).rejects.toThrow('token is required');

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
    const p1 = store.storeLogin('pw', 'tok-A');
    const p2 = store.storeToken('tok-B');

    await Promise.all([p1, p2]);

    // storeLogin 不再写入 account；只写 password 与 token。
    const expectedPrefix = [`store:${KEY_PASSWORD}:pw`, `store:${KEY_TOKEN}:tok-A`, `store:${KEY_TOKEN}:tok-B`];
    expect(mem.ops).toEqual(expectedPrefix);
    // Final stored token should be the one from the second operation (tok-B)
    const creds = await store.getCredentials();
    expect(creds.token).toBe('tok-B');
  });

  it('stores and retrieves the admin token using a dedicated key', async () => {
    const mem = new InMemorySecrets();
    const store = new CredentialsStore(mem as any);

    await store.storeAdminToken('admin-tok-1', 'https://zentao.example.com/');
    expect(await store.getAdminToken('https://zentao.example.com/')).toBe('admin-tok-1');
    // 管理员 token 不应覆盖个人 token。
    await store.storeToken('personal-tok-1', 'https://zentao.example.com/');
    expect((await store.getCredentials('https://zentao.example.com/')).token).toBe('personal-tok-1');
    expect(await store.getAdminToken('https://zentao.example.com/')).toBe('admin-tok-1');
  });
});

describe('account configuration', () => {
  it('reads zentao.account from user configuration only', () => {
    expect(readAccount({
      get<T>(key: string): T | undefined {
        return key === 'account' ? ('alice' as T) : undefined;
      }
    })).toBe('alice');

    expect(readAccount({
      get<T>(): T | undefined { return undefined; }
    })).toBeUndefined();
  });

  it('ignores blank account values', () => {
    expect(readAccount({
      get<T>(): T | undefined { return '   ' as T; }
    })).toBeUndefined();
  });

  it('writes the account to the global target via storeAccount', async () => {
    const updates: Array<{ key: string; value: unknown; target: unknown }> = [];
    const configuration = {
      get: () => undefined,
      update: async (key: string, value: unknown, target: unknown) => {
        updates.push({ key, value, target });
      }
    };

    await storeAccount(configuration as any, 'bob', 'global-target');

    expect(updates).toEqual([{ key: 'account', value: 'bob', target: 'global-target' }]);
  });

  it('rejects empty account values in storeAccount', async () => {
    const configuration = { get: () => undefined, update: vi.fn(async () => undefined) };
    await expect(storeAccount(configuration as any, '  ', 'global')).rejects.toThrow('account is required');
    expect(configuration.update).not.toHaveBeenCalled();
  });
});
