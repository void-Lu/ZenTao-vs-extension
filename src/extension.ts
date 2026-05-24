import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { CredentialsStore, readConnectionConfig, readOptionalProjectId } from './configuration';
import { runConnectionWizard } from './connectionWizard';
import { DetailPanel } from './detailPanel';
import { toDetailViewModel } from './detailMapper';
import { loadProjectData } from './loadProjectData';
import { RequestLogger } from './requestLogger';
import { ZenTaoClient } from './zentaoClient';
import { ZenTaoTreeNode, ZenTaoTreeProvider } from './treeProvider';
import { ZenTaoItemType } from './types';

function getNodeTarget(node: unknown): { type: ZenTaoItemType; id: number } | undefined {
  const treeNode = node as ZenTaoTreeNode | undefined;
  if (treeNode?.kind === 'story') {
    return { type: 'story', id: treeNode.story.id };
  }
  if (treeNode?.kind === 'task') {
    return { type: 'task', id: treeNode.task.id };
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('ZenTao Requests');
  const logger = new RequestLogger(output);
  const credentials = new CredentialsStore(context.secrets);
  const treeProvider = new ZenTaoTreeProvider();
  const treeView = vscode.window.createTreeView('zentaoProjectView', { treeDataProvider: treeProvider });

  let client: ZenTaoClient | undefined;
  let clientConfig: { baseUrl: string; requestTimeout: number } | undefined;
  let detailPanel: DetailPanel | undefined;
  let currentDetailTarget: { type: ZenTaoItemType; id: number } | undefined;

  function getWorkspaceConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('zentao');
  }

  function createClient(baseUrl: string, requestTimeout = readConnectionConfig(getWorkspaceConfig()).requestTimeout): ZenTaoClient {
    return new ZenTaoClient({
      baseUrl,
      timeoutMs: requestTimeout,
      getToken: async () => (await credentials.getCredentials(baseUrl)).token,
      setToken: async (token) => credentials.storeToken(token, baseUrl),
      logger
    });
  }

  function getRequestTimeout(): number {
    return getWorkspaceConfig().get<number>('requestTimeout') ?? 15000;
  }

  function createWizardClient(baseUrl: string, requestTimeout = getRequestTimeout()): ZenTaoClient {
    let token: string | undefined;
    return new ZenTaoClient({
      baseUrl,
      timeoutMs: requestTimeout,
      getToken: async () => token,
      setToken: async (value) => { token = value; },
      logger
    });
  }

  function getClient(): ZenTaoClient {
    const config = readConnectionConfig(getWorkspaceConfig());
    if (client && clientConfig?.baseUrl === config.baseUrl && clientConfig.requestTimeout === config.requestTimeout) {
      return client;
    }
    clientConfig = config;
    client = createClient(config.baseUrl, config.requestTimeout);
    return client;
  }

  async function runFirstTimeWizard(currentBaseUrl?: string): Promise<number | undefined> {
    const result = await runConnectionWizard({
      mode: 'firstTime',
      currentBaseUrl,
      window: vscode.window,
      configuration: getWorkspaceConfig(),
      createClient: (baseUrl) => createWizardClient(baseUrl),
      storeLogin: (account, password, token, baseUrl) => credentials.storeLogin(account, password, token, baseUrl)
    });
    client = undefined;
    clientConfig = undefined;
    return result?.projectId;
  }

  async function resolveProjectId(): Promise<number | undefined> {
    let config;
    try {
      config = readConnectionConfig(getWorkspaceConfig());
    } catch {
      return runFirstTimeWizard();
    }

    const stored = await credentials.getCredentials(config.baseUrl);
    if (!stored.token) {
      return runFirstTimeWizard(config.baseUrl);
    }

    const existingProjectId = readOptionalProjectId(getWorkspaceConfig());
    if (existingProjectId !== undefined) {
      return existingProjectId;
    }
    return runFirstTimeWizard();
  }

  async function refreshCurrentDetail(): Promise<void> {
    if (!currentDetailTarget || !detailPanel?.isOpen()) {
      return;
    }
    const raw = currentDetailTarget.type === 'story'
      ? await getClient().getStory(currentDetailTarget.id)
      : await getClient().getTask(currentDetailTarget.id);
    detailPanel.show(toDetailViewModel(currentDetailTarget.type, raw));
  }

  async function refresh(): Promise<void> {
    try {
      const projectId = await resolveProjectId();
      if (projectId === undefined) {
        return;
      }
      const data = await loadProjectData(getClient(), projectId);
      treeProvider.setState(data);
      await refreshCurrentDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      treeProvider.setState({ stories: [], tasks: [], partialTaskFailure: false, message });
      vscode.window.showWarningMessage(message);
    }
  }

  async function reconnect(): Promise<void> {
    treeProvider.setState({ stories: [], tasks: [], partialTaskFailure: false, message: '正在重新连接禅道...' });
    detailPanel?.close();
    detailPanel = undefined;
    currentDetailTarget = undefined;

    let config;
    try {
      config = readConnectionConfig(getWorkspaceConfig());
    } catch {
      const projectId = await runFirstTimeWizard();
      if (projectId !== undefined) {
        await refresh();
      }
      return;
    }

    const previous = await credentials.getCredentials(config.baseUrl);
    const result = await runConnectionWizard({
      mode: 'reconnect',
      currentBaseUrl: config.baseUrl,
      existingProjectId: readOptionalProjectId(getWorkspaceConfig()),
      previousAccount: previous.account,
      window: vscode.window,
      configuration: getWorkspaceConfig(),
      createClient: (baseUrl) => createWizardClient(baseUrl, config.requestTimeout),
      storeLogin: (account, password, token, baseUrl) => credentials.storeLogin(account, password, token, baseUrl)
    });
    client = undefined;
    clientConfig = undefined;
    if (result !== undefined) {
      vscode.window.showInformationMessage('禅道连接成功。');
      await refresh();
    }
  }

  async function openDetail(typeOrNode: ZenTaoItemType | unknown, id?: number): Promise<void> {
    const target = typeof typeOrNode === 'string' && typeof id === 'number'
      ? { type: typeOrNode as ZenTaoItemType, id }
      : getNodeTarget(typeOrNode);
    if (!target) {
      vscode.window.showWarningMessage('无法识别要打开的禅道条目。');
      return;
    }

    currentDetailTarget = target;
    const raw = target.type === 'story' ? await getClient().getStory(target.id) : await getClient().getTask(target.id);
    const detail = toDetailViewModel(target.type, raw);
    if (!detailPanel) {
      detailPanel = new DetailPanel(context.extensionUri, new AttachmentService(getClient));
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
      const target = getNodeTarget(node);
      if (target) {
        await vscode.env.clipboard.writeText(String(target.id));
      }
    }),
    vscode.commands.registerCommand('zentao.openExternal', async () => {
      vscode.window.showInformationMessage('浏览器打开功能将在详情 URL 映射确认后启用。');
    })
  );

  void refresh();
}

export function deactivate(): void {}
