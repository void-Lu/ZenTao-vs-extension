import * as vscode from 'vscode';
import { transformTreeData, TreeSortMode } from './treeTransform';
import { ProjectInfo, StoryListItem, TaskListItem, TreeDataState } from './types';

export type ZenTaoTreeNode =
  | { kind: 'message'; label: string }
  | { kind: 'project'; project: ProjectInfo }
  | { kind: 'storyGroup'; stories: StoryListItem[] }
  | { kind: 'taskGroup'; tasks: TaskListItem[]; partialFailure: boolean }
  | { kind: 'story'; story: StoryListItem }
  | { kind: 'task'; task: TaskListItem };

export class ZenTaoTreeProvider implements vscode.TreeDataProvider<ZenTaoTreeNode> {
  private readonly changed = new vscode.EventEmitter<ZenTaoTreeNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private state: TreeDataState = { stories: [], tasks: [], partialTaskFailure: false, message: '未加载禅道数据' };
  private sortMode: TreeSortMode = 'statusThenPriority';
  private filterText = '';

  setState(state: TreeDataState): void {
    this.state = state;
    this.changed.fire(undefined);
  }

  setTreeSortMode(sortMode: TreeSortMode): void {
    this.sortMode = sortMode;
    this.changed.fire(undefined);
  }

  setTreeFilter(filterText: string): void {
    this.filterText = filterText;
    this.changed.fire(undefined);
  }

  clearTreeFilter(): void {
    this.setTreeFilter('');
  }

  getTreeItem(element: ZenTaoTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'message':
        return new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      case 'project': {
        const item = new vscode.TreeItem(element.project.name, vscode.TreeItemCollapsibleState.Expanded);
        item.description = `项目号 #${element.project.id}`;
        item.contextValue = 'project';
        return item;
      }
      case 'storyGroup': {
        const item = new vscode.TreeItem('需求', vscode.TreeItemCollapsibleState.Expanded);
        item.description = `共 ${element.stories.length} 条`;
        item.contextValue = 'storyGroup';
        return item;
      }
      case 'taskGroup': {
        const item = new vscode.TreeItem('任务', vscode.TreeItemCollapsibleState.Expanded);
        item.description = element.partialFailure ? `共 ${element.tasks.length} 条，部分失败` : `共 ${element.tasks.length} 条`;
        item.contextValue = 'taskGroup';
        return item;
      }
      case 'story': {
        const item = new vscode.TreeItem(`#${element.story.id} ${element.story.title}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${element.story.priority} ${element.story.status}`;
        item.contextValue = 'story';
        item.command = { command: 'zentao.openDetail', title: '打开禅道详情', arguments: ['story', element.story.id] };
        return item;
      }
      case 'task': {
        const item = new vscode.TreeItem(`#${element.task.id} ${element.task.name}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${element.task.priority} ${element.task.status}`;
        item.contextValue = 'task';
        item.command = { command: 'zentao.openDetail', title: '打开禅道详情', arguments: ['task', element.task.id] };
        return item;
      }
    }
  }

  getChildren(element?: ZenTaoTreeNode): vscode.ProviderResult<ZenTaoTreeNode[]> {
    const visibleState = transformTreeData(this.state, { sortMode: this.sortMode, filterText: this.filterText });

    if (!element) {
      if (!visibleState.project) {
        return [{ kind: 'message', label: visibleState.message ?? '未配置禅道项目' }];
      }
      return [{ kind: 'project', project: visibleState.project }];
    }

    if (element.kind === 'project') {
      return [
        { kind: 'storyGroup', stories: visibleState.stories },
        { kind: 'taskGroup', tasks: visibleState.tasks, partialFailure: visibleState.partialTaskFailure }
      ];
    }

    if (element.kind === 'storyGroup') {
      return element.stories.map((story) => ({ kind: 'story', story }));
    }

    if (element.kind === 'taskGroup') {
      return element.tasks.map((task) => ({ kind: 'task', task }));
    }

    return [];
  }
}
