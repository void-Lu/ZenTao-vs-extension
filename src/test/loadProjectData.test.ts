import { describe, expect, it } from 'vitest';
import { loadProjectData } from '../loadProjectData';
import { ZenTaoClient } from '../zentaoClient';

describe('loadProjectData', () => {
  const delay = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('maps project stories and execution tasks into tree state', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169] }),
      getProjectStories: async () => { throw new Error('project story endpoint should not be used'); },
      getProductStories: async (productId: number) => ({ stories: [{ id: 101, title: `登录优化-${productId}`, pri: 1, status: 'active', assignedToRealName: 'Amy Sun' }] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201, name: '一期', products: [169] }] }),
      getExecutionTasks: async () => ({ tasks: [{ id: 301, name: '前端页面', pri: 2, status: 'doing', assignedTo: 'gino.lu' }] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.project?.name).toBe('企业管理系统');
    expect(state.stories).toMatchObject([{ id: 101, title: '登录优化-169', priority: 'P1', status: 'active', assignedTo: 'Amy Sun' }]);
    expect(state.tasks).toMatchObject([{ id: 301, name: '前端页面', priority: 'P2', status: 'doing', executionId: 201, assignedTo: 'gino.lu' }]);
    expect(state.partialTaskFailure).toBe(false);
  });

  it('maps multi-person task team members into assignee text for tree filtering', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169] }),
      getProjectStories: async () => ({ stories: [] }),
      getProductStories: async () => ({ stories: [] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201, name: '一期', products: [169] }] }),
      getExecutionTasks: async () => ({
        tasks: [{
          id: 301,
          name: '多人任务',
          pri: 2,
          status: 'doing',
          mode: 'multi',
          assignedTo: 'stale.assignee',
          team: [{ realname: 'Neil Tang' }, { account: 'gino.lu' }, { name: 'Will Liu' }]
        }]
      })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.tasks).toMatchObject([{ id: 301, assignedTo: 'Neil Tang, gino.lu, Will Liu' }]);
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

  it('fills empty project story fields from duplicate product stories', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169] }),
      getProjectStories: async () => ({ stories: [{ id: 101, title: '', pri: '', status: '', assignedTo: '' }] }),
      getProductStories: async () => ({ stories: [{ id: 101, title: '登录优化', pri: 1, status: 'active', assignedToRealName: 'Amy Sun' }] }),
      getProjectExecutions: async () => ({ executions: [] }),
      getExecutionTasks: async () => ({ tasks: [] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.stories).toMatchObject([{ id: 101, title: '登录优化', priority: 'P1', status: 'active', assignedTo: 'Amy Sun' }]);
  });

  it('keeps successful tasks when one execution task request fails', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统' }),
      getProjectStories: async () => ({ stories: [] }),
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

  it('marks partial story failure when any story source fails', async () => {
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169] }),
      getProjectStories: async () => { throw new Error('project stories forbidden'); },
      getProductStories: async () => ({ stories: [{ id: 101, title: '登录优化', pri: 1, status: 'active' }] }),
      getProjectExecutions: async () => ({ executions: [] }),
      getExecutionTasks: async () => ({ tasks: [] })
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(state.stories.map((story) => story.id)).toEqual([101]);
    expect(state.partialStoryFailure).toBe(true);
    expect(state.message).toContain('需求列表部分加载失败');
  });

  it('fills missing stories from task story IDs when story list sources fail', async () => {
    const storyRequests: number[] = [];
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统' }),
      getProjectStories: async () => { throw new Error('project stories forbidden'); },
      getProductStories: async () => ({ stories: [] }),
      getProjectExecutions: async () => ({ executions: [{ id: 201 }] }),
      getExecutionTasks: async () => ({ tasks: [{ id: 301, name: '前端页面', pri: 2, status: 'doing', story: 4712 }] }),
      getStory: async (storyId: number) => {
        storyRequests.push(storyId);
        return { id: storyId, title: '任务关联需求', pri: 1, status: 'active', assignedToRealName: 'Amy Sun' };
      }
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(storyRequests).toEqual([4712]);
    expect(state.stories).toMatchObject([{ id: 4712, title: '任务关联需求', priority: 'P1', status: 'active', assignedTo: 'Amy Sun' }]);
    expect(state.partialStoryFailure).toBe(true);
  });

  it('loads execution stories when project and product story sources fail', async () => {
    const executionStoryRequests: number[] = [];
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: [169] }),
      getProjectStories: async () => { throw new Error('project stories forbidden'); },
      getProductStories: async () => { throw new Error('product stories forbidden'); },
      getProjectExecutions: async () => ({ executions: [{ id: 201, name: '一期' }] }),
      getExecutionTasks: async () => ({ tasks: [] }),
      getExecutionStories: async (executionId: number) => {
        executionStoryRequests.push(executionId);
        return { stories: [{ id: 4712, title: '执行关联需求', pri: 1, status: 'active' }] };
      }
    } as unknown as ZenTaoClient;

    const state = await loadProjectData(client, 123);

    expect(executionStoryRequests).toEqual([201]);
    expect(state.stories).toMatchObject([{ id: 4712, title: '执行关联需求', priority: 'P1', status: 'active' }]);
    expect(state.partialStoryFailure).toBe(true);
  });

  it('limits execution task and product story request concurrency', async () => {
    let activeTasks = 0;
    let maxActiveTasks = 0;
    let activeProducts = 0;
    let maxActiveProducts = 0;
    const ids = Array.from({ length: 8 }, (_, index) => index + 1);
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: ids }),
      getProjectStories: async () => ({ stories: [] }),
      getProductStories: async () => {
        activeProducts += 1;
        maxActiveProducts = Math.max(maxActiveProducts, activeProducts);
        await delay();
        activeProducts -= 1;
        return { stories: [] };
      },
      getProjectExecutions: async () => ({ executions: ids.map((id) => ({ id })) }),
      getExecutionTasks: async () => {
        activeTasks += 1;
        maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
        await delay();
        activeTasks -= 1;
        return { tasks: [] };
      }
    } as unknown as ZenTaoClient;

    await loadProjectData(client, 123);

    expect(maxActiveTasks).toBeLessThanOrEqual(5);
    expect(maxActiveProducts).toBeLessThanOrEqual(5);
  });

  it('does not collect nested unrelated numbers as product IDs', async () => {
    const productRequests: number[] = [];
    const client = {
      getProject: async () => ({ id: 123, name: '企业管理系统', products: { metadata: { id: 999 } } }),
      getProjectStories: async () => ({ stories: [] }),
      getProductStories: async (productId: number) => {
        productRequests.push(productId);
        return { stories: [] };
      },
      getProjectExecutions: async () => ({ executions: [] }),
      getExecutionTasks: async () => ({ tasks: [] })
    } as unknown as ZenTaoClient;

    await loadProjectData(client, 123);

    expect(productRequests).toEqual([]);
  });
});
