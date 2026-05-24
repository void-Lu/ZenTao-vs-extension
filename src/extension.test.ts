import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';


vi.mock('./zentaoClient', () => {
  const instances: Array<{ options: { baseUrl: string; timeoutMs: number } }> = [];
  class ZenTaoClient {
    constructor(public readonly options: { baseUrl: string; timeoutMs: number }) {
      instances.push(this);
    }
    async login() {
      return 'token-1';
    }
    async getProjects() {
      return { projects: [{ id: 1, name: 'Alpha' }] };
    }
    async getProject(projectId: number) {
      return { id: projectId, name: `Project ${projectId}` };
    }
    async getProjectExecutions() {
      return { executions: [] };
    }
  }
  return { ZenTaoClient, __instances: instances };
});

vi.mock('./loadProjectData', () => ({
  loadProjectData: vi.fn(async (_client: unknown, projectId: number) => ({
    project: { id: projectId, name: `Project ${projectId}`, raw: {} },
    stories: [],
    tasks: [],
    partialTaskFailure: false
  }))
}));


const root = resolve(__dirname, '..');

describe('extension scaffold', () => {
  test('uses an SVG resource for the Activity Bar icon', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const icon = manifest.contributes.viewsContainers.activitybar[0].icon;

    expect(icon).toBe('resources/zentao.svg');
    expect(icon).toMatch(/\.svg$/);
  });

  test('registers every contributed command', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const extensionSource = readFileSync(resolve(root, 'src', 'extension.ts'), 'utf8');
    const contributedCommands = manifest.contributes.commands.map(
      (command: { command: string }) => command.command
    );

    for (const command of contributedCommands) {
      expect(extensionSource).toContain(`registerCommand('${command}'`);
    }
  });

  test('wires reconnect through the guided connection wizard and clears UI first', () => {
    const extensionSource = readFileSync(resolve(root, 'src', 'extension.ts'), 'utf8');

    expect(extensionSource).toContain('runConnectionWizard');
    expect(extensionSource).toContain('detailPanel?.close()');
    expect(extensionSource).toContain("message: '正在重新连接禅道...'");
    expect(extensionSource).toContain("mode: 'reconnect'");
  });

  test('refresh reloads tree and open detail data without closing the detail panel', () => {
    const extensionSource = readFileSync(resolve(root, 'src', 'extension.ts'), 'utf8');
    const refreshStart = extensionSource.indexOf('async function refresh()');
    const reconnectStart = extensionSource.indexOf('async function reconnect()');
    const refreshSource = extensionSource.slice(refreshStart, reconnectStart);

    expect(refreshSource).toContain('await refreshCurrentDetail()');
    expect(refreshSource).not.toContain('detailPanel?.close()');
    expect(extensionSource).toContain('async function refreshCurrentDetail()');
    expect(extensionSource).toContain('currentDetailTarget');
  });

  test('runs first-time wizard when refresh has configuration but no token', async () => {
    vi.resetModules();
    const values: { baseUrl: string; projectId: number; requestTimeout: number } = { baseUrl: 'https://zentao.example.com/', projectId: 7, requestTimeout: 5000 };
    const updates: Array<{ key: string; value: unknown }> = [];
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const showInputBox = vi.fn()
      .mockResolvedValueOnce('https://zentao.example.com')
      .mockResolvedValueOnce('alice')
      .mockResolvedValueOnce('secret');
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox,
        showQuickPick: vi.fn(async () => ({ label: 'Alpha', description: '#7', projectId: 7 }))
      },
      workspace: {
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          update: async (key: string, value: unknown) => {
            updates.push({ key, value });
            (values as any)[key] = value;
          }
        })
      },
      commands: {
        registerCommand: (name: string, callback: (...args: unknown[]) => unknown) => {
          commands.set(name, callback);
          return { dispose() {} };
        }
      },
      EventEmitter: class {
        event = vi.fn();
        fire = vi.fn();
        dispose = vi.fn();
      },
      TreeItem: class {
        constructor(public readonly label: string, public readonly collapsibleState?: unknown) {}
      },
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      env: { clipboard: { writeText: vi.fn() } }
    }));
    const extension = await import('./extension');

    extension.activate({ secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showInputBox).toHaveBeenCalledWith({ prompt: '输入禅道 URL', value: 'https://zentao.example.com/', ignoreFocusOut: true });
    expect(updates).toContainEqual({ key: 'projectId', value: 7 });
  });

  test('runs first-time wizard when refresh has no base URL configured', async () => {
    vi.resetModules();
    const values: { baseUrl: string; projectId: number; requestTimeout: number } = { baseUrl: '', projectId: 0, requestTimeout: 5000 };
    const updates: Array<{ key: string; value: unknown }> = [];
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const showInputBox = vi.fn()
      .mockResolvedValueOnce('https://zentao.example.com')
      .mockResolvedValueOnce('alice')
      .mockResolvedValueOnce('secret');
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox,
        showQuickPick: vi.fn(async () => ({ label: 'Alpha', description: '#1', projectId: 1 }))
      },
      workspace: {
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          update: async (key: string, value: unknown) => {
            updates.push({ key, value });
            (values as any)[key] = value;
          }
        })
      },
      commands: {
        registerCommand: (name: string, callback: (...args: unknown[]) => unknown) => {
          commands.set(name, callback);
          return { dispose() {} };
        }
      },
      EventEmitter: class {
        event = vi.fn();
        fire = vi.fn();
        dispose = vi.fn();
      },
      TreeItem: class {
        constructor(public readonly label: string, public readonly collapsibleState?: unknown) {}
      },
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      env: { clipboard: { writeText: vi.fn() } }
    }));
    const extension = await import('./extension');

    extension.activate({ secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updates).toEqual([
      { key: 'baseUrl', value: 'https://zentao.example.com/' },
      { key: 'projectId', value: 1 }
    ]);
  });

  test('recreates the ZenTao client when connection settings change', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://one.example.com/', projectId: 1, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn()
      },
      workspace: {
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          update: vi.fn()
        })
      },
      commands: {
        registerCommand: (name: string, callback: (...args: unknown[]) => unknown) => {
          commands.set(name, callback);
          return { dispose() {} };
        }
      },
      EventEmitter: class {
        event = vi.fn();
        fire = vi.fn();
        dispose = vi.fn();
      },
      TreeItem: class {
        constructor(public readonly label: string, public readonly collapsibleState?: unknown) {}
      },
      TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
      env: { clipboard: { writeText: vi.fn() } }
    }));
    const extension = await import('./extension');
    const clientModule = await import('./zentaoClient') as unknown as { __instances: Array<{ options: { baseUrl: string } }> };

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await commands.get('zentao.refresh')?.();
    values.baseUrl = 'https://two.example.com/';
    await commands.get('zentao.refresh')?.();

    expect(clientModule.__instances.map((instance) => instance.options.baseUrl).slice(-2)).toEqual([
      'https://one.example.com/',
      'https://two.example.com/'
    ]);
  });
});