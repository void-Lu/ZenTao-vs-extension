import { StoryListItem, TaskListItem, TreeDataState } from './types';

export type TreeSortMode = 'statusThenPriority' | 'priorityThenStatus' | 'sourceOrder';

export interface TreeTransformOptions {
  sortMode: TreeSortMode;
  filterText: string;
}

const UNKNOWN_RANK = Number.MAX_SAFE_INTEGER;

const storyStatusRanks = new Map([
  ['active', 1],
  ['changed', 2],
  ['changing', 2],
  ['draft', 3],
  ['closed', 4]
]);

const taskStatusRanks = new Map([
  ['doing', 1],
  ['wait', 2],
  ['pause', 3],
  ['done', 4],
  ['closed', 5],
  ['cancel', 6],
  ['cancelled', 6]
]);

const priorityRanks = new Map([
  ['p1', 1],
  ['1', 1],
  ['high', 1],
  ['p2', 2],
  ['2', 2],
  ['medium', 2],
  ['p3', 3],
  ['3', 3],
  ['normal', 3],
  ['p4', 4],
  ['4', 4],
  ['low', 4]
]);

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function priorityRank(priority: string): number {
  return priorityRanks.get(normalized(priority)) ?? UNKNOWN_RANK;
}

function statusRank(status: string, ranks: Map<string, number>): number {
  return ranks.get(normalized(status)) ?? UNKNOWN_RANK;
}

function tokenize(filterText: string): string[] {
  return filterText.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) {
        return true;
      }
    }
  }
  return needle.length === 0;
}

function matchesToken(token: string, fields: string[]): boolean {
  return fields.some((field) => {
    const haystack = field.toLowerCase();
    return haystack.includes(token) || isSubsequence(token, haystack);
  });
}

function matchesAllTokens(tokens: string[], fields: string[]): boolean {
  return tokens.every((token) => matchesToken(token, fields));
}

function compareRanked<T>(
  left: { item: T; index: number },
  right: { item: T; index: number },
  rankers: Array<(item: T) => number>
): number {
  for (const ranker of rankers) {
    const diff = ranker(left.item) - ranker(right.item);
    if (diff !== 0) {
      return diff;
    }
  }
  return left.index - right.index;
}

function sortItems<T>(items: T[], rankers: Array<(item: T) => number>): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareRanked(left, right, rankers))
    .map(({ item }) => item);
}

function sortStories(stories: StoryListItem[], mode: TreeSortMode): StoryListItem[] {
  if (mode === 'sourceOrder') {
    return [...stories];
  }

  const status = (story: StoryListItem) => statusRank(story.status, storyStatusRanks);
  const priority = (story: StoryListItem) => priorityRank(story.priority);
  return sortItems(stories, mode === 'statusThenPriority' ? [status, priority] : [priority, status]);
}

function sortTasks(tasks: TaskListItem[], mode: TreeSortMode): TaskListItem[] {
  if (mode === 'sourceOrder') {
    return [...tasks];
  }

  const status = (task: TaskListItem) => statusRank(task.status, taskStatusRanks);
  const priority = (task: TaskListItem) => priorityRank(task.priority);
  return sortItems(tasks, mode === 'statusThenPriority' ? [status, priority] : [priority, status]);
}

export function transformTreeData(state: TreeDataState, options: TreeTransformOptions): TreeDataState {
  const tokens = tokenize(options.filterText);
  const stories = tokens.length === 0
    ? state.stories
    : state.stories.filter((story) => matchesAllTokens(tokens, [String(story.id), story.title, story.assignedTo ?? '']));
  const tasks = tokens.length === 0
    ? state.tasks
    : state.tasks.filter((task) => matchesAllTokens(tokens, [String(task.id), task.name, task.assignedTo ?? '']));

  return {
    ...state,
    stories: sortStories(stories, options.sortMode),
    tasks: sortTasks(tasks, options.sortMode)
  };
}
