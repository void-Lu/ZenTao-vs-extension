import { ExecutionInfo, ProjectInfo, StoryListItem, TaskListItem, TreeDataState } from './types';
import { ZenTaoClient } from './zentaoClient';

type AnyRecord = Record<string, unknown>;
const REQUEST_CONCURRENCY = 5;

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
  if (typeof value === 'object') {
    const record = asRecord(value);
    return stringValue(record.realname ?? record.name ?? record.account ?? record.id, fallback);
  }
  return String(value);
}

function asValueArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>);
  }
  return [];
}

function assignedTo(raw: AnyRecord): string {
  if (stringValue(raw.mode).toLowerCase() === 'multi') {
    const members = asValueArray(raw.team).map((member) => stringValue(member)).filter(Boolean);
    if (members.length > 0) {
      return members.join(', ');
    }
  }
  return stringValue(raw.assignedToRealName ?? raw.assignedTo);
}

function priority(value: unknown): string {
  const raw = stringValue(value, '-');
  return raw.startsWith('P') ? raw : `P${raw}`;
}

async function settleWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(REQUEST_CONCURRENCY, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));

  return results;
}

function addNumericId(value: unknown, ids: Set<number>): void {
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) {
    ids.add(id);
  }
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
    }
    return;
  }
  addNumericId(value, ids);
}

function addStoryId(value: unknown, ids: Set<number>): void {
  if (value === null || value === undefined || value === '') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      addStoryId(item, ids);
    }
    return;
  }
  if (typeof value === 'object') {
    const record = asRecord(value);
    const directId = record.id ?? record.story ?? record.storyID ?? record.storyId;
    if (directId !== undefined) {
      addStoryId(directId, ids);
    }
    return;
  }
  addNumericId(value, ids);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as AnyRecord).length > 0;
  }
  return true;
}

function mergeStoryRecord(existing: AnyRecord, incoming: AnyRecord): AnyRecord {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (!hasValue(merged[key]) && hasValue(value)) {
      merged[key] = value;
    }
  }
  return merged;
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

function collectStoryIds(records: AnyRecord[]): number[] {
  const ids = new Set<number>();
  for (const record of records) {
    addStoryId(record.story, ids);
    addStoryId(record.storyID, ids);
    addStoryId(record.storyId, ids);
  }
  return [...ids];
}

function mapStories(storiesRaw: unknown[]): StoryListItem[] {
  const storiesById = new Map<number, AnyRecord>();
  for (const item of storiesRaw) {
    const story = asRecord(item);
    const id = Number(story.id);
    if (!Number.isFinite(id)) {
      continue;
    }
    const existing = storiesById.get(id);
    storiesById.set(id, existing ? mergeStoryRecord(existing, story) : story);
  }

  return [...storiesById.values()].map((story) => ({
    id: Number(story.id),
    title: stringValue(story.title, `需求 #${story.id}`),
    priority: priority(story.pri),
    status: stringValue(story.status, '-'),
    assignedTo: assignedTo(story),
    raw: story
  }));
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

  const taskResults = await settleWithConcurrency(executions, async (execution) => ({
    execution,
    response: await client.getExecutionTasks(execution.id)
  }));

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
        assignedTo: assignedTo(task),
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
  const storySourceResults = await settleWithConcurrency([
    { type: 'project' as const, id: projectId },
    ...productIds.map((id) => ({ type: 'product' as const, id })),
    ...executions.map((execution) => ({ type: 'execution' as const, id: execution.id }))
  ], async (source) => {
    if (source.type === 'project') {
      return client.getProjectStories(source.id);
    }
    if (source.type === 'product') {
      return client.getProductStories(source.id);
    }
    return client.getExecutionStories(source.id);
  });
  const [projectStoriesResult, ...remainingStoryResults] = storySourceResults;
  const productStoryResults = remainingStoryResults.slice(0, productIds.length);
  const executionStoryResults = remainingStoryResults.slice(productIds.length);
  const sourceStoryFailure = projectStoriesResult.status === 'rejected'
    || productStoryResults.some((result) => result.status === 'rejected')
    || executionStoryResults.some((result) => result.status === 'rejected');
  const storyRawItems = [
    ...(projectStoriesResult.status === 'fulfilled' ? asArray(projectStoriesResult.value, 'stories') : []),
    ...productStoryResults.flatMap((result) => result.status === 'fulfilled' ? asArray(result.value, 'stories') : []),
    ...executionStoryResults.flatMap((result) => result.status === 'fulfilled' ? asArray(result.value, 'stories') : [])
  ];
  const listedStoryIds = new Set(storyRawItems.map((item) => Number(asRecord(item).id)).filter((id) => Number.isInteger(id) && id > 0));
  const taskStoryIds = collectStoryIds(taskRawRecords);
  const missingTaskStoryIds = sourceStoryFailure || storyRawItems.length === 0
    ? taskStoryIds.filter((storyId) => !listedStoryIds.has(storyId))
    : [];
  const taskStoryResults = await settleWithConcurrency(missingTaskStoryIds, (storyId) => client.getStory(storyId));
  const taskStoryRawItems = taskStoryResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const partialStoryFailure = sourceStoryFailure || taskStoryResults.some((result) => result.status === 'rejected');
  const stories = mapStories([...storyRawItems, ...taskStoryRawItems]);
  const message = partialStoryFailure ? '需求列表部分加载失败，可打开请求日志查看被拒绝或失败的接口。' : undefined;

  return { project, stories, tasks, partialStoryFailure, partialTaskFailure, message };
}
