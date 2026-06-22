import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { CredentialsStore, migrateLegacyBaseUrlToGlobal, readAccount, readConnectionConfig, readOptionalProjectId, storeAccount } from './configuration';
import { getAdminCredentials } from './adminCredentials';
import { runConnectionWizard } from './connectionWizard';
import { reselectProject } from './projectSelection';
import { DetailPanel } from './detailPanel';
import { toDetailViewModel } from './detailMapper';
import { rewriteContentImageUrls } from './html';
import { loadProjectData } from './loadProjectData';
import { RequestLogger } from './requestLogger';
import { ZenTaoApiError, ZenTaoClient } from './zentaoClient';
import { ZenTaoTreeNode, ZenTaoTreeProvider } from './treeProvider';
import { TreeSortMode } from './treeTransform';
import { ZenTaoItemType, DetailViewModel } from './types';

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

function classicPageBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/api\.php\/v1\/?$/i, '/');
  return url.toString();
}

function rewriteDetailImageUrls(detail: DetailViewModel, baseUrl: string, token: string | undefined): void {
  if (!token) {
    return;
  }
  for (const section of detail.contentSections) {
    section.html = rewriteContentImageUrls(section.html, baseUrl, token);
  }
  for (const activity of detail.activities) {
    activity.contentHtml = rewriteContentImageUrls(activity.contentHtml, baseUrl, token);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('ZenTao Requests');
  const logger = new RequestLogger(output);
  const credentials = new CredentialsStore(context.secrets);
  const treeProvider = new ZenTaoTreeProvider();
  const treeView = vscode.window.createTreeView('zentaoProjectView', { treeDataProvider: treeProvider });

  let personalClient: ZenTaoClient | undefined;
  let adminClient: ZenTaoClient | undefined;
  let clientConfig: { baseUrl: string; requestTimeout: number } | undefined;
  let detailPanel: DetailPanel | undefined;
  let currentDetailTarget: { type: ZenTaoItemType; id: number } | undefined;

  function getWorkspaceConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('zentao');
  }

  function getProjectConfigurationTarget(): vscode.ConfigurationTarget {
    return vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  }

  function getWritableConfig(): vscode.WorkspaceConfiguration & { getProjectTarget(): vscode.ConfigurationTarget; getGlobalTarget(): vscode.ConfigurationTarget } {
    const configuration = getWorkspaceConfig();
    return {
      get: configuration.get.bind(configuration),
      has: configuration.has?.bind(configuration) ?? ((section: string) => configuration.get(section) !== undefined),
      inspect: configuration.inspect?.bind(configuration) ?? (() => undefined),
      update: configuration.update.bind(configuration),
      getProjectTarget: getProjectConfigurationTarget,
      getGlobalTarget: () => vscode.ConfigurationTarget.Global
    } as vscode.WorkspaceConfiguration & { getProjectTarget(): vscode.ConfigurationTarget; getGlobalTarget(): vscode.ConfigurationTarget };
  }

  async function confirmBaseUrlMigration(baseUrl: string): Promise<boolean> {
    const confirm = '迁移到用户配置';
    const selected = await vscode.window.showWarningMessage(
      `检测到当前工作区配置了 ZenTao URL：${baseUrl}。是否将它迁移为用户级配置？`,
      { modal: true },
      confirm
    );
    return selected === confirm;
  }

  const initializeConfiguration = migrateLegacyBaseUrlToGlobal(getWritableConfig(), vscode.ConfigurationTarget.Global, confirmBaseUrlMigration).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(message);
  });

  function createPersonalClient(baseUrl: string, requestTimeout = readConnectionConfig(getWorkspaceConfig()).requestTimeout): ZenTaoClient {
    // 个人客户端：用于项目列表和项目选择。401 时使用当前账号 + SecretStorage 密码自动重登最多 3 次。
    return new ZenTaoClient({
      baseUrl,
      timeoutMs: requestTimeout,
      getToken: async () => (await credentials.getCredentials(baseUrl)).token,
      setToken: async (token) => credentials.storeToken(token, baseUrl),
      refreshToken: async () => {
        const account = readAccount(getWorkspaceConfig());
        const stored = await credentials.getCredentials(baseUrl);
        if (!account || !stored.password) {
          return undefined;
        }
        const loginClient = new ZenTaoClient({
          baseUrl,
          timeoutMs: requestTimeout,
          getToken: async () => undefined,
          setToken: async (token) => credentials.storeToken(token, baseUrl),
          logger
        });
        return loginClient.login(account, stored.password);
      },
      logger
    });
  }

  function createAdminClient(baseUrl: string, requestTimeout = readConnectionConfig(getWorkspaceConfig()).requestTimeout): ZenTaoClient {
    // 管理员客户端：用于项目数据、需求列表、任务列表和详情。token 失效时由内置管理员凭据静默刷新。
    return new ZenTaoClient({
      baseUrl,
      timeoutMs: requestTimeout,
      getToken: async () => credentials.getAdminToken(baseUrl),
      setToken: async (token) => credentials.storeAdminToken(token, baseUrl),
      refreshToken: async () => {
        const admin = getAdminCredentials();
        const loginClient = new ZenTaoClient({
          baseUrl,
          timeoutMs: requestTimeout,
          getToken: async () => undefined,
          setToken: async (token) => credentials.storeAdminToken(token, baseUrl),
          logger
        });
        return loginClient.login(admin.account, admin.password);
      },
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

  function getPersonalClient(): ZenTaoClient {
    const config = readConnectionConfig(getWorkspaceConfig());
    if (personalClient && clientConfig?.baseUrl === config.baseUrl && clientConfig.requestTimeout === config.requestTimeout) {
      return personalClient;
    }
    clientConfig = config;
    personalClient = createPersonalClient(config.baseUrl, config.requestTimeout);
    adminClient = createAdminClient(config.baseUrl, config.requestTimeout);
    return personalClient;
  }

  function getAdminClient(): ZenTaoClient {
    const config = readConnectionConfig(getWorkspaceConfig());
    if (adminClient && clientConfig?.baseUrl === config.baseUrl && clientConfig.requestTimeout === config.requestTimeout) {
      return adminClient;
    }
    clientConfig = config;
    personalClient = createPersonalClient(config.baseUrl, config.requestTimeout);
    adminClient = createAdminClient(config.baseUrl, config.requestTimeout);
    return adminClient;
  }

  // 兼容旧调用：附件服务等仍持有一个 client 工厂；统一返回管理员客户端，
  // 因为附件下载发生在详情页（管理员读取的详情）上下文中。
  function getClient(): ZenTaoClient {
    return getAdminClient();
  }

  async function runFirstTimeWizard(currentBaseUrl?: string): Promise<number | undefined> {
    const result = await runConnectionWizard({
      mode: 'firstTime',
      currentBaseUrl,
      window: vscode.window,
      configuration: getWritableConfig(),
      createClient: (baseUrl) => createWizardClient(baseUrl),
      storeLogin: async (account, password, token, baseUrl) => {
        await storeAccount(getWorkspaceConfig(), account, vscode.ConfigurationTarget.Global);
        await credentials.storeLogin(password, token, baseUrl);
      }
    });
    personalClient = undefined;
    adminClient = undefined;
    clientConfig = undefined;
    return result?.projectId;
  }

  // 仅提示密码（不询问 URL、不询问用户名）。用于已配置 URL + 账号但 token 缺失且无密码时的普通刷新。
  async function promptPasswordAndLogin(baseUrl: string, account: string): Promise<boolean> {
    const password = await vscode.window.showInputBox({
      prompt: `输入禅道账号 ${account} 的密码`,
      password: true,
      ignoreFocusOut: true
    });
    if (!password) {
      return false;
    }
    const wizardClient = createWizardClient(baseUrl);
    let token: string;
    try {
      token = await wizardClient.login(account, password);
    } catch (error) {
      vscode.window.showErrorMessage(`禅道登录失败：${errorMessage(error)}`);
      return false;
    }
    await credentials.storeLogin(password, token, baseUrl);
    personalClient = undefined;
    clientConfig = undefined;
    return true;
  }

  // 用已配置账号 + SecretStorage 密码静默登录；失败返回 false。
  async function silentLoginWithStoredPassword(baseUrl: string, account: string, password: string): Promise<boolean> {
    const wizardClient = createWizardClient(baseUrl);
    let token: string;
    try {
      token = await wizardClient.login(account, password);
    } catch {
      return false;
    }
    await credentials.storeLogin(password, token, baseUrl);
    personalClient = undefined;
    clientConfig = undefined;
    return true;
  }

  // 重新连接流程：使用已配置 URL（不重新询问），从用户名和密码开始；用户名默认带出已配置账号。
  async function runReconnectFlow(baseUrl: string, requestTimeout: number, existingProjectId?: number): Promise<number | undefined> {
    const previousAccount = readAccount(getWorkspaceConfig());
    const result = await runConnectionWizard({
      mode: 'reconnect',
      currentBaseUrl: baseUrl,
      existingProjectId,
      previousAccount,
      window: vscode.window,
      configuration: getWritableConfig(),
      createClient: (b) => createWizardClient(b, requestTimeout),
      storeLogin: async (account, password, token, b) => {
        await storeAccount(getWorkspaceConfig(), account, vscode.ConfigurationTarget.Global);
        await credentials.storeLogin(password, token, b);
      }
    });
    personalClient = undefined;
    adminClient = undefined;
    clientConfig = undefined;
    return result?.projectId;
  }

  async function ensurePersonalTokenAndProject(): Promise<number | undefined> {
    let config;
    try {
      config = readConnectionConfig(getWorkspaceConfig());
    } catch {
      // URL 缺失或无效：走完整首次向导（会询问 URL）。
      return runFirstTimeWizard();
    }

    const account = readAccount(getWorkspaceConfig());
    const existingProjectId = readOptionalProjectId(getWorkspaceConfig());

    // 没有账号：走重新连接流程（不询问 URL，从用户名密码开始）。
    if (!account) {
      return runReconnectFlow(config.baseUrl, config.requestTimeout, existingProjectId);
    }

    const stored = await credentials.getCredentials(config.baseUrl);
    if (!stored.token) {
      // token 缺失：优先用 SecretStorage 密码静默登录；缺密码才只提示密码。
      if (stored.password) {
        const ok = await silentLoginWithStoredPassword(config.baseUrl, account, stored.password);
        if (!ok) {
          // 静默登录失败：只提示密码（仍不询问 URL 与用户名）。
          const okPrompt = await promptPasswordAndLogin(config.baseUrl, account);
          if (!okPrompt) {
            return undefined;
          }
        }
      } else {
        const ok = await promptPasswordAndLogin(config.baseUrl, account);
        if (!ok) {
          return undefined;
        }
      }
    }

    if (existingProjectId !== undefined) {
      return existingProjectId;
    }

    // 账号与 token 就绪但缺项目 ID：用个人客户端拉取项目列表选择，不询问 URL。
    const { ensureProjectId } = await import('./projectSelection');
    try {
      return await ensureProjectId({
        existingProjectId: undefined,
        client: getPersonalClient(),
        configuration: getWritableConfig(),
        window: vscode.window
      });
    } catch (error) {
      vscode.window.showWarningMessage(`无法获取禅道项目列表：${errorMessage(error)}`);
      return undefined;
    }
  }

  async function resolveProjectId(): Promise<number | undefined> {
    return ensurePersonalTokenAndProject();
  }

  async function refreshCurrentDetail(): Promise<void> {
    if (!currentDetailTarget || !detailPanel?.isOpen()) {
      return;
    }
    const raw = currentDetailTarget.type === 'story'
      ? await getAdminClient().getStory(currentDetailTarget.id)
      : await getAdminClient().getTask(currentDetailTarget.id);
    const detail = toDetailViewModel(currentDetailTarget.type, raw);
    const baseUrl = clientConfig?.baseUrl ?? readConnectionConfig(getWorkspaceConfig()).baseUrl;
    rewriteDetailImageUrls(detail, baseUrl, await credentials.getAdminToken(baseUrl));
    detailPanel.show(detail);
  }

  async function refresh(): Promise<void> {
    await initializeConfiguration;
    try {
      const projectId = await resolveProjectId();
      if (projectId === undefined) {
        return;
      }
      const data = await loadProjectData(getAdminClient(), projectId);
      treeProvider.setState(data);
      await refreshCurrentDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      treeProvider.setState({ stories: [], tasks: [], partialTaskFailure: false, message });
      // 401 重试耗尽后，提示重新输入用户名和密码（不重新询问 URL）。
      if (error instanceof ZenTaoApiError && error.status === 401) {
        try {
          const config = readConnectionConfig(getWorkspaceConfig());
          const picked = await runReconnectFlow(config.baseUrl, config.requestTimeout, readOptionalProjectId(getWorkspaceConfig()));
          if (picked !== undefined) {
            await refresh();
          }
        } catch {
          vscode.window.showWarningMessage(message);
        }
      } else {
        vscode.window.showWarningMessage(message);
      }
    }
  }

  async function reconnect(): Promise<void> {
    await initializeConfiguration;
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

    // 显式重新连接：使用已配置 URL，不重新询问；从用户名和密码开始，用户名默认带出已配置账号。
    const projectId = await runReconnectFlow(config.baseUrl, config.requestTimeout, readOptionalProjectId(getWorkspaceConfig()));
    if (projectId !== undefined) {
      vscode.window.showInformationMessage('禅道连接成功。');
      await refresh();
    }
  }

  async function openDetail(typeOrNode: ZenTaoItemType | unknown, id?: number): Promise<void> {
    await initializeConfiguration;
    const target = typeof typeOrNode === 'string' && typeof id === 'number'
      ? { type: typeOrNode as ZenTaoItemType, id }
      : getNodeTarget(typeOrNode);
    if (!target) {
      vscode.window.showWarningMessage('无法识别要打开的禅道条目。');
      return;
    }

    currentDetailTarget = target;
    let raw: unknown;
    try {
      // 打开需求/任务详情使用管理员客户端。
      raw = target.type === 'story' ? await getAdminClient().getStory(target.id) : await getAdminClient().getTask(target.id);
    } catch (error) {
      raw = target.type === 'story' ? treeProvider.findStoryRaw(target.id) : treeProvider.findTaskRaw(target.id);
      if (!raw) {
        vscode.window.showErrorMessage(`无法获取${target.type === 'story' ? '需求' : '任务'} #${target.id} 的详情：${errorMessage(error)}`);
        return;
      }
    }
    const detail = toDetailViewModel(target.type, raw);
    const baseUrl = clientConfig?.baseUrl ?? readConnectionConfig(getWorkspaceConfig()).baseUrl;
    rewriteDetailImageUrls(detail, baseUrl, await credentials.getAdminToken(baseUrl));
    if (!detailPanel) {
      const attachmentService = new AttachmentService(getClient);
      detailPanel = new DetailPanel(context.extensionUri, attachmentService, async (linkedType, linkedId) => {
        await openDetail(linkedType, linkedId);
      });
    }
    detailPanel.show(detail);
  }

  async function setTreeFilter(): Promise<void> {
    const value = await vscode.window.showInputBox({
      prompt: '输入 ID/标题/名称/指派给筛选关键词，多个关键词以空格分隔',
      ignoreFocusOut: true
    });
    if (value === undefined) {
      return;
    }
    treeProvider.setTreeFilter(value);
  }

  async function setTreeSort(): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: '状态优先，其次优先级', mode: 'statusThenPriority' as TreeSortMode },
      { label: '优先级优先，其次状态', mode: 'priorityThenStatus' as TreeSortMode },
      { label: '原始顺序', mode: 'sourceOrder' as TreeSortMode }
    ], { ignoreFocusOut: true, placeHolder: '选择禅道树排序方式' });
    if (selected) {
      treeProvider.setTreeSortMode(selected.mode);
    }
  }

  async function openExternal(node: unknown): Promise<void> {
    await initializeConfiguration;
    const target = getNodeTarget(node);
    if (!target) {
      vscode.window.showWarningMessage('无法识别要打开的禅道条目。');
      return;
    }

    try {
      const { baseUrl } = readConnectionConfig(getWorkspaceConfig());
      const page = target.type === 'story' ? `story-view-${target.id}.html` : `task-view-${target.id}.html`;
      await vscode.env.openExternal(vscode.Uri.parse(new URL(page, classicPageBaseUrl(baseUrl)).toString()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(message);
    }
  }

  async function reselectCurrentProject(): Promise<void> {
    await initializeConfiguration;
    // 重新选择项目使用个人客户端拉取项目列表，加载数据使用管理员客户端。
    const result = await reselectProject({
      client: getPersonalClient(),
      configuration: getWritableConfig(),
      window: vscode.window,
      loadProjectData: (projectId) => loadProjectData(getAdminClient(), projectId)
    });

    if (result.status !== 'selected') {
      return;
    }

    treeProvider.setState(result.data);
    detailPanel?.close();
    detailPanel = undefined;
    currentDetailTarget = undefined;
  }

  context.subscriptions.push(
    output,
    treeView,
    vscode.commands.registerCommand('zentao.reconnect', reconnect),
    vscode.commands.registerCommand('zentao.refresh', refresh),
    vscode.commands.registerCommand('zentao.reselectProject', reselectCurrentProject),
    vscode.commands.registerCommand('zentao.setTreeFilter', setTreeFilter),
    vscode.commands.registerCommand('zentao.clearTreeFilter', () => treeProvider.clearTreeFilter()),
    vscode.commands.registerCommand('zentao.setTreeSort', setTreeSort),
    vscode.commands.registerCommand('zentao.openRequestLog', () => logger.show()),
    vscode.commands.registerCommand('zentao.openDetail', openDetail),
    vscode.commands.registerCommand('zentao.copyId', async (node: unknown) => {
      const target = getNodeTarget(node);
      if (target) {
        await vscode.env.clipboard.writeText(String(target.id));
      }
    }),
    vscode.commands.registerCommand('zentao.openExternal', openExternal)
  );

  void refresh();
}

export function deactivate(): void {}
