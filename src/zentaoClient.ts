import RequestLogger, { redactSensitiveText } from './requestLogger';

export interface ZenTaoClientOptions {
  baseUrl: string;
  timeoutMs: number;
  getToken(): Promise<string | undefined>;
  setToken(token: string): Promise<void>;
  refreshToken?(): Promise<string | undefined>;
  logger: RequestLogger;
  fetch?: typeof fetch;
  // 401 时使用 refreshToken 自动重登并重试原请求的最大次数（默认 3）。
  // 仅对 401 生用；非 401 错误不会触发重试。
  maxUnauthorizedRetries?: number;
}

export class ZenTaoApiError extends Error {
  constructor(message: string, public readonly status: number | undefined, public readonly path: string) {
    super(message);
    Object.setPrototypeOf(this, ZenTaoApiError.prototype);
  }
}

export class ZenTaoClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ZenTaoClientOptions) {
    if (options.fetch) {
      this.fetchImpl = options.fetch;
      return;
    }

    if (typeof globalThis.fetch !== 'function') {
      throw new Error('No fetch implementation available. Pass fetch in ZenTaoClientOptions.');
    }

    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  async login(account: string, password: string): Promise<string> {
    const resp = await this.request<{ token: string }>('tokens', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
      withoutToken: true
    });

    const token = (resp as any).token as string;
    if (!token) throw new ZenTaoApiError('Login did not return a token', undefined, 'tokens');
    await this.options.setToken(token);
    return token;
  }

  async getProjects(): Promise<unknown> {
    return this.getAll('projects');
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.get(`projects/${projectId}`);
  }

  async getProjectStories(projectId: number): Promise<unknown> {
    return this.getAll(`projects/${projectId}/stories`);
  }

  async getProductStories(productId: number): Promise<unknown> {
    try {
      return await this.getAll(`products/${productId}/stories`);
    } catch {
      return this.getAll(`stories?product=${productId}`);
    }
  }

  async getProjectExecutions(projectId: number): Promise<unknown> {
    return this.getAll(`projects/${projectId}/executions`);
  }

  async getExecutionTasks(executionId: number): Promise<unknown> {
    return this.getAll(`executions/${executionId}/tasks`);
  }

  async getExecutionStories(executionId: number): Promise<unknown> {
    return this.getAll(`executions/${executionId}/stories`);
  }

  async getStory(storyId: number): Promise<unknown> {
    return this.get(`stories/${storyId}`);
  }

  async getTask(taskId: number): Promise<unknown> {
    return this.get(`tasks/${taskId}`);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async getAll<T extends { page?: number; total?: number; limit?: number }>(path: string): Promise<T> {
    const first = await this.get<T>(path);
    if (!first || typeof first !== 'object') return first;

    const page = (first as any).page;
    const total = (first as any).total;
    const limit = (first as any).limit;

    if (page == null || total == null || limit == null || limit >= total) return first;

    const separator = path.includes('?') ? '&' : '?';
    return this.get<T>(`${path}${separator}limit=${total}`);
  }

  async downloadByPath(path: string): Promise<Uint8Array> {
    const response = await this.rawRequest(path, { method: 'GET' });
    const buf = await response.arrayBuffer();
    return new Uint8Array(buf);
  }

  async downloadFile(fileId: number): Promise<Uint8Array> {
    const base = this.options.baseUrl.replace(/\/api\.php\/v1\/?$/i, '/');
    const baseUrl = base.endsWith('/') ? base : `${base}/`;
    const token = await this.options.getToken();
    const url = `${baseUrl}file-read-${fileId}.json?zentaosid=${encodeURIComponent(token || '')}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { method: 'GET', signal: controller.signal });
      if (!response.ok) {
        throw new ZenTaoApiError(`ZenTao file download failed with status ${response.status}`, response.status, `file-read-${fileId}`);
      }
      const buf = await response.arrayBuffer();
      return new Uint8Array(buf);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string): string {
    let normalizedPath = path.replace(/^\/+/, '');
    normalizedPath = normalizedPath.replace(/^api\.php\/v1\/?/i, '');

    // Avoid duplicating /api.php/v1/ if baseUrl already contains it
    const base = this.options.baseUrl.endsWith('/') ? this.options.baseUrl : `${this.options.baseUrl}/`;
    const apiSuffix = '/api.php/v1/';
    const apiSuffixNoSlash = '/api.php/v1';

    if (base.endsWith(apiSuffix)) {
      return new URL(normalizedPath, base).toString();
    }
    if (base.endsWith(apiSuffixNoSlash + '/')) {
      return new URL(normalizedPath, base).toString();
    }
    if (base.endsWith(apiSuffixNoSlash)) {
      return new URL(normalizedPath, base + '/').toString();
    }

    return new URL(`api.php/v1/${normalizedPath}`, base).toString();
  }

  private async request<T>(path: string, init: RequestInit & { withoutToken?: boolean }): Promise<T> {
    const resp = await this.rawRequest(path, init);
    return resp.json() as Promise<T>;
  }

  private async rawRequest(path: string, init: RequestInit & { withoutToken?: boolean }, retryUnauthorized = true, tokenOverride?: string, unauthorizedRetries?: number): Promise<Response> {
    const { withoutToken, ...fetchInit } = init;
    const method = init.method ?? 'GET';
    const url = this.buildUrl(path);
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const maxRetries = this.options.maxUnauthorizedRetries ?? 3;
    const remainingRetries = unauthorizedRetries ?? maxRetries;

    try {
      const headers = new Headers(init.headers);
      // Default Content-Type only when body present and not explicitly provided
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      if (!withoutToken) {
        try {
          const token = tokenOverride ?? await this.options.getToken();
          if (token) headers.set('Token', token);
        } catch {
          // ignore getToken errors; proceed without token
        }
      }

      const response = await this.fetchImpl(url, {
        ...fetchInit,
        signal: controller.signal,
        headers
      });

      this.options.logger.log({ method, path: `/api.php/v1/${path}`, status: (response as any).status, durationMs: Date.now() - started });

      if (!(response as any).ok) {
        if ((response as any).status === 401 && retryUnauthorized && !withoutToken && this.options.refreshToken && remainingRetries > 0) {
          const refreshedToken = await this.options.refreshToken();
          if (refreshedToken) {
            return this.rawRequest(path, init, true, refreshedToken, remainingRetries - 1);
          }
        }
        throw new ZenTaoApiError(`ZenTao request failed with status ${(response as any).status}`, (response as any).status, redactSensitiveText(path));
      }

      return response as Response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.log({ method, path: `/api.php/v1/${path}`, durationMs: Date.now() - started, error: redactSensitiveText(message) });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default ZenTaoClient;
