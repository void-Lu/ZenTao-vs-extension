import mammoth from 'mammoth';
import * as pdfParseModule from 'pdf-parse';
import MarkdownIt from 'markdown-it';
import readXlsxFile from 'read-excel-file/node';
import { AttachmentViewModel } from './types';
import { escapeHtml, sanitizeRichHtml } from './html';
import { escapedJson } from './detailMapper';

export const maxPreviewBytes = 10 * 1024 * 1024;

export type AttachmentPreviewKind = 'text' | 'markdown' | 'word' | 'pdf' | 'excel' | 'unsupported' | 'error';

export interface AttachmentPreviewResult {
  title: string;
  kind: AttachmentPreviewKind;
  html: string;
  metadataHtml: string;
  rawJsonHtml: string;
  error?: string;
}

export interface WorkbookPreviewSheet {
  name: string;
  rows: unknown[][];
}

export interface AttachmentPreviewAdapters {
  readWorkbook?: (bytes: Buffer) => WorkbookPreviewSheet[] | Promise<WorkbookPreviewSheet[]>;
  convertDocx?: (bytes: Buffer) => Promise<string>;
  extractPdfText?: (bytes: Buffer) => Promise<string>;
  renderMarkdown?: (markdown: string) => string;
}

type PdfParseFunction = (bytes: Buffer) => Promise<{ text?: string }>;
type PdfParseConstructor = new (options: { data: Buffer }) => {
  getText: () => Promise<{ text?: string }>;
  destroy: () => Promise<void>;
};

export async function renderAttachmentPreview(
  attachment: AttachmentViewModel,
  bytes: Uint8Array,
  adapters: AttachmentPreviewAdapters = {}
): Promise<AttachmentPreviewResult> {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const base = resultBase(attachment);

  if (buffer.byteLength > maxPreviewBytes) {
    const error = '附件超过预览大小限制。';
    return { ...base, kind: 'error', html: `<p>${escapeHtml(error)}</p>`, error };
  }

  try {
    const extension = attachmentExtension(attachment);
    if (extension === 'txt') {
      const text = buffer.toString('utf8');
      return { ...base, kind: 'text', html: `<pre>${escapeHtml(text)}</pre>` };
    }

    if (extension === 'md' || extension === 'markdown') {
      const text = buffer.toString('utf8');
      const html = adapters.renderMarkdown
        ? adapters.renderMarkdown(text)
        : new MarkdownIt({ html: false, linkify: false, typographer: false }).render(text);
      return { ...base, kind: 'markdown', html: sanitizeRichHtml(html) };
    }

    if (extension === 'docx') {
      const html = adapters.convertDocx ? await adapters.convertDocx(buffer) : await defaultConvertDocx(buffer);
      return { ...base, kind: 'word', html: sanitizeRichHtml(html) };
    }

    if (extension === 'doc') {
      const error = '不支持该 Word 格式预览。';
      return { ...base, kind: 'unsupported', html: `<p>${escapeHtml(error)}</p>`, error };
    }

    if (extension === 'pdf') {
      const text = adapters.extractPdfText ? await adapters.extractPdfText(buffer) : await defaultExtractPdfText(buffer);
      return { ...base, kind: 'pdf', html: renderPdfText(text) };
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const sheets = adapters.readWorkbook ? await adapters.readWorkbook(buffer) : await defaultReadWorkbook(buffer);
      return { ...base, kind: 'excel', html: renderWorkbook(sheets) };
    }

    const error = '当前附件类型不支持预览。';
    return { ...base, kind: 'unsupported', html: `<p>${escapeHtml(error)}</p>`, error };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMessage = `附件预览失败：${message}`;
    return { ...base, kind: 'error', html: `<p>${escapeHtml(errorMessage)}</p>`, error: errorMessage };
  }
}

function resultBase(attachment: AttachmentViewModel): Omit<AttachmentPreviewResult, 'kind' | 'html' | 'error'> {
  return {
    title: attachment.name,
    metadataHtml: renderMetadataHtml(attachment),
    rawJsonHtml: escapedJson(attachment.raw)
  };
}

function renderMetadataHtml(attachment: AttachmentViewModel): string {
  const downloadUrl = attachment.url || (attachment.id ? `files/${attachment.id}` : '');
  const rows = [
    ['文件名', attachment.name],
    ['大小', attachment.size || '暂无'],
    ['添加时间', attachment.addedDate],
    ['下载地址', downloadUrl || '暂无']
  ];

  return `<table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

function attachmentExtension(attachment: AttachmentViewModel): string {
  if (attachment.extension) {
    return attachment.extension.replace(/^\./, '').toLowerCase();
  }
  const match = /\.([^.]+)$/.exec(attachment.name);
  return match ? match[1].toLowerCase() : '';
}

async function defaultConvertDocx(bytes: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer: bytes });
  return result.value;
}

async function defaultExtractPdfText(bytes: Buffer): Promise<string> {
  const pdfParse = pdfParseModule as unknown;

  if (typeof pdfParse === 'function') {
    const result = await (pdfParse as PdfParseFunction)(bytes);
    return result.text || '';
  }

  const pdfParseObject = pdfParse as { default?: PdfParseFunction; PDFParse?: PdfParseConstructor };
  if (typeof pdfParseObject.default === 'function') {
    const result = await pdfParseObject.default(bytes);
    return result.text || '';
  }

  if (pdfParseObject.PDFParse) {
    const parser = new pdfParseObject.PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy();
    }
  }

  throw new Error('pdf-parse adapter is unavailable');
}

function renderPdfText(text: string): string {
  const pages = text.split(/\n\s*\n/).filter((page) => page.trim().length > 0);
  const nonEmptyPages = pages.length ? pages : [''];
  return nonEmptyPages.map((page, index) => `<section><h3>第 ${index + 1} 页</h3><pre>${escapeHtml(page)}</pre></section>`).join('');
}

async function defaultReadWorkbook(bytes: Buffer): Promise<WorkbookPreviewSheet[]> {
  const sheets = await readXlsxFile(bytes);
  return sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data as unknown[][] }));
}

function renderWorkbook(sheets: WorkbookPreviewSheet[]): string {
  return sheets.map((sheet) => `<section><h3>${escapeHtml(sheet.name)}</h3><table>${sheet.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table></section>`).join('');
}
