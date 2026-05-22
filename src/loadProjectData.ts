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

function addProductId(value: unknown, ids: Set<number>): void {
  if (value === null || value === undefined || value === '') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      addProductId(item, ids);
    }
    return;
  }
  if (typeof value === 'object') {
    const record = asRecord(value);
    const directId = record.id ?? record.product ?? record.productID ?? record.productId;
    if (directId !== undefined) {
      addProductId(directId, ids);
      return;
    }
    for (const item of Object.values(record)) {
      addProductId(item, ids);
    }
    return;
  }
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) {
    ids.add(id);
  }
}

function collectProductIds(records: AnyRecord[]): number[] {
  const ids = new Set<number>();
  for (const record of records) {
    addProductId(record.products, ids);
    addProductId(record.product, ids);
    addProductId(record.productID, ids);
    addProductId(record.productId, ids);
  }
  return [...ids];
}

function mapStories(storiesRaw: unknown[]): StoryListItem[] {
  const storiesById = new Map<number, StoryListItem>();
  for (const item of storiesRaw) {
    const story = asRecord(item);
    const id = Number(story.id);
    if (!Number.isFinite(id) || storiesById.has(id)) {
      continue;
    }
    storiesById.set(id, {
      id,
      title: stringValue(story.title, `需求 #${story.id}`),
      priority: priority(story.pri),
      status: stringValue(story.status, '-'),
      raw: story
    });
  }
  return [...storiesById.values()];
}

export async function loadProjectData(client: ZenTaoClient, projectId: number): Promise<TreeDataState> {
  let projectRaw: AnyRecord;
  try {
    projectRaw = asRecord(await client.getProject(projectId));
  } catch (error) {
    projectRaw = { id: projectId, name: `项目 #${projectId}`, error: error instanceof Error ? error.message : String(error) };
  }
  const project: ProjectInfo = {
    id: Number(projectRaw.id ?? projectId),
    name: stringValue(projectRaw.name, `项目 #${projectId}`),
    raw: projectRaw
  };

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
  const taskRawRecords: AnyRecord[] = [];
  let partialTaskFailure = false;
  for (const result of taskResults) {
    if (result.status === 'rejected') {
      partialTaskFailure = true;
      continue;
    }
    for (const item of asArray(result.value.response, 'tasks')) {
      const task = asRecord(item);
      taskRawRecords.push(task);
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

  const productIds = collectProductIds([
    projectRaw,
    ...executions.map((execution) => asRecord(execution.raw)),
    ...taskRawRecords
  ]);
  const storyResults = await Promise.allSettled(productIds.map(async (productId) => client.getProductStories(productId)));
  const storyRawItems = storyResults.flatMap((result) => result.status === 'fulfilled' ? asArray(result.value, 'stories') : []);
  const stories = mapStories(storyRawItems);

  return { project, stories, tasks, partialTaskFailure };
}
