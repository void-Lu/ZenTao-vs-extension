import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';


vi.mock('./zentaoClient', () => {
  const instances: Array<{ options: { baseUrl: string; timeoutMs: number } }> = [];
  class ZenTaoClient {
    constructor(public readonly options: { baseUrl: string; timeoutMs: number }) {
      instances.push(this);
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

    extension.activate({ secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await commands.get('zentao.refresh')?.();
    values.baseUrl = 'https://two.example.com/';
    await commands.get('zentao.refresh')?.();

    expect(clientModule.__instances.map((instance) => instance.options.baseUrl)).toEqual([
      'https://one.example.com/',
      'https://two.example.com/'
    ]);
  });
});