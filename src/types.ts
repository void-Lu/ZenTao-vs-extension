export type ZenTaoItemType = 'story' | 'task';

export interface ExtensionConfig {
  baseUrl: string;
  projectId: number;
  requestTimeout: number;
}

export interface ConnectionConfig {
  baseUrl: string;
  requestTimeout: number;
}

export interface ZenTaoCredentials {
  account?: string;
  password?: string;
  token?: string;
}

export interface ProjectInfo {
  id: number;
  name: string;
  raw: unknown;
}

export interface ExecutionInfo {
  id: number;
  name: string;
  raw: unknown;
}

export interface StoryListItem {
  id: number;
  title: string;
  priority: string;
  status: string;
  raw: unknown;
}

export interface TaskListItem {
  id: number;
  name: string;
  priority: string;
  status: string;
  executionId?: number;
  raw: unknown;
}

export interface TreeDataState {
  project?: ProjectInfo;
  stories: StoryListItem[];
  tasks: TaskListItem[];
  partialTaskFailure: boolean;
  message?: string;
}

export interface AttachmentViewModel {
  id?: number;
  name: string;
  size?: string;
  addedDate: string;
  url?: string;
  raw: unknown;
}

export interface ActivityViewModel {
  date: string;
  actor: string;
  action: string;
  commentHtml: string;
  descriptionHtml: string;
}

export interface BasicField {
  label: '项目' | '产品' | '状态' | '优先级' | '指派' | '版本';
  value: string;
}

export interface DetailViewModel {
  id: number;
  type: ZenTaoItemType;
  title: string;
  basicFields: BasicField[];
  descriptionHtml: string;
  acceptanceHtml: string;
  attachments: AttachmentViewModel[];
  activities: ActivityViewModel[];
  raw: unknown;
}
