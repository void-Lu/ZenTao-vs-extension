import { ExtensionConfig, ZenTaoCredentials } from './types';

export interface WorkspaceConfigurationLike {
  get<T>(key: string): T | undefined;
}

export interface SecretStorageLike {
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

  async getCredentials(): Promise<ZenTaoCredentials> {
    const [account, password, token] = await Promise.all([
      this.secrets.get('zentao.account'),
      this.secrets.get('zentao.password'),
      this.secrets.get('zentao.token')
    ]);
    return { account, password, token };
  }

  async storeLogin(account: string, password: string, token: string): Promise<void> {
    await Promise.all([
      this.secrets.store('zentao.account', account),
      this.secrets.store('zentao.password', password),
      this.secrets.store('zentao.token', token)
    ]);
  }

  async storeToken(token: string): Promise<void> {
    await this.secrets.store('zentao.token', token);
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete('zentao.token');
  }
}
