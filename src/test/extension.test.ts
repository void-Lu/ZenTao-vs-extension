import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const zentaoClientMock = vi.hoisted(() => ({
  getStory: undefined as undefined | ((id: number) => Promise<unknown>)
}));

vi.mock('../zentaoClient', () => {
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
    async getStory(id: number) {
      if (zentaoClientMock.getStory) {
        return zentaoClientMock.getStory(id);
      }
      return { id, title: `Story ${id}` };
    }
    async getTask(id: number) {
      return { id, name: `Task ${id}` };
    }
  }
  return { ZenTaoClient, __instances: instances };
});

vi.mock('../loadProjectData', () => ({
  loadProjectData: vi.fn(async (_client: unknown, projectId: number) => ({
    project: { id: projectId, name: `Project ${projectId}`, raw: {} },
    stories: [],
    tasks: [],
    partialTaskFailure: false
  }))
}));


const root = resolve(__dirname, '..', '..');

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

  test('contributes configuration scopes matching baseUrl and projectId storage semantics', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

    expect(manifest.contributes.configuration.properties['zentao.baseUrl'].scope).toBe('application');
    expect(manifest.contributes.configuration.properties['zentao.projectId'].scope).toBe('window');
  });

  test('contributes tree title commands for project reselect and local sort/filter', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const contributedCommands = manifest.contributes.commands.map(
      (command: { command: string }) => command.command
    );
    const viewTitleCommands = manifest.contributes.menus['view/title'].map(
      (item: { command: string; when: string }) => item
    );

    expect(contributedCommands).toEqual(expect.arrayContaining([
      'zentao.reselectProject',
      'zentao.setTreeFilter',
      'zentao.clearTreeFilter',
      'zentao.setTreeSort'
    ]));
    for (const command of ['zentao.reselectProject', 'zentao.setTreeFilter', 'zentao.clearTreeFilter', 'zentao.setTreeSort']) {
      expect(viewTitleCommands).toContainEqual(expect.objectContaining({ command, when: 'view == zentaoProjectView' }));
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

  test('tree sort and filter commands change local provider state without reloading project data', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://zentao.example.com/', projectId: 1, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const providers: any[] = [];
    const showInputBox = vi.fn(async () => 'closed');
    const showQuickPick = vi.fn(async (items: Array<{ mode?: string }>) => items.find((item) => item.mode === 'sourceOrder'));
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: (_id: string, options: { treeDataProvider: unknown }) => {
          providers.push(options.treeDataProvider);
          return { dispose() {} };
        },
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox,
        showQuickPick
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    const extension = await import('../extension');
    const { loadProjectData } = await import('../loadProjectData');

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const initialLoadCount = vi.mocked(loadProjectData).mock.calls.length;

    await commands.get('zentao.setTreeFilter')?.();
    await commands.get('zentao.setTreeSort')?.();
    await commands.get('zentao.clearTreeFilter')?.();

    expect(showInputBox).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('ID/标题/名称/指派给') }));
    expect(showQuickPick).toHaveBeenCalledWith(expect.not.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining('标题') }),
      expect.objectContaining({ label: expect.stringContaining('ID') })
    ]), expect.anything());
    expect(vi.mocked(loadProjectData).mock.calls.length).toBe(initialLoadCount);
    expect(providers[0]).toBeDefined();
  });

  test('opens story and task pages in the external browser using classic ZenTao URLs', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://zentao.example.com/api.php/v1/', projectId: 1, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const openExternal = vi.fn();
    const parse = vi.fn((value: string) => ({ value }));
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
      env: { clipboard: { writeText: vi.fn() }, openExternal },
      Uri: { parse },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await commands.get('zentao.openExternal')?.({ kind: 'story', story: { id: 101 } });
    await commands.get('zentao.openExternal')?.({ kind: 'task', task: { id: 202 } });

    expect(parse).toHaveBeenCalledWith('https://zentao.example.com/story-view-101.html');
    expect(parse).toHaveBeenCalledWith('https://zentao.example.com/task-view-202.html');
    expect(openExternal).toHaveBeenCalledWith({ value: 'https://zentao.example.com/story-view-101.html' });
    expect(openExternal).toHaveBeenCalledWith({ value: 'https://zentao.example.com/task-view-202.html' });
  });

  test('uses explicit configuration targets for first-time setup writes', async () => {
    vi.resetModules();
    const values: { baseUrl: string; projectId: number; requestTimeout: number } = { baseUrl: '', projectId: 0, requestTimeout: 5000 };
    const updates: Array<{ key: string; value: unknown; target: unknown }> = [];
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox: vi.fn()
          .mockResolvedValueOnce('https://zentao.example.com')
          .mockResolvedValueOnce('alice')
          .mockResolvedValueOnce('secret'),
        showQuickPick: vi.fn(async () => ({ label: 'Alpha', description: '#1', projectId: 1 }))
      },
      workspace: {
        workspaceFolders: [{}],
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          inspect: <T,>(key: string): { globalValue?: T } | undefined => key === 'baseUrl' ? { globalValue: values.baseUrl as T } : undefined,
          update: async (key: string, value: unknown, target: unknown) => {
            updates.push({ key, value, target });
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: 'global', Workspace: 'workspace' }
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updates).toEqual([
      { key: 'account', value: 'alice', target: 'global' },
      { key: 'baseUrl', value: 'https://zentao.example.com/', target: 'global' },
      { key: 'projectId', value: 1, target: 'workspace' }
    ]);
  });

  test('migrates legacy workspace baseUrl before the initial refresh loads project data', async () => {
    vi.resetModules();
    const values: { globalBaseUrl: string; workspaceBaseUrl: string; projectId: number; requestTimeout: number } = {
      globalBaseUrl: '',
      workspaceBaseUrl: 'https://workspace.example.com',
      projectId: 7,
      requestTimeout: 5000
    };
    const events: string[] = [];
    const updates: Array<{ key: string; value: unknown; target: unknown }> = [];
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const showWarningMessage = vi.fn(async (_message: string, _options?: unknown, confirm?: string) => confirm);
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage,
        showInformationMessage: vi.fn(),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn()
      },
      workspace: {
        workspaceFolders: [{}],
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => {
            if (key === 'requestTimeout') {
              return values.requestTimeout as T;
            }
            if (key === 'projectId') {
              return values.projectId as T;
            }
            if (key === 'account') {
              return 'alice' as T;
            }
            return undefined;
          },
          inspect: <T,>(key: string): { globalValue?: T; workspaceValue?: T } | undefined => key === 'baseUrl'
            ? { globalValue: values.globalBaseUrl as T, workspaceValue: values.workspaceBaseUrl as T }
            : undefined,
          update: async (key: string, value: unknown, target: unknown) => {
            events.push(`update:${key}`);
            updates.push({ key, value, target });
            if (key === 'baseUrl') {
              values.globalBaseUrl = value as string;
            }
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: 'global', Workspace: 'workspace' }
    }));
    vi.doMock('../loadProjectData', () => ({
      loadProjectData: vi.fn(async (_client: unknown, projectId: number) => {
        events.push(`load:${projectId}`);
        return {
          project: { id: projectId, name: `Project ${projectId}`, raw: {} },
          stories: [],
          tasks: [],
          partialTaskFailure: false
        };
      })
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('https://workspace.example.com/'),
      { modal: true },
      '迁移到用户配置'
    );
    expect(updates).toEqual([{ key: 'baseUrl', value: 'https://workspace.example.com/', target: 'global' }]);
    expect(events).toEqual(['update:baseUrl', 'load:7']);
  });

  test('does not migrate legacy workspace baseUrl when the user declines confirmation', async () => {
    vi.resetModules();
    const values: { globalBaseUrl: string; workspaceBaseUrl: string; projectId: number; requestTimeout: number } = {
      globalBaseUrl: '',
      workspaceBaseUrl: 'https://workspace.example.com',
      projectId: 7,
      requestTimeout: 5000
    };
    const updates: Array<{ key: string; value: unknown; target: unknown }> = [];
    const showWarningMessage = vi.fn(async () => undefined);
    const showInputBox = vi.fn(async () => undefined);
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage,
        showInformationMessage: vi.fn(),
        showInputBox,
        showQuickPick: vi.fn()
      },
      workspace: {
        workspaceFolders: [{}],
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => {
            if (key === 'requestTimeout') {
              return values.requestTimeout as T;
            }
            if (key === 'projectId') {
              return values.projectId as T;
            }
            return undefined;
          },
          inspect: <T,>(key: string): { globalValue?: T; workspaceValue?: T } | undefined => key === 'baseUrl'
            ? { globalValue: values.globalBaseUrl as T, workspaceValue: values.workspaceBaseUrl as T }
            : undefined,
          update: async (key: string, value: unknown, target: unknown) => {
            updates.push({ key, value, target });
          }
        })
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose() {} }))
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: 'global', Workspace: 'workspace' }
    }));
    const loadProjectData = vi.fn();
    vi.doMock('../loadProjectData', () => ({ loadProjectData }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('https://workspace.example.com/'),
      { modal: true },
      '迁移到用户配置'
    );
    expect(updates).toEqual([]);
    expect(loadProjectData).not.toHaveBeenCalled();
    expect(showInputBox).toHaveBeenCalledWith({ prompt: '输入禅道 URL', value: undefined, ignoreFocusOut: true });
  });

  test('reselectProject loads the new project, updates the tree, and closes open details only on success', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://zentao.example.com/', projectId: 1, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const treeStates: unknown[] = [];
    const closedDetails: string[] = [];
    let capturedOpenDetail: ((type: 'story' | 'task', id: number) => Promise<void>) | undefined;
    vi.doMock('../detailPanel', () => ({
      DetailPanel: class {
        constructor(_extensionUri: unknown, _attachmentService: unknown, openDetail: (type: 'story' | 'task', id: number) => Promise<void>) {
          capturedOpenDetail = openDetail;
        }
        isOpen() { return true; }
        show() {}
        close() { closedDetails.push('closed'); }
      }
    }));
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn(async () => ({ label: 'Project 2', description: '#2', projectId: 2 }))
      },
      workspace: {
        workspaceFolders: [{}],
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          inspect: <T,>(key: string): { globalValue?: T } | undefined => key === 'baseUrl' ? { globalValue: values.baseUrl as T } : undefined,
          update: async (key: string, value: unknown) => { (values as any)[key] = value; }
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    vi.doMock('../treeProvider', async () => {
      const actual = await vi.importActual<typeof import('../treeProvider')>('../treeProvider');
      return {
        ...actual,
        ZenTaoTreeProvider: class extends actual.ZenTaoTreeProvider {
          setState(state: any) {
            treeStates.push(state);
            super.setState(state);
          }
        }
      };
    });
    vi.doMock('../loadProjectData', () => ({
      loadProjectData: vi.fn(async (_client: unknown, projectId: number) => ({
        project: { id: projectId, name: `Project ${projectId}`, raw: {} },
        stories: [],
        tasks: [],
        partialTaskFailure: false
      }))
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await commands.get('zentao.openDetail')?.('story', 1);
    expect(capturedOpenDetail).toBeTypeOf('function');
    await commands.get('zentao.reselectProject')?.();

    expect(values.projectId).toBe(2);
    expect(treeStates).toContainEqual(expect.objectContaining({ project: { id: 2, name: 'Project 2', raw: {} } }));
    expect(closedDetails).toEqual(['closed']);
  });

  test('reselectProject failure preserves the current tree and open detail', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://zentao.example.com/', projectId: 1, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const treeStates: unknown[] = [];
    const closedDetails: string[] = [];
    vi.doMock('../detailPanel', () => ({
      DetailPanel: class {
        constructor(_extensionUri: unknown, _attachmentService: unknown, _openDetail: (type: 'story' | 'task', id: number) => Promise<void>) {}
        isOpen() { return true; }
        show() {}
        close() { closedDetails.push('closed'); }
      }
    }));
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn(async () => ({ label: 'Project 2', description: '#2', projectId: 2 }))
      },
      workspace: {
        workspaceFolders: [{}],
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          inspect: <T,>(key: string): { globalValue?: T } | undefined => key === 'baseUrl' ? { globalValue: values.baseUrl as T } : undefined,
          update: async (key: string, value: unknown) => { (values as any)[key] = value; }
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    vi.doMock('../treeProvider', async () => {
      const actual = await vi.importActual<typeof import('../treeProvider')>('../treeProvider');
      return {
        ...actual,
        ZenTaoTreeProvider: class extends actual.ZenTaoTreeProvider {
          setState(state: any) {
            treeStates.push(state);
            super.setState(state);
          }
        }
      };
    });
    vi.doMock('../loadProjectData', () => ({
      loadProjectData: vi.fn(async (_client: unknown, projectId: number) => {
        if (projectId === 2) {
          throw new Error('load failed');
        }
        return {
          project: { id: projectId, name: `Project ${projectId}`, raw: {} },
          stories: [],
          tasks: [],
          partialTaskFailure: false
        };
      })
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await commands.get('zentao.openDetail')?.('story', 1);
    const stateCountBeforeReselect = treeStates.length;
    await commands.get('zentao.reselectProject')?.();

    expect(values.projectId).toBe(1);
    expect(treeStates).toHaveLength(stateCountBeforeReselect);
    expect(closedDetails).toEqual([]);
  });

  test('surfaces the API error when story detail cannot be fetched and no cache exists', async () => {
    vi.resetModules();
    zentaoClientMock.getStory = async () => { throw new Error('ZenTao request failed with status 403'); };
    const values = { baseUrl: 'https://zentao.example.com/', projectId: 628, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const showErrorMessage = vi.fn();
    vi.doMock('vscode', () => ({
      window: {
        createOutputChannel: () => ({ appendLine() {}, show() {} }),
        createTreeView: () => ({ dispose() {} }),
        showWarningMessage: vi.fn(),
        showErrorMessage,
        showInformationMessage: vi.fn(),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn()
      },
      workspace: {
        workspaceFolders: [{}],
        getConfiguration: () => ({
          get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
          inspect: <T,>(key: string): { globalValue?: T } | undefined => key === 'baseUrl' ? { globalValue: values.baseUrl as T } : undefined,
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await commands.get('zentao.openDetail')?.('story', 628);

    const message = showErrorMessage.mock.calls[0]?.[0];
    expect(message).toContain('需求 #628');
    expect(message).toContain('ZenTao request failed with status 403');
    zentaoClientMock.getStory = undefined;
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    const extension = await import('../extension');

    extension.activate({ secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updates).toEqual([
      { key: 'account', value: 'alice' },
      { key: 'baseUrl', value: 'https://zentao.example.com/' },
      { key: 'projectId', value: 1 }
    ]);
  });

  test('registers commands even when the VS Code configuration object is not extensible', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://zentao.example.com/', projectId: 1, requestTimeout: 5000 };
    const commands = new Map<string, (...args: unknown[]) => unknown>();
    const configuration = Object.preventExtensions({
      get: <T,>(key: string): T | undefined => values[key as keyof typeof values] as T | undefined,
      inspect: <T,>(key: string): { globalValue?: T } | undefined => key === 'baseUrl' ? { globalValue: values.baseUrl as T } : undefined,
      update: vi.fn()
    });
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
        workspaceFolders: [{}],
        getConfiguration: () => configuration
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: 'global', Workspace: 'workspace' }
    }));
    const extension = await import('../extension');

    expect(() => extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any)).not.toThrow();
    expect(commands.has('zentao.reconnect')).toBe(true);
  });

  test('recreates the ZenTao client when connection settings change', async () => {
    vi.resetModules();
    const values = { baseUrl: 'https://one.example.com/', projectId: 1, requestTimeout: 5000, account: 'alice' };
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
      env: { clipboard: { writeText: vi.fn() } },
      ConfigurationTarget: { Global: true, Workspace: false }
    }));
    const extension = await import('../extension');
    const clientModule = await import('../zentaoClient') as unknown as { __instances: Array<{ options: { baseUrl: string } }> };

    extension.activate({ secrets: { get: async (key: string) => key.startsWith('zentao.token') ? 'token-1' : undefined, store: async () => undefined, delete: async () => undefined }, subscriptions: [], extensionUri: {} } as any);
    await commands.get('zentao.refresh')?.();
    values.baseUrl = 'https://two.example.com/';
    await commands.get('zentao.refresh')?.();

    // getAdminClient() creates both personalClient + adminClient (2 instances per refresh)
    const baseUrls = clientModule.__instances.map((instance) => instance.options.baseUrl);
    expect(baseUrls).toContain('https://one.example.com/');
    expect(baseUrls).toContain('https://two.example.com/');
    expect(baseUrls[baseUrls.length - 1]).toBe('https://two.example.com/');
  });
});