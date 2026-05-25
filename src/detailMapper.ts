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

function numberValue(value: unknown): number | undefined {
  const raw = stringValue(value).trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateTimeValue(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw || raw === '0000-00-00' || raw === '0000-00-00 00:00:00') {
    return '';
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!match) {
    return raw;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (hour === undefined || minute === undefined) {
    return date;
  }
  return `${date} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${(second ?? '0').padStart(2, '0')}`;
}

function displayDateFirst(raw: AnyRecord, keys: string[]): string {
  return displayValue(dateTimeValue(firstValue(raw, keys)));
}

function displayHoursFirst(raw: AnyRecord, keys: string[]): string {
  const value = displayFirst(raw, keys);
  if (value === emptyValue || /(?:\d)\s*(?:h|H|工时|小时)\b/.test(value) || /(?:工时|小时)$/.test(value)) {
    return value;
  }
  return `${value}h`;
}

function displayProgress(raw: AnyRecord): string {
  const value = displayFirst(raw, ['progress']);
  if (value === emptyValue || value.includes('%')) {
    return value;
  }
  return `${value}%`;
}

function displayAttachmentSize(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw) {
    return '';
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
  if (!match) {
    return raw;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) {
    return raw;
  }
  if (!unit || unit === 'b' || unit === 'byte' || unit === 'bytes') {
    return `${formatNumber(amount / 1024)}K`;
  }
  if (unit === 'k' || unit === 'kb') {
    return `${formatNumber(amount)}K`;
  }
  if (unit === 'm' || unit === 'mb') {
    return `${formatNumber(amount)}M`;
  }
  return raw;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
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
  const date = dateTimeValue(firstValue(raw, dateKeys));
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

function field(label: string, value: string, extra: Partial<BasicField> = {}): BasicField {
  return { label, value, ...extra };
}

function objectId(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null) {
    return numberValue(asRecord(value).id ?? asRecord(value).ID);
  }
  return numberValue(value);
}

function relatedStoryField(raw: AnyRecord): BasicField {
  const storyRecord = asRecord(raw.story);
  const id = numberValue(raw.storyID ?? raw.storyId ?? storyRecord.id ?? storyRecord.ID);
  const title = displayValue(raw.storyTitle ?? raw.storyName ?? storyRecord.title ?? storyRecord.name ?? raw.story);
  return id ? field('相关研发需求', title, { linkType: 'story', linkId: id }) : field('相关研发需求', title);
}

function linkedTaskField(raw: AnyRecord): BasicField {
  const links = [...asArray(raw.tasks), ...asArray(raw.linkedTasks), ...asArray(raw.children)]
    .map((item) => {
      const task = asRecord(item);
      const id = objectId(task.id ?? task.ID ?? item);
      const text = stringValue(task.name ?? task.title ?? (id ? `#${id}` : ''));
      return id && text ? { type: 'task' as ZenTaoItemType, id, text } : undefined;
    })
    .filter((item): item is { type: ZenTaoItemType; id: number; text: string } => Boolean(item));
  return links.length ? field('关联任务', links.map((link) => link.text).join('、'), { links }) : field('关联任务', emptyValue);
}

function storyBasicFieldGroups(raw: AnyRecord): BasicFieldGroup[] {
  return [
    {
      fields: [
        field('由谁创建', withDate(raw, ['openedBy', 'createdBy'], ['openedDate', 'createdDate'])),
        field('指派给', withDate(raw, ['assignedToRealName', 'assignedTo'], ['assignedDate'])),
        field('评审人员', displayFirst(raw, ['reviewedBy', 'reviewer'])),
        field('评审时间', displayDateFirst(raw, ['reviewedDate', 'reviewDate'])),
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
        field('预计工时', displayHoursFirst(raw, ['estimate', 'estimatedHours'])),
        field('关键词', displayFirst(raw, ['keywords', 'keywordsText'])),
        field('抄送给', displayFirst(raw, ['mailto', 'mailTo', 'cc'])),
        linkedTaskField(raw)
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
        relatedStoryField(raw),
        field('指派给', assignedTo(raw)),
        field('任务模式', displayFirst(raw, ['mode'])),
        field('任务类型', displayFirst(raw, ['type'])),
        field('任务状态', displayFirst(raw, ['status'])),
        field('进度', displayProgress(raw)),
        field('优先级', priority(firstValue(raw, ['pri', 'priority']))),
        field('抄送给', displayFirst(raw, ['mailto', 'mailTo', 'cc']))
      ]
    },
    {
      fields: [
        field('最初预计', displayHoursFirst(raw, ['estimate', 'estimatedHours'])),
        field('总计消耗', displayHoursFirst(raw, ['consumed'])),
        field('预计剩余', displayHoursFirst(raw, ['left', 'remain', 'remaining'])),
        field('预计开始', displayDateFirst(raw, ['estStarted', 'estimateStarted'])),
        field('实际开始', displayDateFirst(raw, ['realStarted', 'startedDate'])),
        field('截止日期', displayDateFirst(raw, ['deadline', 'dueDate']))
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
      size: displayAttachmentSize(file.size),
      addedDate: dateTimeValue(file.addedDate ?? file.addedTime ?? file.date ?? file.openedDate) || '未知',
      url: stringValue(file.url ?? file.webUrl ?? file.downloadUrl, ''),
      extension: stringValue(file.extension ?? file.ext, ''),
      mimeType: stringValue(file.type ?? file.mimeType ?? file.contentType, ''),
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
