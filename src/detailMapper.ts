import { AttachmentViewModel, DetailViewModel, ZenTaoItemType, ActivityViewModel } from './types';
import { escapeHtml, sanitizeRichHtml } from './html';
import { redactSensitiveText } from './requestLogger';

type AnyRecord = Record<string, unknown>;

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

function priority(value: unknown): string {
  const raw = stringValue(value, '-');
  return raw.startsWith('P') ? raw : `P${raw}`;
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
      date: stringValue(action.date, '未知时间'),
      actor: stringValue(action.actor, '未知用户'),
      action: stringValue(action.action, '记录'),
      commentHtml: sanitizeRichHtml(action.comment),
      descriptionHtml: sanitizeRichHtml(action.desc ?? action.history)
    };
  });
}

export function toDetailViewModel(type: ZenTaoItemType, value: unknown): DetailViewModel {
  const raw = asRecord(value);
  const id = Number(raw.id);
  const title = stringValue(type === 'story' ? raw.title : raw.name, `#${id}`);
  const projectName = stringValue(raw.projectName, stringValue(raw.project, '-'));
  const productName = stringValue(raw.productName, stringValue(raw.product, '-'));
  const assigned = stringValue(raw.assignedToRealName, stringValue(raw.assignedTo, '-'));

  return {
    id,
    type,
    title,
    basicFields: [
      { label: '项目', value: projectName },
      { label: '产品', value: productName },
      { label: '状态', value: stringValue(raw.status, '-') },
      { label: '优先级', value: priority(raw.pri) },
      { label: '指派', value: assigned },
      { label: '版本', value: stringValue(raw.version, '-') }
    ],
    descriptionHtml: sanitizeRichHtml(raw.spec ?? raw.desc),
    acceptanceHtml: sanitizeRichHtml(raw.verify ?? raw.storyVerify),
    attachments: extractAttachments(raw),
    activities: extractActivities(raw),
    raw
  };
}

export function escapedJson(value: unknown): string {
  return escapeHtml(redactSensitiveText(JSON.stringify(value, null, 2)));
}
