# ZenTao VS Code 查询扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 VS Code 扩展，一期基于禅道 v18.x API v1 查询工作区固定项目号下的需求、任务列表和详情，并在 VS Code 内结构化展示。

**Architecture:** 扩展采用 TypeScript，核心分为配置/凭据、禅道 API 客户端、请求日志、数据映射、TreeView、Detail Webview、附件下载七个单元。API 客户端和数据映射尽量保持纯逻辑，便于 Vitest 单元测试；VS Code API 只在激活、树视图、Webview、下载命令边界使用。

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, `sanitize-html`, Node `fetch`, VS Code `SecretStorage`, `TreeDataProvider`, `WebviewPanel`.

---

## Scope Check

该 spec 是单一扩展的一期只读查询能力，不需要拆成多个子项目计划。后续写操作只保留方法和命令边界，不在本计划中实现。

## File Structure

- Create: `package.json` — VS Code 扩展清单、命令、视图、配置和脚本。
- Create: `tsconfig.json` — TypeScript 编译配置。
- Create: `vitest.config.ts` — 单元测试配置。
- Create: `.vscodeignore` — 打包忽略规则。
- Create: `src/types.ts` — 扩展内部共享类型。
- Create: `src/configuration.ts` — URL 归一化、工作区配置读取、SecretStorage 适配。
- Create: `src/requestLogger.ts` — 请求日志格式化和敏感字段脱敏。
- Create: `src/zentaoClient.ts` — 禅道 API v1 请求、认证、分页、详情、附件下载请求。
- Create: `src/detailMapper.ts` — 需求/任务详情字段、附件、评论/操作历史抽取。
- Create: `src/html.ts` — HTML 转义、富文本白名单清洗、详情页 HTML 生成。
- Create: `src/treeProvider.ts` — TreeView 数据节点和刷新逻辑。
- Create: `src/detailPanel.ts` — WebviewPanel 复用、消息处理、附件下载消息分发。
- Create: `src/attachmentService.ts` — 附件保存路径选择和下载写盘。
- Create: `src/extension.ts` — 扩展激活、命令注册、服务装配。
- Create: `src/*.test.ts` — 纯逻辑单元测试。

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.vscodeignore`
- Create: `src/extension.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "zentao-vs-extension",
  "displayName": "ZenTao VS Extension",
  "description": "Browse ZenTao project stories and tasks in VS Code.",
  "version": "0.1.0",
  "publisher": "void-lu",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onView:zentaoProjectView",
    "onCommand:zentao.reconnect",
    "onCommand:zentao.refresh",
    "onCommand:zentao.openDetail",
    "onCommand:zentao.openRequestLog"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "configuration": {
      "title": "ZenTao",
      "properties": {
        "zentao.baseUrl": {
          "type": "string",
          "default": "",
          "description": "ZenTao base URL, for example https://zentao.example.com/."
        },
        "zentao.projectId": {
          "type": "number",
          "default": 0,
          "description": "ZenTao project ID used by this workspace."
        },
        "zentao.requestTimeout": {
          "type": "number",
          "default": 15000,
          "minimum": 1000,
          "description": "ZenTao request timeout in milliseconds."
        }
      }
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "zentao",
          "title": "ZenTao",
          "icon": "$(list-tree)"
        }
      ]
    },
    "views": {
      "zentao": [
        {
          "id": "zentaoProjectView",
          "name": "禅道项目"
        }
      ]
    },
    "commands": [
      {
        "command": "zentao.reconnect",
        "title": "重新连接",
        "icon": "$(debug-disconnect)"
      },
      {
        "command": "zentao.refresh",
        "title": "刷新禅道数据",
        "icon": "$(refresh)"
      },
      {
        "command": "zentao.openRequestLog",
        "title": "请求日志",
        "icon": "$(output)"
      },
      {
        "command": "zentao.openDetail",
        "title": "打开禅道详情"
      },
      {
        "command": "zentao.copyId",
        "title": "复制编号"
      },
      {
        "command": "zentao.openExternal",
        "title": "在浏览器打开"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "zentao.reconnect",
          "when": "view == zentaoProjectView",
          "group": "navigation@1"
        },
        {
          "command": "zentao.openRequestLog",
          "when": "view == zentaoProjectView",
          "group": "navigation@2"
        },
        {
          "command": "zentao.refresh",
          "when": "view == zentaoProjectView",
          "group": "navigation@3"
        }
      ],
      "view/item/context": [
        {
          "command": "zentao.openDetail",
          "when": "view == zentaoProjectView && viewItem =~ /^(story|task)$/",
          "group": "inline@1"
        },
        {
          "command": "zentao.copyId",
          "when": "view == zentaoProjectView && viewItem =~ /^(story|task)$/",
          "group": "navigation@1"
        },
        {
          "command": "zentao.openExternal",
          "when": "view == zentaoProjectView && viewItem =~ /^(story|task)$/",
          "group": "navigation@2"
        }
      ]
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "vitest run",
    "verify": "npm run compile && npm test"
  },
  "dependencies": {
    "sanitize-html": "^2.17.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "@types/sanitize-html": "^2.16.0",
    "@types/vscode": "^1.90.0",
    "typescript": "^5.6.3",
    "vitest": "^1.6.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
```

- [ ] **Step 4: Create `.vscodeignore`**

```text
.superpowers/**
docs/superpowers/**
src/**/*.test.ts
node_modules/**/.cache/**
out/**/*.map
```

- [ ] **Step 5: Create minimal `src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('zentao.openRequestLog', () => {
    vscode.window.showInformationMessage('ZenTao request log is not initialized yet.');
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and install exits with code 0.

- [ ] **Step 7: Verify scaffold compiles**

Run: `npm run compile`

Expected: TypeScript exits with code 0 and `out/extension.js` is generated.

- [ ] **Step 8: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .vscodeignore src/extension.ts
git commit -m "chore: scaffold vscode extension"
```

---

### Task 2: Shared Types, Configuration, and Credentials

**Files:**
- Create: `src/types.ts`
- Create: `src/configuration.ts`
- Create: `src/configuration.test.ts`

- [ ] **Step 1: Write failing configuration tests**

Create `src/configuration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, readExtensionConfig } from './configuration';

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
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/configuration.test.ts`

Expected: FAIL because `src/configuration.ts` does not exist.

- [ ] **Step 3: Create `src/types.ts`**

```ts
export type ZenTaoItemType = 'story' | 'task';

export interface ExtensionConfig {
  baseUrl: string;
  projectId: number;
  requestTimeout: number;
}

export interface ZenTaoCredentials {
  account?: string;
  password?: string;
  token?: string;
}

export interface ProjectInfo {
  id: number;
  name: string;
  raw: unknown;
}

export interface ExecutionInfo {
  id: number;
  name: string;
  raw: unknown;
}

export interface StoryListItem {
  id: number;
  title: string;
  priority: string;
  status: string;
  raw: unknown;
}

export interface TaskListItem {
  id: number;
  name: string;
  priority: string;
  status: string;
  executionId?: number;
  raw: unknown;
}

export interface TreeDataState {
  project?: ProjectInfo;
  stories: StoryListItem[];
  tasks: TaskListItem[];
  partialTaskFailure: boolean;
  message?: string;
}

export interface AttachmentViewModel {
  id?: number;
  name: string;
  size?: string;
  addedDate: string;
  url?: string;
  raw: unknown;
}

export interface ActivityViewModel {
  date: string;
  actor: string;
  action: string;
  commentHtml: string;
  descriptionHtml: string;
}

export interface BasicField {
  label: '项目' | '产品' | '状态' | '优先级' | '指派' | '版本';
  value: string;
}

export interface DetailViewModel {
  id: number;
  type: ZenTaoItemType;
  title: string;
  basicFields: BasicField[];
  descriptionHtml: string;
  acceptanceHtml: string;
  attachments: AttachmentViewModel[];
  activities: ActivityViewModel[];
  raw: unknown;
}
```

- [ ] **Step 4: Implement `src/configuration.ts`**

```ts
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
```

- [ ] **Step 5: Run configuration tests**

Run: `npm test -- src/configuration.test.ts`

Expected: PASS.

- [ ] **Step 6: Compile**

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 7: Commit configuration work**

```bash
git add src/types.ts src/configuration.ts src/configuration.test.ts
git commit -m "feat: add zentao configuration and credentials store"
```

---

### Task 3: Request Logger and Redaction

**Files:**
- Create: `src/requestLogger.ts`
- Create: `src/requestLogger.test.ts`

- [ ] **Step 1: Write failing redaction tests**

Create `src/requestLogger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { redactSensitiveText, toLogLine } from './requestLogger';

describe('redactSensitiveText', () => {
  it('redacts token, password, and cookie values', () => {
    const text = 'Token abc123 password=secret Cookie sid=xyz';
    expect(redactSensitiveText(text)).toBe('Token [REDACTED] password=[REDACTED] Cookie [REDACTED]');
  });
});

describe('toLogLine', () => {
  it('formats request metadata without secrets', () => {
    const line = toLogLine({
      method: 'GET',
      path: '/api.php/v1/projects/123',
      status: 200,
      durationMs: 31
    });

    expect(line).toContain('GET /api.php/v1/projects/123 200 31ms');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/requestLogger.test.ts`

Expected: FAIL because `src/requestLogger.ts` does not exist.

- [ ] **Step 3: Implement `src/requestLogger.ts`**

```ts
export interface RequestLogEntry {
  method: string;
  path: string;
  status?: number;
  durationMs: number;
  error?: string;
}

export interface OutputChannelLike {
  appendLine(value: string): void;
  show(): void;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/Token\s+[^\s,;]+/gi, 'Token [REDACTED]')
    .replace(/password=([^\s,;]+)/gi, 'password=[REDACTED]')
    .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"')
    .replace(/Cookie\s+[^\n]+/gi, 'Cookie [REDACTED]');
}

export function toLogLine(entry: RequestLogEntry): string {
  const status = entry.status === undefined ? '-' : String(entry.status);
  const error = entry.error ? ` ${redactSensitiveText(entry.error)}` : '';
  return `${new Date().toISOString()} ${entry.method} ${entry.path} ${status} ${entry.durationMs}ms${error}`;
}

export class RequestLogger {
  constructor(private readonly channel: OutputChannelLike) {}

  log(entry: RequestLogEntry): void {
    this.channel.appendLine(toLogLine(entry));
  }

  show(): void {
    this.channel.show();
  }
}
```

- [ ] **Step 4: Run logger tests**

Run: `npm test -- src/requestLogger.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit logger**

```bash
git add src/requestLogger.ts src/requestLogger.test.ts
git commit -m "feat: add redacted request logging"
```

---

### Task 4: ZenTao API Client

**Files:**
- Create: `src/zentaoClient.ts`
- Create: `src/zentaoClient.test.ts`

- [ ] **Step 1: Write failing API client tests**

Create `src/zentaoClient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ZenTaoClient } from './zentaoClient';
import { RequestLogger } from './requestLogger';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('ZenTaoClient', () => {
  it('authenticates with account and password', async () => {
    const fetches: Array<{ url: string; init?: RequestInit }> = [];
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => undefined,
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} }),
      fetch: async (url, init) => {
        fetches.push({ url: String(url), init });
        return jsonResponse({ token: 'abc' });
      }
    });

    await expect(client.login('admin', 'secret')).resolves.toBe('abc');
    expect(fetches[0].url).toBe('https://zentao.example.com/api.php/v1/tokens');
    expect(fetches[0].init?.method).toBe('POST');
  });

  it('fetches paged data again with total as limit', async () => {
    const urls: string[] = [];
    const client = new ZenTaoClient({
      baseUrl: 'https://zentao.example.com/',
      timeoutMs: 5000,
      getToken: async () => 'abc',
      setToken: async () => undefined,
      logger: new RequestLogger({ appendLine() {}, show() {} }),
      fetch: async (url) => {
        urls.push(String(url));
        if (urls.length === 1) {
          return jsonResponse({ page: 1, total: 2, limit: 1, stories: [{ id: 1 }, { id: 2 }] });
        }
        return jsonResponse({ page: 1, total: 2, limit: 2, stories: [{ id: 1 }, { id: 2 }] });
      }
    });

    const data = await client.getAll<{ stories: Array<{ id: number }> }>('projects/123/stories');
    expect(data.stories.map((item) => item.id)).toEqual([1, 2]);
    expect(urls[1]).toBe('https://zentao.example.com/api.php/v1/projects/123/stories?limit=2');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/zentaoClient.test.ts`

Expected: FAIL because `src/zentaoClient.ts` does not exist.

- [ ] **Step 3: Implement `src/zentaoClient.ts`**

```ts
import { RequestLogger } from './requestLogger';

export interface ZenTaoClientOptions {
  baseUrl: string;
  timeoutMs: number;
  getToken(): Promise<string | undefined>;
  setToken(token: string): Promise<void>;
  logger: RequestLogger;
  fetch?: typeof fetch;
}

export class ZenTaoApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly path: string
  ) {
    super(message);
  }
}

export class ZenTaoClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ZenTaoClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async login(account: string, password: string): Promise<string> {
    const response = await this.request<{ token: string }>('tokens', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
      withoutToken: true
    });
    await this.options.setToken(response.token);
    return response.token;
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.get(`projects/${projectId}`);
  }

  async getProjectStories(projectId: number): Promise<unknown> {
    return this.getAll(`projects/${projectId}/stories`);
  }

  async getProjectExecutions(projectId: number): Promise<unknown> {
    return this.getAll(`projects/${projectId}/executions`);
  }

  async getExecutionTasks(executionId: number): Promise<unknown> {
    return this.getAll(`executions/${executionId}/tasks`);
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
    if (!first.page || !first.total || !first.limit || first.limit >= first.total) {
      return first;
    }
    const separator = path.includes('?') ? '&' : '?';
    return this.get<T>(`${path}${separator}limit=${first.total}`);
  }

  async downloadByPath(path: string): Promise<Uint8Array> {
    const response = await this.rawRequest(path, { method: 'GET' });
    return new Uint8Array(await response.arrayBuffer());
  }

  private async request<T>(path: string, init: RequestInit & { withoutToken?: boolean }): Promise<T> {
    const response = await this.rawRequest(path, init);
    return response.json() as Promise<T>;
  }

  private async rawRequest(path: string, init: RequestInit & { withoutToken?: boolean }): Promise<Response> {
    const method = init.method ?? 'GET';
    const url = new URL(`api.php/v1/${path}`, this.options.baseUrl).toString();
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!init.withoutToken) {
        const token = await this.options.getToken();
        if (token) {
          headers.Token = token;
        }
      }

      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: { ...headers, ...(init.headers ?? {}) }
      });

      this.options.logger.log({ method, path: `/api.php/v1/${path}`, status: response.status, durationMs: Date.now() - started });

      if (!response.ok) {
        throw new ZenTaoApiError(`ZenTao request failed with status ${response.status}`, response.status, path);
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.log({ method, path: `/api.php/v1/${path}`, durationMs: Date.now() - started, error: message });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

- [ ] **Step 4: Run API client tests**

Run: `npm test -- src/zentaoClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Compile**

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 6: Commit API client**

```bash
git add src/zentaoClient.ts src/zentaoClient.test.ts
git commit -m "feat: add zentao api client"
```

---

### Task 5: Detail Mapping and HTML Sanitization

**Files:**
- Create: `src/html.ts`
- Create: `src/detailMapper.ts`
- Create: `src/detailMapper.test.ts`

- [ ] **Step 1: Write failing detail mapper tests**

Create `src/detailMapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toDetailViewModel } from './detailMapper';
import { sanitizeRichHtml } from './html';

describe('sanitizeRichHtml', () => {
  it('removes scripts and event handlers while keeping basic formatting', () => {
    const clean = sanitizeRichHtml('<p onclick="x()">ok</p><script>alert(1)</script><table><tr><td>A</td></tr></table>');
    expect(clean).toContain('<p>ok</p>');
    expect(clean).toContain('<table>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });
});

describe('toDetailViewModel', () => {
  it('extracts story detail fields in the required order', () => {
    const model = toDetailViewModel('story', {
      id: 101,
      title: '登录优化',
      project: 123,
      projectName: '企业管理系统',
      product: 4,
      productName: '客户门户',
      status: 'active',
      pri: 1,
      assignedTo: { account: 'admin', realname: '管理员' },
      version: 2,
      spec: '<p>描述</p>',
      verify: '<p>验收</p>',
      files: [{ id: 8, title: 'spec.docx', addedDate: '2026-05-21 10:18' }],
      actions: [{ date: '2026-05-21 11:02', actor: '张三', action: 'commented', comment: '请补充验收标准。', desc: '' }]
    });

    expect(model.basicFields.map((field) => field.label)).toEqual(['项目', '产品', '状态', '优先级', '指派', '版本']);
    expect(model.attachments[0].addedDate).toBe('2026-05-21 10:18');
    expect(model.activities[0].actor).toBe('张三');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/detailMapper.test.ts`

Expected: FAIL because `src/html.ts` and `src/detailMapper.ts` do not exist.

- [ ] **Step 3: Implement `src/html.ts`**

```ts
import sanitizeHtml from 'sanitize-html';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeRichHtml(value: unknown): string {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img', 'hr', 'h1', 'h2', 'h3', 'h4'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard'
  });
}
```

- [ ] **Step 4: Implement `src/detailMapper.ts`**

```ts
import { AttachmentViewModel, DetailViewModel, ZenTaoItemType, ActivityViewModel } from './types';
import { escapeHtml, sanitizeRichHtml } from './html';

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? value as AnyRecord : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>);
  }
  return [];
}

function stringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    const record = asRecord(value);
    return stringValue(record.realname ?? record.name ?? record.account ?? record.id, fallback);
  }
  return String(value);
}

function priority(value: unknown): string {
  const raw = stringValue(value, '-');
  return raw.startsWith('P') ? raw : `P${raw}`;
}

function extractAttachments(raw: AnyRecord): AttachmentViewModel[] {
  return [...asArray(raw.files), ...asArray(raw.storyFiles)].map((item) => {
    const file = asRecord(item);
    const idValue = Number(file.id ?? file.fileID);
    return {
      id: Number.isFinite(idValue) ? idValue : undefined,
      name: stringValue(file.title ?? file.name ?? file.filename ?? file.pathname, '未命名附件'),
      size: stringValue(file.size, ''),
      addedDate: stringValue(file.addedDate ?? file.addedTime ?? file.date ?? file.openedDate, '未知'),
      url: stringValue(file.url ?? file.webUrl ?? file.downloadUrl, ''),
      raw: file
    };
  });
}

function extractActivities(raw: AnyRecord): ActivityViewModel[] {
  return asArray(raw.actions).map((item) => {
    const action = asRecord(item);
    return {
      date: stringValue(action.date, '未知时间'),
      actor: stringValue(action.actor, '未知用户'),
      action: stringValue(action.action, '记录'),
      commentHtml: sanitizeRichHtml(action.comment),
      descriptionHtml: sanitizeRichHtml(action.desc ?? action.history)
    };
  });
}

export function toDetailViewModel(type: ZenTaoItemType, value: unknown): DetailViewModel {
  const raw = asRecord(value);
  const id = Number(raw.id);
  const title = stringValue(type === 'story' ? raw.title : raw.name, `#${id}`);
  const projectName = stringValue(raw.projectName, stringValue(raw.project, '-'));
  const productName = stringValue(raw.productName, stringValue(raw.product, '-'));
  const assigned = stringValue(raw.assignedToRealName, stringValue(raw.assignedTo, '-'));

  return {
    id,
    type,
    title,
    basicFields: [
      { label: '项目', value: projectName },
      { label: '产品', value: productName },
      { label: '状态', value: stringValue(raw.status, '-') },
      { label: '优先级', value: priority(raw.pri) },
      { label: '指派', value: assigned },
      { label: '版本', value: stringValue(raw.version, '-') }
    ],
    descriptionHtml: sanitizeRichHtml(raw.spec ?? raw.desc),
    acceptanceHtml: sanitizeRichHtml(raw.verify ?? raw.storyVerify),
    attachments: extractAttachments(raw),
    activities: extractActivities(raw),
    raw
  };
}

export function escapedJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}
```

- [ ] **Step 5: Run detail mapper tests**

Run: `npm test -- src/detailMapper.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit mapper and sanitizer**

```bash
git add src/html.ts src/detailMapper.ts src/detailMapper.test.ts
git commit -m "feat: map zentao details for safe rendering"
```

---

### Task 6: Detail Webview Renderer

**Files:**
- Modify: `src/html.ts`
- Create: `src/html.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `src/html.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderDetailHtml } from './html';

describe('renderDetailHtml', () => {
  it('renders attachments before activities and includes CSP', () => {
    const html = renderDetailHtml({
      cspSource: 'vscode-webview:',
      nonce: 'abc',
      detail: {
        id: 101,
        type: 'story',
        title: '登录优化',
        basicFields: [
          { label: '项目', value: '企业管理系统' },
          { label: '产品', value: '客户门户' },
          { label: '状态', value: 'active' },
          { label: '优先级', value: 'P1' },
          { label: '指派', value: 'admin' },
          { label: '版本', value: '2' }
        ],
        descriptionHtml: '<p>描述</p>',
        acceptanceHtml: '<p>验收</p>',
        attachments: [{ id: 1, name: 'spec.docx', addedDate: '2026-05-21', raw: {} }],
        activities: [{ date: '2026-05-21', actor: '张三', action: 'commented', commentHtml: '评论', descriptionHtml: '' }],
        raw: { id: 101 }
      }
    });

    expect(html).toContain("script-src 'nonce-abc'");
    expect(html.indexOf('附件')).toBeLessThan(html.indexOf('评论 / 操作历史'));
    expect(html).toContain('描述 / 验收标准');
  });
});
```

- [ ] **Step 2: Run renderer test to verify failure**

Run: `npm test -- src/html.test.ts`

Expected: FAIL because `renderDetailHtml` is not exported.

- [ ] **Step 3: Add renderer to `src/html.ts`**

Append this code to `src/html.ts`:

```ts
import { DetailViewModel } from './types';
import { escapedJson } from './detailMapper';

export interface RenderDetailHtmlOptions {
  detail: DetailViewModel;
  cspSource: string;
  nonce: string;
}

export function renderDetailHtml(options: RenderDetailHtmlOptions): string {
  const { detail, cspSource, nonce } = options;
  const fields = detail.basicFields.map((field) => `
    <div class="field-row"><strong>${escapeHtml(field.label)}</strong><span>${escapeHtml(field.value)}</span></div>`).join('');

  const attachments = detail.attachments.length
    ? detail.attachments.map((attachment, index) => `
      <li>${escapeHtml(attachment.name)} · 添加日期：${escapeHtml(attachment.addedDate)}
        <button data-attachment-index="${index}">下载</button>
      </li>`).join('')
    : '<li>暂无附件</li>';

  const activities = detail.activities.length
    ? detail.activities.map((activity) => `
      <li>
        <div class="activity-meta">${escapeHtml(activity.date)} · ${escapeHtml(activity.actor)} · ${escapeHtml(activity.action)}</div>
        <div>${activity.commentHtml || activity.descriptionHtml || '无评论内容'}</div>
      </li>`).join('')
    : '<li>暂无评论 / 操作历史</li>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: http:; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(detail.title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .fields { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
    .field-row { display: grid; grid-template-columns: 72px 1fr; gap: 8px; line-height: 1.45; font-size: 13px; }
    .focus-block { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; margin: 10px 0; }
    ul { padding-left: 18px; }
    li { margin: 6px 0; }
    button { cursor: pointer; }
    pre { overflow: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); }
    .activity-meta { opacity: 0.75; font-size: 12px; margin-bottom: 2px; }
  </style>
</head>
<body>
  <h1>#${escapeHtml(detail.id)} ${escapeHtml(detail.title)}</h1>
  <section class="fields">${fields}</section>
  <section class="focus-block"><h2>描述 / 验收标准</h2>${detail.descriptionHtml}${detail.acceptanceHtml}</section>
  <section><h2>附件</h2><ul>${attachments}</ul></section>
  <section class="focus-block"><h2>评论 / 操作历史</h2><ul>${activities}</ul></section>
  <details><summary>完整原始响应</summary><pre>${escapedJson(detail.raw)}</pre></details>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-attachment-index]').forEach((button) => {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'downloadAttachment', index: Number(button.dataset.attachmentIndex) });
      });
    });
  </script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run renderer tests**

