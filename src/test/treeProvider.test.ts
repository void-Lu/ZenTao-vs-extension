import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  TreeItem: class {
    constructor(public readonly label: string, public readonly collapsibleState?: unknown) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 }
}));

import { ZenTaoTreeProvider } from '../treeProvider';
import { TreeDataState } from '../types';

function state(): TreeDataState {
  return {
    project: { id: 1, name: 'Alpha', raw: {} },
    stories: [
      { id: 2, title: 'Closed story', priority: 'P4', status: 'closed', raw: {} },
      { id: 1, title: 'Active story', priority: 'P1', status: 'active', raw: {} }
    ],
    tasks: [
      { id: 20, name: 'Closed task', priority: 'P4', status: 'closed', raw: {} },
      { id: 10, name: 'Doing task', priority: 'P1', status: 'doing', raw: {} }
    ],
    partialTaskFailure: false
  };
}

describe('ZenTaoTreeProvider tree transforms', () => {
  it('applies sort and filter to visible children without mutating loaded state', () => {
    const provider = new ZenTaoTreeProvider();
    const loaded = state();
    provider.setState(loaded);

    const [project] = provider.getChildren() as any[];
    const [storyGroup, taskGroup] = provider.getChildren(project) as any[];
    expect((provider.getChildren(storyGroup) as any[]).map((node) => node.story.id)).toEqual([1, 2]);
    expect((provider.getChildren(taskGroup) as any[]).map((node) => node.task.id)).toEqual([10, 20]);

    provider.setTreeSortMode('sourceOrder');
    provider.setTreeFilter('closed');

    const [filteredProject] = provider.getChildren() as any[];
    const [filteredStoryGroup, filteredTaskGroup] = provider.getChildren(filteredProject) as any[];
    expect((provider.getChildren(filteredStoryGroup) as any[]).map((node) => node.story.id)).toEqual([2]);
    expect((provider.getChildren(filteredTaskGroup) as any[]).map((node) => node.task.id)).toEqual([20]);
    expect(loaded.stories.map((story) => story.id)).toEqual([2, 1]);
    expect(loaded.tasks.map((task) => task.id)).toEqual([20, 10]);
  });

  it('clears filter and restores visible nodes for the current project', () => {
    const provider = new ZenTaoTreeProvider();
    provider.setState(state());
    provider.setTreeFilter('closed');
    provider.clearTreeFilter();

    const [project] = provider.getChildren() as any[];
    const [storyGroup, taskGroup] = provider.getChildren(project) as any[];
    expect((provider.getChildren(storyGroup) as any[]).map((node) => node.story.id)).toEqual([1, 2]);
    expect((provider.getChildren(taskGroup) as any[]).map((node) => node.task.id)).toEqual([10, 20]);
  });

  it('shows partial failure in story group description', () => {
    const provider = new ZenTaoTreeProvider();
    provider.setState({ ...state(), partialStoryFailure: true });

    const [project] = provider.getChildren() as any[];
    const [storyGroup] = provider.getChildren(project) as any[];
    const item = provider.getTreeItem(storyGroup) as any;

    expect(item.description).toBe('共 2 条，部分失败');
  });
});
