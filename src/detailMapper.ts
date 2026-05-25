import { ActivityViewModel, AttachmentViewModel, BasicField, BasicFieldGroup, DetailContentSection, DetailViewModel, ZenTaoItemType } from './types';
import { escapeHtml, sanitizeRichHtml } from './html';
import { redactSensitiveText } from './requestLogger';

type AnyRecord = Record<string, unknown>;
const sensitiveRawJsonKeys = new Set(['token', 'password', 'cookie']);
const emptyValue = '暂无';

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? value as AnyRecord : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>);
  }
  return [];
}

function stringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    const record = asRecord(value);
    return stringValue(record.realname ?? record.name ?? record.account ?? record.id, fallback);
  }
  return String(value);
}

function displayValue(value: unknown): string {
  return stringValue(value, emptyValue);
}

function firstValue(raw: AnyRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      return raw[key];
    }
  }
  return undefined;
}

function displayFirst(raw: AnyRecord, keys: string[]): string {
  return displayValue(firstValue(raw, keys));
}

function displayTeamAccounts(value: unknown): string {
  const members = asArray(value)
    .map((member) => stringValue(asRecord(member).account))
    .filter(Boolean);
  return members.length ? members.join(', ') : emptyValue;
}

function assignedTo(raw: AnyRecord): string {
  if (stringValue(raw.mode).toLowerCase() === 'multi') {
    return displayTeamAccounts(raw.team);
  }
  return displayFirst(raw, ['assignedToRealName', 'assignedTo']);
}

function withDate(raw: AnyRecord, nameKeys: string[], dateKeys: string[]): string {
  const name = stringValue(firstValue(raw, nameKeys));
  const date = stringValue(firstValue(raw, dateKeys));
  if (name && date) {
    return `${name} 于 ${date}`;
  }
  return name || date || emptyValue;
}

function priority(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) {
    return emptyValue;
  }
  const normalized = raw.replace(/^P/i, '');
  const circled: Record<string, string> = { '1': '①', '2': '②', '3': '③', '4': '④' };
  return circled[normalized] ?? raw;
}

function field(label: string, value: string): BasicField {
  return { label, value };
}

function storyBasicFieldGroups(raw: AnyRecord): BasicFieldGroup[] {
  return [
    {
      fields: [
        field('由谁创建', withDate(raw, ['openedBy', 'createdBy'], ['openedDate', 'createdDate'])),
        field('指派给', withDate(raw, ['assignedToRealName', 'assignedTo'], ['assignedDate'])),
        field('评审人员', displayFirst(raw, ['reviewedBy', 'reviewer'])),
        field('评审时间', displayFirst(raw, ['reviewedDate', 'reviewDate'])),
        field('由谁关闭', withDate(raw, ['closedBy'], ['closedDate'])),
        field('关闭原因', displayFirst(raw, ['closedReason', 'closeReason'])),
        field('最后修改', withDate(raw, ['lastEditedBy', 'editedBy'], ['lastEditedDate', 'editedDate']))
      ]
    },
    {
      fields: [
        field('当前状态', displayFirst(raw, ['status'])),
        field('所处阶段', displayFirst(raw, ['stage'])),
        field('类别', displayFirst(raw, ['category', 'type'])),
        field('优先级', priority(firstValue(raw, ['pri', 'priority']))),
        field('预计工时', displayFirst(raw, ['estimate', 'estimatedHours'])),
        field('关键词', displayFirst(raw, ['keywords', 'keywordsText'])),
        field('抄送给', displayFirst(raw, ['mailto', 'mailTo', 'cc']))
      ]
    }
  ];
}

