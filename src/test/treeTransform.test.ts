import { describe, expect, it } from 'vitest';
import { transformTreeData, TreeSortMode } from '../treeTransform';
import { TreeDataState } from '../types';

function state(): TreeDataState {
  return {
    project: { id: 1, name: 'Alpha', raw: {} },
    stories: [
      { id: 3, title: 'Closed low story', priority: 'P4', status: 'closed', raw: {} },
      { id: 1, title: 'Active high story', priority: 'P1', status: 'active', raw: {} },
      { id: 2, title: 'Changed medium story', priority: 'medium', status: 'changed', raw: {} },
      { id: 4, title: 'Unknown story', priority: '', status: 'mystery', raw: {} }
    ],
    tasks: [
      { id: 30, name: 'Closed low task', priority: 'low', status: 'closed', raw: {} },
      { id: 10, name: 'Doing high task', priority: '1', status: 'doing', raw: {} },
      { id: 20, name: 'Waiting medium task', priority: 'P2', status: 'wait', raw: {} },
      { id: 40, name: 'Unknown task', priority: '', status: 'unknown', raw: {} }
    ],
    partialTaskFailure: false
  };
}

function orderedIds(mode: TreeSortMode) {
  const transformed = transformTreeData(state(), { sortMode: mode, filterText: '' });
  return {
    stories: transformed.stories.map((story) => story.id),
    tasks: transformed.tasks.map((task) => task.id)
  };
}

describe('transformTreeData', () => {
  it('keeps story and task source order in sourceOrder mode', () => {
    expect(orderedIds('sourceOrder')).toEqual({
      stories: [3, 1, 2, 4],
      tasks: [30, 10, 20, 40]
    });
  });

  it('sorts stories and tasks by status before priority by default', () => {
    expect(orderedIds('statusThenPriority')).toEqual({
      stories: [1, 2, 3, 4],
      tasks: [10, 20, 30, 40]
    });
  });

  it('sorts stories and tasks by priority before status when requested', () => {
    expect(orderedIds('priorityThenStatus')).toEqual({
      stories: [1, 2, 3, 4],
      tasks: [10, 20, 30, 40]
    });
  });

  it('treats P1-P4, numbers, and priority words as equivalent ranks', () => {
    const transformed = transformTreeData({
      ...state(),
      stories: [
        { id: 1, title: 'normal', priority: 'normal', status: 'active', raw: {} },
        { id: 2, title: 'P2', priority: 'P2', status: 'active', raw: {} },
        { id: 3, title: 'high', priority: 'high', status: 'active', raw: {} },
        { id: 4, title: '4', priority: '4', status: 'active', raw: {} },
        { id: 5, title: 'unknown', priority: 'later', status: 'active', raw: {} }
      ],
      tasks: [
        { id: 11, name: 'P3', priority: 'P3', status: 'doing', raw: {} },
        { id: 12, name: '2', priority: '2', status: 'doing', raw: {} },
        { id: 13, name: 'P1', priority: 'P1', status: 'doing', raw: {} },
        { id: 14, name: 'low', priority: 'low', status: 'doing', raw: {} },
        { id: 15, name: 'unknown', priority: '', status: 'doing', raw: {} }
      ]
    }, { sortMode: 'priorityThenStatus', filterText: '' });

    expect(transformed.stories.map((story) => story.id)).toEqual([3, 2, 1, 4, 5]);
    expect(transformed.tasks.map((task) => task.id)).toEqual([13, 12, 11, 14, 15]);
  });

  it('keeps unknown status and priority stable at the end', () => {
    const transformed = transformTreeData({
      ...state(),
      stories: [
        { id: 1, title: 'known', priority: 'P1', status: 'active', raw: {} },
        { id: 2, title: 'unknown a', priority: '', status: 'unknown', raw: {} },
        { id: 3, title: 'unknown b', priority: '', status: 'unknown', raw: {} }
      ],
      tasks: [
        { id: 10, name: 'known', priority: 'P1', status: 'doing', raw: {} },
        { id: 20, name: 'unknown a', priority: '', status: 'unknown', raw: {} },
        { id: 30, name: 'unknown b', priority: '', status: 'unknown', raw: {} }
      ]
    }, { sortMode: 'statusThenPriority', filterText: '' });

    expect(transformed.stories.map((story) => story.id)).toEqual([1, 2, 3]);
    expect(transformed.tasks.map((task) => task.id)).toEqual([10, 20, 30]);
  });

  it('filters story id/title and task id/name by case-insensitive substring', () => {
    const transformed = transformTreeData(state(), { sortMode: 'sourceOrder', filterText: 'high' });

    expect(transformed.stories.map((story) => story.id)).toEqual([1]);
    expect(transformed.tasks.map((task) => task.id)).toEqual([10]);
  });

  it('filters stories and tasks by assignee', () => {
    const transformed = transformTreeData({
      ...state(),
      stories: [
        { id: 1, title: 'Mine story', priority: 'P1', status: 'active', assignedTo: 'amy.sun', raw: {} } as any,
        { id: 2, title: 'Other story', priority: 'P1', status: 'active', assignedTo: 'bob.li', raw: {} } as any
      ],
      tasks: [
        { id: 10, name: 'Mine task', priority: 'P1', status: 'doing', assignedTo: 'Amy Sun', raw: {} } as any,
        { id: 20, name: 'Other task', priority: 'P1', status: 'doing', assignedTo: 'bob.li', raw: {} } as any
      ]
    }, { sortMode: 'sourceOrder', filterText: 'amy' });

    expect(transformed.stories.map((story) => story.id)).toEqual([1]);
    expect(transformed.tasks.map((task) => task.id)).toEqual([10]);
  });

  it('filters by case-insensitive subsequence', () => {
    const transformed = transformTreeData(state(), { sortMode: 'sourceOrder', filterText: 'ctv' });

    expect(transformed.stories.map((story) => story.id)).toEqual([1]);
    expect(transformed.tasks.map((task) => task.id)).toEqual([]);
  });

  it('requires every filter token to match at least one allowed field', () => {
    const transformed = transformTreeData(state(), { sortMode: 'sourceOrder', filterText: 'active 1' });

    expect(transformed.stories.map((story) => story.id)).toEqual([1]);
    expect(transformed.tasks.map((task) => task.id)).toEqual([]);
  });

  it('does not match story-only fields on tasks or task-only fields on stories', () => {
    const transformed = transformTreeData({
      ...state(),
      stories: [{ id: 1, title: 'Alpha story', priority: 'P1', status: 'active', raw: { name: 'Hidden Task Name' } }],
      tasks: [{ id: 2, name: 'Alpha task', priority: 'P1', status: 'doing', raw: { title: 'Hidden Story Title' } }]
    }, { sortMode: 'sourceOrder', filterText: 'hidden' });

    expect(transformed.stories).toEqual([]);
    expect(transformed.tasks).toEqual([]);
  });

  it('does not mutate the loaded data arrays', () => {
    const loaded = state();
    const originalStories = [...loaded.stories];
    const originalTasks = [...loaded.tasks];

    transformTreeData(loaded, { sortMode: 'statusThenPriority', filterText: 'high' });

    expect(loaded.stories).toEqual(originalStories);
    expect(loaded.tasks).toEqual(originalTasks);
  });
});