Run: `npm test -- src/html.test.ts src/detailMapper.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit renderer**

```bash
git add src/html.ts src/html.test.ts
git commit -m "feat: render safe zentao detail webview"
```

---

### Task 7: Tree Data Provider

**Files:**
- Create: `src/treeProvider.ts`

- [ ] **Step 1: Implement `src/treeProvider.ts`**

```ts
import * as vscode from 'vscode';
import { ProjectInfo, StoryListItem, TaskListItem, TreeDataState } from './types';

export type ZenTaoTreeNode =
  | { kind: 'message'; label: string }
  | { kind: 'project'; project: ProjectInfo }
  | { kind: 'storyGroup'; stories: StoryListItem[] }
  | { kind: 'taskGroup'; tasks: TaskListItem[]; partialFailure: boolean }
  | { kind: 'story'; story: StoryListItem }
  | { kind: 'task'; task: TaskListItem };

export class ZenTaoTreeProvider implements vscode.TreeDataProvider<ZenTaoTreeNode> {
  private readonly changed = new vscode.EventEmitter<ZenTaoTreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private state: TreeDataState = { stories: [], tasks: [], partialTaskFailure: false, message: '未加载禅道数据' };

  setState(state: TreeDataState): void {
    this.state = state;
    this.changed.fire(undefined);
  }

