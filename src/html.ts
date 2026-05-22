import sanitizeHtml from 'sanitize-html';
import { redactSensitiveText } from './requestLogger';
import { DetailViewModel } from './types';

const sensitiveRawJsonKeys = new Set(['token', 'password', 'cookie']);

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeRichHtml(value: unknown): string {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img', 'hr', 'h1', 'h2', 'h3', 'h4'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard'
  });
}

function redactSensitiveRawJsonKey(key: string, value: unknown): unknown {
  return sensitiveRawJsonKeys.has(key.toLowerCase()) ? '[REDACTED]' : value;
}

function escapedJson(value: unknown): string {
  return escapeHtml(redactSensitiveText(JSON.stringify(value, redactSensitiveRawJsonKey, 2)));
}

export interface RenderDetailHtmlOptions {
  detail: DetailViewModel;
  cspSource: string;
  nonce: string;
}

export function renderDetailHtml(options: RenderDetailHtmlOptions): string {
  const { detail, cspSource, nonce } = options;
  const fields = detail.basicFields.map((field) => `
    <div class="field-row"><strong>${escapeHtml(field.label)}</strong><span>${escapeHtml(field.value)}</span></div>`).join('');

  const attachments = detail.attachments.length
    ? detail.attachments.map((attachment, index) => `
      <li>${escapeHtml(attachment.name)} · 添加日期：${escapeHtml(attachment.addedDate)}
        <button data-attachment-index="${index}">下载</button>
      </li>`).join('')
    : '<li>暂无附件</li>';

  const activities = detail.activities.length
    ? detail.activities.map((activity) => `
      <li>
        <div class="activity-meta">${escapeHtml(activity.date)} · ${escapeHtml(activity.actor)} · ${escapeHtml(activity.action)}</div>
        <div>${activity.commentHtml || activity.descriptionHtml || '无评论内容'}</div>
      </li>`).join('')
    : '<li>暂无评论 / 操作历史</li>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: http:; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(detail.title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .fields { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
    .field-row { display: grid; grid-template-columns: 72px 1fr; gap: 8px; line-height: 1.45; font-size: 13px; }
    .focus-block { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; margin: 10px 0; }
    ul { padding-left: 18px; }
    li { margin: 6px 0; }
    button { cursor: pointer; }
    pre { overflow: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); }
    .activity-meta { opacity: 0.75; font-size: 12px; margin-bottom: 2px; }
  </style>
</head>
<body>
  <h1>#${escapeHtml(detail.id)} ${escapeHtml(detail.title)}</h1>
  <section class="fields">${fields}</section>
  <section class="focus-block"><h2>描述 / 验收标准</h2>${detail.descriptionHtml}${detail.acceptanceHtml}</section>
  <section><h2>附件</h2><ul>${attachments}</ul></section>
  <section class="focus-block"><h2>评论 / 操作历史</h2><ul>${activities}</ul></section>
  <details><summary>完整原始响应</summary><pre>${escapedJson(detail.raw)}</pre></details>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-attachment-index]').forEach((button) => {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'downloadAttachment', index: Number(button.dataset.attachmentIndex) });
      });
    });
  </script>
</body>
</html>`;
}
