import { ConnectionConfig, ExtensionConfig, ZenTaoCredentials } from './types';

// Public keys used for secret storage. Keep these stable as part of the public behavior.
export const KEY_ACCOUNT = 'zentao.account';
export const KEY_PASSWORD = 'zentao.password';
export const KEY_TOKEN = 'zentao.token';

function tokenKey(baseUrl?: string): string {
  return baseUrl ? `${KEY_TOKEN}.${Buffer.from(baseUrl).toString('base64url')}` : KEY_TOKEN;
}

export interface InspectResultLike<T> {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

export interface WorkspaceConfigurationLike {
  get<T>(key: string): T | undefined;
  inspect?<T>(key: string): InspectResultLike<T> | undefined;
  update?(key: string, value: unknown, target: unknown): Thenable<void>;
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

function readGlobalBaseUrl(configuration: WorkspaceConfigurationLike): string | undefined {
  const inspected = configuration.inspect?.<string>('baseUrl');
  if (inspected) {
    return inspected.globalValue;
  }
  return configuration.get<string>('baseUrl');
}

function readLegacyWorkspaceBaseUrl(configuration: WorkspaceConfigurationLike): string | undefined {
  const inspected = configuration.inspect?.<string>('baseUrl');
  return inspected?.workspaceFolderValue ?? inspected?.workspaceValue;
}

export function readConnectionConfig(configuration: WorkspaceConfigurationLike): ConnectionConfig {
  const baseUrl = normalizeBaseUrl(readGlobalBaseUrl(configuration) ?? '');
  const requestTimeout = configuration.get<number>('requestTimeout') ?? 15000;
  return { baseUrl, requestTimeout };
}

export async function migrateLegacyBaseUrlToGlobal(
  configuration: WorkspaceConfigurationLike,
  globalTarget: unknown,
  confirmMigration: (baseUrl: string) => Promise<boolean>
): Promise<string | undefined> {
  const globalBaseUrl = readGlobalBaseUrl(configuration);
  if (globalBaseUrl !== undefined && globalBaseUrl.trim() !== '') {
    normalizeBaseUrl(globalBaseUrl);
    return undefined;
  }

  const legacyBaseUrl = readLegacyWorkspaceBaseUrl(configuration);
  if (legacyBaseUrl === undefined || legacyBaseUrl.trim() === '') {
    return undefined;
  }

  let normalizedLegacy: string;
  try {
    normalizedLegacy = normalizeBaseUrl(legacyBaseUrl);
  } catch {
    return undefined;
  }

  if (!(await confirmMigration(normalizedLegacy))) {
    return undefined;
  }

  await configuration.update?.('baseUrl', normalizedLegacy, globalTarget);
  return normalizedLegacy;
}

export function readOptionalProjectId(configuration: WorkspaceConfigurationLike): number | undefined {
  const projectId = configuration.get<number>('projectId') ?? 0;
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined;
}

export function readExtensionConfig(configuration: WorkspaceConfigurationLike): ExtensionConfig {
  const connection = readConnectionConfig(configuration);
  const projectId = readOptionalProjectId(configuration);

  if (projectId === undefined) {
    throw new Error('ZenTao project ID must be a positive integer.');
  }

  return { ...connection, projectId };
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

  async getCredentials(baseUrl?: string): Promise<ZenTaoCredentials> {
    const [account, password, token] = await Promise.all([
      this.secrets.get(KEY_ACCOUNT),
      this.secrets.get(KEY_PASSWORD),
      this.secrets.get(tokenKey(baseUrl))
    ]);
    return { account, password, token };
  }

  async storeLogin(account: string, password: string, token: string, baseUrl?: string): Promise<void> {
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
        await this.secrets.store(tokenKey(baseUrl), token);
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
          await this.secrets.delete(tokenKey(baseUrl));
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

  async storeToken(token: string, baseUrl?: string): Promise<void> {
    if (!token || token.trim().length === 0) {
      throw new Error('token is required');
    }
    return this.runExclusive(async () => {
      await this.secrets.store(tokenKey(baseUrl), token);
    });
  }

  async clearToken(baseUrl?: string): Promise<void> {
    return this.runExclusive(async () => {
      await this.secrets.delete(tokenKey(baseUrl));
    });
  }
}