  getTreeItem(element: ZenTaoTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'message':
        return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      case 'project': {
        const item = new vscode.TreeItem(element.project.name, vscode.TreeItemCollapsibleState.Expanded);
        item.description = `项目号 #${element.project.id}`;
        item.contextValue = 'project';
        return item;
      }
      case 'storyGroup': {
        const item = new vscode.TreeItem('需求', vscode.TreeItemCollapsibleState.Expanded);
        item.description = `共 ${element.stories.length} 条`;
        item.contextValue = 'storyGroup';
        return item;
      }
      case 'taskGroup': {
        const item = new vscode.TreeItem('任务', vscode.TreeItemCollapsibleState.Expanded);
        item.description = element.partialFailure ? `共 ${element.tasks.length} 条，部分失败` : `共 ${element.tasks.length} 条`;
        item.contextValue = 'taskGroup';
        return item;
      }
      case 'story': {
        const item = new vscode.TreeItem(`#${element.story.id} ${element.story.title}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${element.story.priority} ${element.story.status}`;
        item.contextValue = 'story';
        item.command = { command: 'zentao.openDetail', title: '打开禅道详情', arguments: ['story', element.story.id] };
        return item;
      }
      case 'task': {
        const item = new vscode.TreeItem(`#${element.task.id} ${element.task.name}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${element.task.priority} ${element.task.status}`;
        item.contextValue = 'task';
        item.command = { command: 'zentao.openDetail', title: '打开禅道详情', arguments: ['task', element.task.id] };
        return item;
      }
    }
  }

  getChildren(element?: ZenTaoTreeNode): vscode.ProviderResult<ZenTaoTreeNode[]> {
    if (!element) {
      if (!this.state.project) {
        return [{ kind: 'message', label: this.state.message ?? '未配置禅道项目' }];
      }
      return [{ kind: 'project', project: this.state.project }];
    }

    if (element.kind === 'project') {
      return [
        { kind: 'storyGroup', stories: this.state.stories },
        { kind: 'taskGroup', tasks: this.state.tasks, partialFailure: this.state.partialTaskFailure }
      ];
    }

    if (element.kind === 'storyGroup') {
      return element.stories.map((story) => ({ kind: 'story', story }));
    }

    if (element.kind === 'taskGroup') {
      return element.tasks.map((task) => ({ kind: 'task', task }));
    }

    return [];
  }
}
```

- [ ] **Step 2: Compile**

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 3: Commit tree provider**

```bash
git add src/treeProvider.ts
git commit -m "feat: add zentao tree provider"
```

---

### Task 8: Attachment Download Service and Detail Panel

**Files:**
- Create: `src/attachmentService.ts`
- Create: `src/detailPanel.ts`

- [ ] **Step 1: Implement `src/attachmentService.ts`**

```ts
import * as path from 'path';
import * as vscode from 'vscode';
import { AttachmentViewModel } from './types';
import { ZenTaoClient } from './zentaoClient';

export class AttachmentService {
  constructor(private readonly client: ZenTaoClient) {}

