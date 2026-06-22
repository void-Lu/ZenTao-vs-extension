import { normalizeBaseUrl } from './configuration';
import { ensureProjectId, ProjectListUnavailableError, ProjectSelectionConfiguration, ProjectSelectionWindow } from './projectSelection';

export type ConnectionWizardMode = 'firstTime' | 'reconnect';

export interface ConnectionWizardClient {
  login(account: string, password: string): Promise<string>;
  getProjects(): Promise<unknown>;
}

export interface ConnectionWizardWindow extends ProjectSelectionWindow {
  showInputBox(options: { prompt: string; value?: string; password?: boolean; ignoreFocusOut: boolean }): Thenable<string | undefined>;
}

export interface RunConnectionWizardOptions {
  mode: ConnectionWizardMode;
  currentBaseUrl?: string;
  existingProjectId?: number;
  previousAccount?: string;
  window: ConnectionWizardWindow;
  configuration: ProjectSelectionConfiguration;
  createClient(baseUrl: string): ConnectionWizardClient;
  storeLogin(account: string, password: string, token: string, baseUrl: string): Promise<void>;
}export interface ConnectionWizardResult {
  baseUrl: string;
  projectId: number;
}

async function promptBaseUrl(options: RunConnectionWizardOptions): Promise<string | undefined> {
  while (true) {
    const value = await options.window.showInputBox({
      prompt: '输入禅道 URL',
      value: options.currentBaseUrl,
      ignoreFocusOut: true
    });
    if (!value) {
      return undefined;
    }

    try {
      return normalizeBaseUrl(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await options.window.showWarningMessage(message);
    }
  }
}

async function promptCredentials(options: RunConnectionWizardOptions): Promise<{ account: string; password: string } | undefined> {
  const account = await options.window.showInputBox({
    prompt: '输入禅道用户名',
    value: options.previousAccount,
    ignoreFocusOut: true
  });
  if (!account) {
    return undefined;
  }

  const password = await options.window.showInputBox({
    prompt: '输入禅道密码',
    password: true,
    ignoreFocusOut: true
  });
  if (!password) {
    return undefined;
  }

  return { account, password };
}

export async function runConnectionWizard(options: RunConnectionWizardOptions): Promise<ConnectionWizardResult | undefined> {
  while (true) {
    const baseUrl = options.mode === 'firstTime'
      ? await promptBaseUrl(options)
      : normalizeBaseUrl(options.currentBaseUrl ?? '');
    if (!baseUrl) {
      return undefined;
    }

    while (true) {
      const credentials = await promptCredentials(options);
      if (!credentials) {
        return undefined;
      }

      const client = options.createClient(baseUrl);
      let token: string;
      try {
        token = await client.login(credentials.account, credentials.password);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await options.window.showWarningMessage(message);
        return undefined;
      }

      let stagedProjectId: number | undefined;
      try {
        stagedProjectId = await ensureProjectId({
          existingProjectId: options.mode === 'reconnect' ? options.existingProjectId : undefined,
          forceSelection: options.mode === 'reconnect',
          client,
          configuration: {
            update: async (_key, value) => {
              stagedProjectId = value as number;
            }
          },
          window: options.window
        });
      } catch (error) {
        if (error instanceof ProjectListUnavailableError) {
          if (options.mode === 'firstTime') {
            break;
          }
          continue;
        }
        throw error;
      }

      if (stagedProjectId === undefined) {
        return undefined;
      }

      await options.storeLogin(credentials.account, credentials.password, token, baseUrl);
      if (options.mode === 'firstTime') {
        await options.configuration.update('baseUrl', baseUrl, options.configuration.getGlobalTarget?.() ?? true);
      }
      await options.configuration.update('projectId', stagedProjectId, options.configuration.getProjectTarget?.() ?? false);
      return { baseUrl, projectId: stagedProjectId };
    }
  }
}
