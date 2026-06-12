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
  assignedTo?: string;
  raw: unknown;
}

export interface TaskListItem {
  id: number;
  name: string;
  priority: string;
  status: string;
  assignedTo?: string;
  executionId?: number;
  raw: unknown;
}

export interface TreeDataState {
  project?: ProjectInfo;
  stories: StoryListItem[];
  tasks: TaskListItem[];
  partialStoryFailure?: boolean;
  partialTaskFailure: boolean;
  message?: string;
}

export interface AttachmentViewModel {
  id?: number;
  name: string;
  size?: string;
  addedDate: string;
  url?: string;
  extension?: string;
  mimeType?: string;
  raw: unknown;
}

export interface ActivityViewModel {
  date: string;
  actor: string;
  action: string;
  contentHtml: string;
}

export interface BasicFieldLink {
  type: ZenTaoItemType;
  id: number;
  text: string;
}

export interface BasicField {
  label: string;
  value: string;
  linkType?: ZenTaoItemType;
  linkId?: number;
  links?: BasicFieldLink[];
}

export interface BasicFieldGroup {
  fields: BasicField[];
}

export interface DetailContentSection {
  title: string;
  html: string;
}

export interface DetailViewModel {
  id: number;
  type: ZenTaoItemType;
  title: string;
  basicFieldGroups: BasicFieldGroup[];
  contentSections: DetailContentSection[];
  attachments: AttachmentViewModel[];
  activities: ActivityViewModel[];
  raw: unknown;
}