  async download(attachment: AttachmentViewModel): Promise<void> {
    const defaultName = attachment.name || `zentao-attachment-${attachment.id ?? Date.now()}`;
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultName) });
    if (!target) {
      return;
    }

    const requestPath = attachment.url
      ? attachment.url.replace(/^.*api\.php\/v1\//, '')
      : attachment.id
        ? `files/${attachment.id}`
        : '';

    if (!requestPath) {
      vscode.window.showWarningMessage('当前附件缺少可下载地址。');
      return;
    }

    const bytes = await this.client.downloadByPath(requestPath);
    await vscode.workspace.fs.writeFile(target, bytes);
    vscode.window.showInformationMessage(`附件已保存：${path.basename(target.fsPath)}`);
  }
}
```

- [ ] **Step 2: Implement `src/detailPanel.ts`**

```ts
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { renderDetailHtml } from './html';
import { DetailViewModel } from './types';

export class DetailPanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentDetail: DetailViewModel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly attachmentService: AttachmentService
  ) {}

  show(detail: DetailViewModel): void {
    this.currentDetail = detail;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'zentaoDetail',
        '禅道详情',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage(async (message: { type?: string; index?: number }) => {
        if (message.type === 'downloadAttachment' && this.currentDetail && typeof message.index === 'number') {
          const attachment = this.currentDetail.attachments[message.index];
          if (attachment) {
            await this.attachmentService.download(attachment);
          }
        }
      });
    }

    this.panel.title = `#${detail.id} ${detail.title}`;
    const nonce = crypto.randomBytes(16).toString('base64');
    this.panel.webview.html = renderDetailHtml({
      detail,
      nonce,
      cspSource: this.panel.webview.cspSource
    });
    this.panel.reveal(vscode.ViewColumn.One);
  }
}
```

- [ ] **Step 3: Compile**

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 4: Commit attachment and panel**

```bash
git add src/attachmentService.ts src/detailPanel.ts
git commit -m "feat: add detail panel attachment downloads"
```

---

### Task 9: Data Loading and Extension Activation

**Files:**
- Modify: `src/extension.ts`
- Create: `src/loadProjectData.ts`

- [ ] **Step 1: Create `src/loadProjectData.ts`**

```ts
import { ExecutionInfo, ProjectInfo, StoryListItem, TaskListItem, TreeDataState } from './types';
import { ZenTaoClient } from './zentaoClient';

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? value as AnyRecord : {};
}

