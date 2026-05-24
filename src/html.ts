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
      'a', 'hr', 'h1', 'h2', 'h3', 'h4'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
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
  const fieldGroups = detail.basicFieldGroups.map((group) => `
    <div class="fields">${group.fields.map((field) => `
      <div class="field-row"><strong>${escapeHtml(field.label)}</strong><span>${escapeHtml(field.value)}</span></div>`).join('')}
    </div>`).join('');

  const contentSections = detail.contentSections.map((section) => `
    <section class="focus-block"><h2>${escapeHtml(section.title)}</h2><div class="rich-content">${section.html}</div></section>`).join('');

  const attachments = detail.attachments.length
    ? `<table class="attachment-table"><thead><tr><th>文件名</th><th>大小</th></tr></thead><tbody>${detail.attachments.map((attachment, index) => `
      <tr><td><a href="#" data-attachment-index="${index}">${escapeHtml(attachment.name)}</a></td><td>${escapeHtml(attachment.size || '暂无')}</td></tr>`).join('')}</tbody></table>`
    : '<p>暂无附件</p>';

  const activities = detail.activities.length
    ? `<ol class="activity-list">${detail.activities.map((activity) => `
      <li>
        <div class="activity-meta">${escapeHtml(activity.date)}，由 ${escapeHtml(activity.actor)} ${escapeHtml(activity.action)}。</div>
        <div class="rich-content">${activity.contentHtml || '暂无'}</div>
      </li>`).join('')}</ol>`
    : '<p>暂无历史记录</p>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(detail.title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .fields { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
    .field-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; line-height: 1.45; font-size: 13px; }
    .focus-block { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; margin: 10px 0; }
    .attachment-table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
    .attachment-table th, .attachment-table td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; }
    .attachment-table th { background: var(--vscode-editor-background); }
    .activity-list { padding-left: 22px; }
    li { margin: 8px 0; }
    a { color: var(--vscode-textLink-foreground); cursor: pointer; }
    pre { overflow: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); }
    .activity-meta { opacity: 0.75; font-size: 12px; margin-bottom: 2px; }
    .rich-content table { border-collapse: collapse; }
    .rich-content th, .rich-content td { border: 1px solid var(--vscode-panel-border); padding: 4px 6px; }
  </style>
</head>
<body>
  <h1>#${escapeHtml(detail.id)} ${escapeHtml(detail.title)}</h1>
  <section>${fieldGroups}</section>
  ${contentSections}
  <section><h2>附件</h2>${attachments}</section>
  <section class="focus-block"><h2>历史记录</h2>${activities}</section>
  <details><summary>完整原始响应</summary><pre>${escapedJson(detail.raw)}</pre></details>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-attachment-index]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'downloadAttachment', index: Number(link.dataset.attachmentIndex) });
      });
    });
  </script>
</body>
</html>`;
}
