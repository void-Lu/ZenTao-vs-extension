import { TreeDataState } from './types';

export interface ProjectQuickPickItem {
  label: string;
  description: string;
  projectId: number;
}

export class ProjectListUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ProjectListUnavailableError.prototype);
  }
}

export interface ProjectSelectionClient {
  getProjects(): Promise<unknown>;
}

export interface ProjectSelectionConfiguration {
  update(key: string, value: unknown, target: unknown): Thenable<void>;
  getProjectTarget?(): unknown;
  getGlobalTarget?(): unknown;
}

export interface ProjectSelectionWindow {
  showQuickPick(items: ProjectQuickPickItem[], options: { ignoreFocusOut: boolean; placeHolder: string }): Thenable<ProjectQuickPickItem | undefined>;
  showInputBox(options: { prompt: string; ignoreFocusOut: boolean }): Thenable<string | undefined>;
  showWarningMessage(message: string): Thenable<unknown>;
}

export interface EnsureProjectIdOptions {
  existingProjectId: number | undefined;
  forceSelection?: boolean;
  client: ProjectSelectionClient;
  configuration: ProjectSelectionConfiguration;
  window: ProjectSelectionWindow;
}

export type ProjectReselectResult =
  | { status: 'selected'; projectId: number; data: TreeDataState }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'empty' }
  | { status: 'write-failed' }
  | { status: 'load-failure' };

export interface ReselectProjectOptions {
  client: ProjectSelectionClient;
  configuration: ProjectSelectionConfiguration;
  window: ProjectSelectionWindow;
  loadProjectData(projectId: number): Promise<TreeDataState>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
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

export function mapProjectQuickPickItems(response: unknown): ProjectQuickPickItem[] {
  return asArray(response, 'projects').flatMap((item) => {
    const project = asRecord(item);
    const id = Number(project.id);
    if (!Number.isInteger(id) || id <= 0) {
      return [];
    }
    const name = project.name ? String(project.name) : `项目 #${id}`;
    return [{ label: name, description: `#${id}`, projectId: id }];
  });
}

export function parseManualProjectId(value: string | undefined): number | undefined {
  const projectId = Number(value?.trim());
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined;
}

export async function reselectProject(options: ReselectProjectOptions): Promise<ProjectReselectResult> {
  let items: ProjectQuickPickItem[];
  try {
    items = mapProjectQuickPickItems(await options.client.getProjects());
  } catch {
    await options.window.showWarningMessage('无法获取禅道项目列表。');
    return { status: 'unavailable' };
  }

  if (items.length === 0) {
    await options.window.showWarningMessage('没有可选择的禅道项目。');
    return { status: 'empty' };
  }

  const selected = await options.window.showQuickPick(items, { ignoreFocusOut: true, placeHolder: '重新选择禅道项目' });
  if (!selected) {
    return { status: 'cancelled' };
  }

  let data: TreeDataState;
  try {
    data = await options.loadProjectData(selected.projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await options.window.showWarningMessage(message);
    return { status: 'load-failure' };
  }

  try {
    await options.configuration.update('projectId', selected.projectId, options.configuration.getProjectTarget?.() ?? false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await options.window.showWarningMessage(message);
    return { status: 'write-failed' };
  }

  return { status: 'selected', projectId: selected.projectId, data };
}

export async function ensureProjectId(options: EnsureProjectIdOptions): Promise<number | undefined> {
  if (options.existingProjectId !== undefined && !options.forceSelection) {
    return options.existingProjectId;
  }

  let items: ProjectQuickPickItem[];
  try {
    items = mapProjectQuickPickItems(await options.client.getProjects());
  } catch {
    await options.window.showWarningMessage('无法获取禅道项目列表。');
    throw new ProjectListUnavailableError('Project list is unavailable.');
  }

  if (items.length === 0) {
    await options.window.showWarningMessage('没有可选择的禅道项目。');
    throw new ProjectListUnavailableError('Project list is empty.');
  }

  const selected = await options.window.showQuickPick(items, { ignoreFocusOut: true, placeHolder: '选择禅道项目' });
  if (selected) {
    await options.configuration.update('projectId', selected.projectId, options.configuration.getProjectTarget?.() ?? false);
    return selected.projectId;
  }

  return options.existingProjectId;
}
