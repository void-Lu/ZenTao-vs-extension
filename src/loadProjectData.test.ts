import { describe, expect, it } from 'vitest';
import { loadProjectData } from './loadProjectData';
import { ZenTaoClient } from './zentaoClient';

describe('loadProjectData', () => {
  it('maps project stories and execution tasks into tree state', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169] }),
      getProjectStories: async () => { throw new Error('project story endpoint should not be used'); },
      getProductStories: async (productId: number) => ({ stories: [{ id: 101, title: `登录优化-${productId}`, pri: 1, status: 'active' }] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201, name: '一期', products: [169] }] }),
      getExecutionTasks: async () => ({ tasks: [{ id: 301, name: '前端页面', pri: 2, status: 'doing' }] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.project?.name).toBe('企业管理系统');
    expect(state.stories).toMatchObject([{ id: 101, title: '登录优化-169', priority: 'P1', status: 'active' }]);
    expect(state.tasks).toMatchObject([{ id: 301, name: '前端页面', priority: 'P2', status: 'doing', executionId: 201 }]);
    expect(state.partialTaskFailure).toBe(false);
  });

  it('falls back when project detail is denied and derives product stories from executions', async () => {
    const client = {
      getProject: async () => { throw new Error('403'); },
      getProjectStories: async () => { throw new Error('project story endpoint should not be used'); },
      getProductStories: async (productId: number) => ({ stories: [{ id: productId, title: '需求', pri: 1, status: 'active' }] }),
      getProjectExecutions: async () => ({ executions: [{ id: 431, name: '执行', products: [169] }] }),
      getExecutionTasks: async () => ({ tasks: [{ id: 2125, name: '任务', pri: 2, status: 'doing' }] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 423);

    expect(state.project).toMatchObject({ id: 423, name: '项目 #423' });
    expect(state.stories.map((story) => story.id)).toEqual([169]);
    expect(state.tasks.map((task) => task.id)).toEqual([2125]);
  });

  it('derives product stories from task list product fields when executions omit products', async () => {
    const client = {
      getProject: async () => { throw new Error('403'); },
      getProjectStories: async () => { throw new Error('project story endpoint should not be used'); },
      getProductStories: async (productId: number) => ({ stories: [{ id: productId, title: '任务关联需求', pri: 1, status: 'active' }] }),
      getProjectExecutions: async () => ({ executions: [{ id: 431, name: '执行' }] }),
      getExecutionTasks: async () => ({ tasks: [{ id: 2125, name: '任务', pri: 2, status: 'doing', product: 169, story: 4712 }] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 423);

    expect(state.stories.map((story) => story.id)).toEqual([169]);
    expect(state.tasks.map((task) => task.id)).toEqual([2125]);
  });

  it('deduplicates stories returned by multiple product IDs', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169, { id: 170 }] }),
      getProjectStories: async () => { throw new Error('project story endpoint should not be used'); },
      getProductStories: async () => ({ stories: [{ id: 101, title: '登录优化', pri: 1, status: 'active' }] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201, products: [169, 170] }] }),
      getExecutionTasks: async () => ({ tasks: [] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.stories.map((story) => story.id)).toEqual([101]);
  });

  it('keeps successful tasks when one execution task request fails', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统' }),
      getProductStories: async () => ({ stories: [] }),
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
