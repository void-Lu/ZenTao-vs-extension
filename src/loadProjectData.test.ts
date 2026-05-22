import { describe, expect, it } from 'vitest';
import { loadProjectData } from './loadProjectData';
import { ZenTaoClient } from './zentaoClient';

describe('loadProjectData', () => {
  it('maps project stories and execution tasks into tree state', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统' }),
      getProjectStories: async () => ({ stories: [{ id: 101, title: '登录优化', pri: 1, status: 'active' }] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201, name: '一期' }] }),
      getExecutionTasks: async () => ({ tasks: [{ id: 301, name: '前端页面', pri: 2, status: 'doing' }] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.project?.name).toBe('企业管理系统');
    expect(state.stories).toMatchObject([{ id: 101, title: '登录优化', priority: 'P1', status: 'active' }]);
    expect(state.tasks).toMatchObject([{ id: 301, name: '前端页面', priority: 'P2', status: 'doing', executionId: 201 }]);
    expect(state.partialTaskFailure).toBe(false);
  });

  it('keeps successful tasks when one execution task request fails', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统' }),
      getProjectStories: async () => ({ stories: [] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201 }, { id: 202 }] }),
      getExecutionTasks: async (executionId: number) => {
        if (executionId === 202) {
          throw new Error('forbidden');
        }
        return { tasks: [{ id: 301, name: '前端页面', pri: 2, status: 'doing' }] };
      }
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.tasks.map((task) => task.id)).toEqual([301]);
    expect(state.partialTaskFailure).toBe(true);
  });
});
