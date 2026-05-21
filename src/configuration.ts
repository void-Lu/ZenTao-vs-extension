import { ExtensionConfig, ZenTaoCredentials } from './types';

// Public keys used for secret storage. Keep these stable as part of the public behavior.
export const KEY_ACCOUNT = 'zentao.account';
export const KEY_PASSWORD = 'zentao.password';
export const KEY_TOKEN = 'zentao.token';

export interface WorkspaceConfigurationLike {
  get<T>(key: string): T | undefined;
}

export interface SecretStorageLike {
  // Uses Thenable to match VS Code SecretStorage API surface (which returns Thenable)
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('ZenTao URL is required.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ZenTao URL must be a valid URL.');
  }

  // Disallow embedded credentials in the URL for security reasons
  if (url.username || url.password) {
    throw new Error('ZenTao URL must not include credentials.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ZenTao URL must use http or https.');
  }

  return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
}

export function readExtensionConfig(configuration: WorkspaceConfigurationLike): ExtensionConfig {
  const baseUrl = normalizeBaseUrl(configuration.get<string>('baseUrl') ?? '');
  const projectId = configuration.get<number>('projectId') ?? 0;
  const requestTimeout = configuration.get<number>('requestTimeout') ?? 15000;

  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error('ZenTao project ID must be a positive integer.');
  }

  return { baseUrl, projectId, requestTimeout };
}

export class CredentialsStore {
  constructor(private readonly secrets: SecretStorageLike) {}

  // Simple in-process serialization queue for write operations to avoid
  // interleaving when multiple callers in the same extension host perform
  // writes concurrently. This is intentionally not a cross-process lock and
  // matches the in-process serialization behavior of the VS Code extension-host
  // — do not attempt cross-process locking here.
  private writeQueue: Promise<void> = Promise.resolve();

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const op = this.writeQueue.then(() => fn());
    // Ensure the queue advances regardless of success or failure of op
    this.writeQueue = op.then(() => undefined, () => undefined);
    return op;
  }

  async getCredentials(): Promise<ZenTaoCredentials> {
    const [account, password, token] = await Promise.all([
      this.secrets.get(KEY_ACCOUNT),
      this.secrets.get(KEY_PASSWORD),
      this.secrets.get(KEY_TOKEN)
    ]);
    return { account, password, token };
  }

  async storeLogin(account: string, password: string, token: string): Promise<void> {
    // Input validation
    if (!account || account.trim().length === 0) {
      throw new Error('account is required');
    }
    if (!password || password.length === 0) {
      throw new Error('password is required');
    }
    if (!token || token.trim().length === 0) {
      throw new Error('token is required');
    }

    return this.runExclusive(async () => {
      // Store sequentially to avoid partial writes from concurrent failures.
      // If any write fails, rollback by deleting all credential keys.
      try {
        await this.secrets.store(KEY_ACCOUNT, account);
        await this.secrets.store(KEY_PASSWORD, password);
        await this.secrets.store(KEY_TOKEN, token);
      } catch (err) {
        // Attempt cleanup by deleting any keys that may have been written.
        // If cleanup succeeds, rethrow the original error. If cleanup
        // encounters failures, surface them together with the original
        // error as an AggregateError so callers can observe both the write
        // failure and the rollback failures.
        const rollbackErrors: any[] = [];
        try {
          await this.secrets.delete(KEY_ACCOUNT);
        } catch (e) {
          rollbackErrors.push(e);
        }
        try {
          await this.secrets.delete(KEY_PASSWORD);
        } catch (e) {
          rollbackErrors.push(e);
        }
        try {
          await this.secrets.delete(KEY_TOKEN);
        } catch (e) {
          rollbackErrors.push(e);
        }

        if (rollbackErrors.length === 0) {
          // Rollback succeeded — preserve original error
          throw err;
        }

        // Rollback had failures: include original error plus rollback errors
        const allErrors = [err, ...rollbackErrors];
        throw new AggregateError(allErrors, 'Failed to store credentials and rollback cleanup failed.');
      }
    });
  }

  async storeToken(token: string): Promise<void> {
    if (!token || token.trim().length === 0) {
      throw new Error('token is required');
    }
    return this.runExclusive(async () => {
      await this.secrets.store(KEY_TOKEN, token);
    });
  }

  async clearToken(): Promise<void> {
    return this.runExclusive(async () => {
      await this.secrets.delete(KEY_TOKEN);
    });
  }
}
