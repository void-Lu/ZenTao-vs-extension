import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { CredentialsStore, readConnectionConfig, readOptionalProjectId } from './configuration';
import { DetailPanel } from './detailPanel';
import { toDetailViewModel } from './detailMapper';
import { loadProjectData } from './loadProjectData';
import { ensureProjectId } from './projectSelection';
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

  function getWorkspaceConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('zentao');
  }

  function getClient(): ZenTaoClient {
    const config = readConnectionConfig(getWorkspaceConfig());
    if (client && clientConfig?.baseUrl === config.baseUrl && clientConfig.requestTimeout === config.requestTimeout) {
      return client;
    }
    clientConfig = config;
    client = new ZenTaoClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeout,
      getToken: async () => (await credentials.getCredentials(config.baseUrl)).token,
      setToken: async (token) => credentials.storeToken(token, config.baseUrl),
      logger
    });
    return client;
  }

  async function resolveProjectId(): Promise<number | undefined> {
    const config = getWorkspaceConfig();
    return await ensureProjectId({
      existingProjectId: readOptionalProjectId(config),
      client: getClient(),
      configuration: config,
      window: vscode.window
    });
  }

  async function refresh(): Promise<void> {
    try {
      const projectId = await resolveProjectId();
      if (projectId === undefined) {
        return;
      }
      const data = await loadProjectData(getClient(), projectId);
      treeProvider.setState(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      treeProvider.setState({ stories: [], tasks: [], partialTaskFailure: false, message });
      vscode.window.showWarningMessage(message);
    }
  }

  async function reconnect(): Promise<void> {
    const previous = await credentials.getCredentials(readConnectionConfig(getWorkspaceConfig()).baseUrl);
    const account = await vscode.window.showInputBox({ prompt: '输入禅道用户名', value: previous.account, ignoreFocusOut: true });
    if (!account) {
      return;
    }
    const password = await vscode.window.showInputBox({ prompt: '输入禅道密码', password: true, ignoreFocusOut: true });
    if (!password) {
      return;
    }
    client = undefined;
    clientConfig = undefined;
    const token = await getClient().login(account, password);
    await credentials.storeLogin(account, password, token, readConnectionConfig(getWorkspaceConfig()).baseUrl);
    vscode.window.showInformationMessage('禅道连接成功。');
    const projectId = await ensureProjectId({
      existingProjectId: readOptionalProjectId(getWorkspaceConfig()),
      client: getClient(),
      configuration: getWorkspaceConfig(),
      window: vscode.window
    });
    if (projectId !== undefined) {
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
