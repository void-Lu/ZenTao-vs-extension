import { AttachmentViewModel, DetailViewModel } from './types';

function attributeValue(attributes: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    nbsp: ' '
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([a-z0-9#]+);/gi, (entity, name: string) => namedEntities[name.toLowerCase()] ?? entity);
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, '')).trim();
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\[\]])/g, '\\$1');
}

function normalizeMarkdown(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function convertHtmlTablesToMarkdown(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableBody: string) => {
    const rows: string[][] = [];
    const rowMatches = tableBody.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const rowHtml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      for (const cellHtml of cellMatches) {
        cells.push(escapeTableCell(stripHtml(cellHtml)));
      }
      if (cells.length) { rows.push(cells); }
    }
    if (!rows.length) { return ''; }

    const maxCols = Math.max(...rows.map((r) => r.length));
    const normalized = rows.map((r) => {
      while (r.length < maxCols) { r.push(''); }
      return r;
    });

    const lines: string[] = [];
    lines.push(`| ${normalized[0].join(' | ')} |`);
    lines.push(`| ${normalized[0].map(() => '---').join(' | ')} |`);
    for (let i = 1; i < normalized.length; i++) {
      lines.push(`| ${normalized[i].join(' | ')} |`);
    }
    return '\n' + lines.join('\n') + '\n';
  });
}

export function richHtmlToMarkdown(html: string): string {
  let markdown = convertHtmlTablesToMarkdown(html);

  markdown = markdown
    .replace(/<img\b([^>]*)>/gi, (_, attributes: string) => {
      const src = attributeValue(attributes, 'src');
      if (!src) {
        return '';
      }
      const alt = stripHtml(attributeValue(attributes, 'alt') || attributeValue(attributes, 'title') || '图片');
      return `![${escapeMarkdownText(alt)}](${src})`;
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attributes: string, text: string) => {
      const href = attributeValue(attributes, 'href');
      const label = stripHtml(text) || href;
      return href ? `[${escapeMarkdownText(label)}](${href})` : label;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|section|blockquote|tr|h[1-4])>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]*>/g, '');

  return normalizeMarkdown(markdown);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function attachmentName(attachment: AttachmentViewModel): string {
  const name = escapeTableCell(attachment.name || '未命名附件');
  return attachment.url ? `[${name}](${attachment.url})` : name;
}

export function detailToMarkdown(detail: DetailViewModel): string {
  const lines: string[] = [`# #${detail.id} ${detail.title}`, '', '## 基础字段'];

  for (const group of detail.basicFieldGroups) {
    for (const field of group.fields) {
      lines.push(`- **${field.label}**：${field.value}`);
    }
    lines.push('');
  }

  for (const section of detail.contentSections) {
    lines.push(`## ${section.title}`, richHtmlToMarkdown(section.html) || '暂无', '');
  }

  lines.push('## 附件');
  if (detail.attachments.length) {
    lines.push('| 文件名 | 大小 | 添加时间 |', '| --- | --- | --- |');
    for (const attachment of detail.attachments) {
      lines.push(`| ${attachmentName(attachment)} | ${escapeTableCell(attachment.size || '暂无')} | ${escapeTableCell(attachment.addedDate || '未知')} |`);
    }
  } else {
    lines.push('暂无附件');
  }
  lines.push('', '## 历史记录');

  if (detail.activities.length) {
    for (const activity of detail.activities) {
      lines.push(`- ${richHtmlToMarkdown(activity.contentHtml) || '暂无'}`);
    }
  } else {
    lines.push('暂无历史记录');
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function markdownFileName(detail: DetailViewModel): string {
  const title = detail.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || '未命名';
  return `${detail.type}-${detail.id}-${title}.md`;
}