function taskBasicFieldGroups(raw: AnyRecord): BasicFieldGroup[] {
  return [
    {
      fields: [
        field('所属执行', displayFirst(raw, ['executionName', 'execution'])),
        field('所属模块', displayFirst(raw, ['moduleName', 'module'])),
        field('相关研发需求', displayFirst(raw, ['storyTitle', 'storyName', 'story'])),
        field('指派给', assignedTo(raw)),
        field('任务模式', displayFirst(raw, ['mode'])),
        field('任务类型', displayFirst(raw, ['type'])),
        field('任务状态', displayFirst(raw, ['status'])),
        field('进度', displayFirst(raw, ['progress'])),
        field('优先级', priority(firstValue(raw, ['pri', 'priority']))),
        field('抄送给', displayFirst(raw, ['mailto', 'mailTo', 'cc']))
      ]
    },
    {
      fields: [
        field('最初预计', displayFirst(raw, ['estimate', 'estimatedHours'])),
        field('总计消耗', displayFirst(raw, ['consumed'])),
        field('预计剩余', displayFirst(raw, ['left', 'remain', 'remaining'])),
        field('预计开始', displayFirst(raw, ['estStarted', 'estimateStarted'])),
        field('实际开始', displayFirst(raw, ['realStarted', 'startedDate'])),
        field('截止日期', displayFirst(raw, ['deadline', 'dueDate']))
      ]
    },
    {
      fields: [
        field('由谁创建', withDate(raw, ['openedBy', 'createdBy'], ['openedDate', 'createdDate'])),
        field('由谁完成', withDate(raw, ['finishedBy'], ['finishedDate'])),
        field('由谁取消', withDate(raw, ['canceledBy', 'cancelledBy'], ['canceledDate', 'cancelledDate'])),
        field('由谁关闭', withDate(raw, ['closedBy'], ['closedDate'])),
        field('关闭原因', displayFirst(raw, ['closedReason', 'closeReason'])),
        field('最后编辑', withDate(raw, ['lastEditedBy', 'editedBy'], ['lastEditedDate', 'editedDate']))
      ]
    }
  ];
}

function section(title: string, value: unknown): DetailContentSection {
  const html = sanitizeRichHtml(value);
  return { title, html: html || emptyValue };
}

function contentSections(type: ZenTaoItemType, raw: AnyRecord): DetailContentSection[] {
  if (type === 'story') {
    return [
      section('需求描述', raw.spec ?? raw.desc),
      section('验收标准', raw.verify ?? raw.storyVerify)
    ];
  }

  return [
    section('任务描述', raw.desc),
    section('研发需求描述', raw.storySpec ?? raw.spec),
    section('验收标准', raw.verify ?? raw.storyVerify)
  ];
}

function redactSensitiveRawJsonKey(key: string, value: unknown): unknown {
  return sensitiveRawJsonKeys.has(key.toLowerCase()) ? '[REDACTED]' : value;
}

function extractAttachments(raw: AnyRecord): AttachmentViewModel[] {
  return [...asArray(raw.files), ...asArray(raw.storyFiles)].map((item) => {
    const file = asRecord(item);
    const idValue = Number(file.id ?? file.fileID);
    return {
      id: Number.isFinite(idValue) ? idValue : undefined,
      name: stringValue(file.title ?? file.name ?? file.filename ?? file.pathname, '未命名附件'),
      size: stringValue(file.size, ''),
      addedDate: stringValue(file.addedDate ?? file.addedTime ?? file.date ?? file.openedDate, '未知'),
      url: stringValue(file.url ?? file.webUrl ?? file.downloadUrl, ''),
      raw: file
    };
  });
}

function extractActivities(raw: AnyRecord): ActivityViewModel[] {
  return asArray(raw.actions).map((item) => {
    const action = asRecord(item);
    return {
      date: '',
      actor: '',
      action: '',
      contentHtml: sanitizeRichHtml(action.desc)
    };
  });
}

export function toDetailViewModel(type: ZenTaoItemType, value: unknown): DetailViewModel {
  const raw = asRecord(value);
  const id = Number(raw.id);
  const title = stringValue(type === 'story' ? raw.title : raw.name, `#${id}`);

  return {
    id,
    type,
    title,
    basicFieldGroups: type === 'story' ? storyBasicFieldGroups(raw) : taskBasicFieldGroups(raw),
    contentSections: contentSections(type, raw),
    attachments: extractAttachments(raw),
    activities: extractActivities(raw),
    raw
  };
}

export function escapedJson(value: unknown): string {
  return escapeHtml(redactSensitiveText(JSON.stringify(value, redactSensitiveRawJsonKey, 2)));
}