function asArray(value: unknown, key: string): unknown[] {
  const record = asRecord(value);
  const nested = record[key];
  if (Array.isArray(nested)) {
    return nested;
  }
  if (nested && typeof nested === 'object') {
    return Object.values(nested as Record<string, unknown>);
  }
  return [];
}

function stringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function priority(value: unknown): string {
  const raw = stringValue(value, '-');
  return raw.startsWith('P') ? raw : `P${raw}`;
}

export async function loadProjectData(client: ZenTaoClient, projectId: number): Promise<TreeDataState> {
  const projectRaw = asRecord(await client.getProject(projectId));
  const project: ProjectInfo = {
    id: Number(projectRaw.id ?? projectId),
    name: stringValue(projectRaw.name, `项目 #${projectId}`),
    raw: projectRaw
  };

  const storiesRaw = await client.getProjectStories(projectId);
  const stories: StoryListItem[] = asArray(storiesRaw, 'stories').map((item) => {
    const story = asRecord(item);
    return {
      id: Number(story.id),
      title: stringValue(story.title, `需求 #${story.id}`),
      priority: priority(story.pri),
      status: stringValue(story.status, '-'),
      raw: story
    };
  });

  const executionsRaw = await client.getProjectExecutions(projectId);
  const executions: ExecutionInfo[] = asArray(executionsRaw, 'executions').map((item) => {
    const execution = asRecord(item);
    return { id: Number(execution.id), name: stringValue(execution.name, `执行 #${execution.id}`), raw: execution };
  }).filter((execution) => Number.isFinite(execution.id));

  const taskResults = await Promise.allSettled(executions.map(async (execution) => ({
    execution,
    response: await client.getExecutionTasks(execution.id)
  })));

  const tasks: TaskListItem[] = [];
  let partialTaskFailure = false;
  for (const result of taskResults) {
    if (result.status === 'rejected') {
      partialTaskFailure = true;
      continue;
    }
    for (const item of asArray(result.value.response, 'tasks')) {
      const task = asRecord(item);
      tasks.push({
        id: Number(task.id),
        name: stringValue(task.name, `任务 #${task.id}`),
        priority: priority(task.pri),
        status: stringValue(task.status, '-'),
        executionId: result.value.execution.id,
        raw: task
      });
    }
  }

  return { project, stories, tasks, partialTaskFailure };
}
```

- [ ] **Step 2: Replace `src/extension.ts` with activation wiring**

```ts
import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { CredentialsStore } from './configuration';
import { readExtensionConfig } from './configuration';
import { DetailPanel } from './detailPanel';
import { toDetailViewModel } from './detailMapper';
import { loadProjectData } from './loadProjectData';
import { RequestLogger } from './requestLogger';
import { ZenTaoClient } from './zentaoClient';
import { ZenTaoTreeProvider } from './treeProvider';
import { ZenTaoItemType } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('ZenTao Requests');
  const logger = new RequestLogger(output);
  const credentials = new CredentialsStore(context.secrets);
  const treeProvider = new ZenTaoTreeProvider();
  const treeView = vscode.window.createTreeView('zentaoProjectView', { treeDataProvider: treeProvider });

  let client: ZenTaoClient | undefined;
  let detailPanel: DetailPanel | undefined;

  function getClient(): ZenTaoClient {
    if (client) {
      return client;
    }
    const config = readExtensionConfig(vscode.workspace.getConfiguration('zentao'));
    client = new ZenTaoClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeout,
      getToken: async () => (await credentials.getCredentials()).token,
      setToken: async (token) => credentials.storeToken(token),
      logger
    });
    return client;
  }

  async function refresh(): Promise<void> {
    try {
      const config = readExtensionConfig(vscode.workspace.getConfiguration('zentao'));
      const data = await loadProjectData(getClient(), config.projectId);
      treeProvider.setState(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      treeProvider.setState({ stories: [], tasks: [], partialTaskFailure: false, message });
      vscode.window.showWarningMessage(message);
    }
  }

  async function reconnect(): Promise<void> {
    const previous = await credentials.getCredentials();
    const account = await vscode.window.showInputBox({ prompt: '输入禅道用户名', value: previous.account, ignoreFocusOut: true });
    if (!account) {
      return;
    }
    const password = await vscode.window.showInputBox({ prompt: '输入禅道密码', password: true, ignoreFocusOut: true });
    if (!password) {
      return;
    }
    const token = await getClient().login(account, password);
    await credentials.storeLogin(account, password, token);
    vscode.window.showInformationMessage('禅道连接成功。');
    await refresh();
  }

  async function openDetail(type: ZenTaoItemType, id: number): Promise<void> {
    const raw = type === 'story' ? await getClient().getStory(id) : await getClient().getTask(id);
    const detail = toDetailViewModel(type, raw);
    if (!detailPanel) {
      detailPanel = new DetailPanel(context.extensionUri, new AttachmentService(getClient()));
    }
    detailPanel.show(detail);
  }

  context.subscriptions.push(
    output,
    treeView,
    vscode.commands.registerCommand('zentao.reconnect', reconnect),
    vscode.commands.registerCommand('zentao.refresh', refresh),
    vscode.commands.registerCommand('zentao.openRequestLog', () => logger.show()),
    vscode.commands.registerCommand('zentao.openDetail', openDetail),
    vscode.commands.registerCommand('zentao.copyId', async (node: unknown) => {
      const id = typeof node === 'object' && node && 'story' in node ? (node as { story: { id: number } }).story.id :
        typeof node === 'object' && node && 'task' in node ? (node as { task: { id: number } }).task.id : undefined;
      if (id !== undefined) {
        await vscode.env.clipboard.writeText(String(id));
      }
    }),
    vscode.commands.registerCommand('zentao.openExternal', async () => {
      vscode.window.showInformationMessage('浏览器打开功能将在详情 URL 映射确认后启用。');
    })
  );

  void refresh();
}

