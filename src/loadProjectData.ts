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

export async function loadProjectData(client: ZenTaoClient, projectId: number): Promise<TreeDataState> {
  const projectRaw = asRecord(await client.getProject(projectId));
  const project: ProjectInfo = {
    id: Number(projectRaw.id ?? projectId),
    name: stringValue(projectRaw.name, `项目 #${projectId}`),
    raw: projectRaw
  };

  const storiesRaw = await client.getProjectStories(projectId);
  const stories: StoryListItem[] = asArray(storiesRaw, 'stories').map((item) => {
    const story = asRecord(item);
    return {
      id: Number(story.id),
      title: stringValue(story.title, `需求 #${story.id}`),
      priority: priority(story.pri),
      status: stringValue(story.status, '-'),
      raw: story
    };
  });

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
  let partialTaskFailure = false;
  for (const result of taskResults) {
    if (result.status === 'rejected') {
      partialTaskFailure = true;
      continue;
    }
    for (const item of asArray(result.value.response, 'tasks')) {
      const task = asRecord(item);
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

  return { project, stories, tasks, partialTaskFailure };
}