export function deactivate(): void {}
```

- [ ] **Step 3: Compile**

Run: `npm run compile`

Expected: PASS.

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit activation**

```bash
git add src/loadProjectData.ts src/extension.ts
git commit -m "feat: wire zentao extension commands"
```

---

### Task 10: Verification, Packaging, and Manual QA

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Run full verification**

Run: `npm run verify`

Expected: compile and tests both pass.

- [ ] **Step 2: Inspect VS Code extension manifest**

Run: `npm run compile`

Expected: no TypeScript errors and `out/extension.js` exists.

- [ ] **Step 3: Manual VS Code run**

Open the Run and Debug view, choose `Run Extension`, and verify:

```text
1. Activity Bar shows ZenTao container.
2. 禅道项目 view shows a useful missing-config message when settings are empty.
3. After setting zentao.baseUrl and zentao.projectId, 重新连接 prompts for account and password.
4. 请求日志 opens the ZenTao Requests output channel.
5. Refresh loads project, stories, executions, and tasks from a reachable ZenTao instance.
6. Tree groups show total counts.
7. Story/task rows show ID, name, priority, and status.
8. Detail page shows compact fields, description/acceptance, attachments, activities, and raw JSON.
9. Attachment appears above 评论 / 操作历史.
10. Request log does not include token, password, or Cookie values.
```

- [ ] **Step 4: Commit verification metadata if scripts changed**

Run: `git status --short`

Expected: no files changed. If `package.json` was adjusted during verification, commit it:

```bash
git add package.json package-lock.json
git commit -m "chore: finalize extension verification scripts"
```

- [ ] **Step 5: Push branch**

Run: `git push -u origin v0.1.0`

Expected: branch `v0.1.0` is updated on `origin`.

---

## Plan Self-Review

- Spec coverage: configuration, SecretStorage, token authentication, project/stories/executions/tasks queries, TreeView counts and item fields, Detail Webview order, attachments, comments/actions, raw JSON, request logging, redaction, and no write operations are covered by Tasks 1-10.
- Completeness scan: every task has concrete files, commands, expected output, and code snippets where code changes are required.
- Type consistency: shared types are defined in Task 2 and reused by client, mapper, tree provider, panel, attachment service, and activation tasks with matching names.