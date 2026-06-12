import { AttachmentViewModel } from './types';
import { escapeHtml, sanitizeRichHtml } from './html';
import { escapedJson } from './detailMapper';

// Heavy third-party libraries are loaded lazily to avoid blocking extension
// activation. Native addons (e.g. @napi-rs/canvas via pdf-parse) would crash
// the module load chain if imported at the top level because VS Code's bundled
// Node.js version may differ from the system Node.js used during npm install.

export const maxPreviewBytes = 10 * 1024 * 1024;

export type AttachmentPreviewKind = 'text' | 'markdown' | 'word' | 'pdf' | 'excel' | 'csv' | 'image' | 'unsupported' | 'error';

const imageMimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
  webp: 'image/webp', ico: 'image/x-icon', tiff: 'image/tiff', tif: 'image/tiff'
};

const imageExtensions = new Set(Object.keys(imageMimeTypes));

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
  convertDoc?: (bytes: Buffer) => Promise<string>;
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
      let html: string;
      if (adapters.renderMarkdown) {
        html = adapters.renderMarkdown(text);
      } else {
        const MarkdownIt = (require('markdown-it') as { default?: unknown }).default || require('markdown-it');
        const md = new (MarkdownIt as new (opts: object) => { render(s: string): string })({ html: false, linkify: false, typographer: false });
        html = md.render(text);
      }
      return { ...base, kind: 'markdown', html: sanitizeRichHtml(html) };
    }

    if (extension === 'docx') {
      const html = adapters.convertDocx ? await adapters.convertDocx(buffer) : await defaultConvertDocx(buffer);
      return { ...base, kind: 'word', html: sanitizeRichHtml(html) };
    }

    if (extension === 'doc') {
      const html = adapters.convertDoc ? await adapters.convertDoc(buffer) : await defaultConvertDoc(buffer);
      return { ...base, kind: 'word', html: sanitizeRichHtml(html) };
    }

    if (extension === 'pdf') {
      const text = adapters.extractPdfText ? await adapters.extractPdfText(buffer) : await defaultExtractPdfText(buffer);
      return { ...base, kind: 'pdf', html: renderPdfText(text) };
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const sheets = adapters.readWorkbook ? await adapters.readWorkbook(buffer) : await defaultReadWorkbook(buffer);
      return { ...base, kind: 'excel', html: renderWorkbook(sheets) };
    }

    if (extension === 'csv') {
      const rows = defaultReadCsv(buffer);
      return { ...base, kind: 'csv', html: renderWorkbook([{ name: 'CSV', rows }]) };
    }

    if (imageExtensions.has(extension)) {
      const mime = imageMimeTypes[extension] || 'application/octet-stream';
      const base64 = buffer.toString('base64');
      return { ...base, kind: 'image', html: `<img src="data:${mime};base64,${base64}" alt="${escapeHtml(attachment.name)}" style="max-width:100%;height:auto;">` };
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
  const mammothModule = require('mammoth') as { default?: { convertToHtml(input: { buffer: Buffer }): Promise<{ value: string }> }; convertToHtml?(input: { buffer: Buffer }): Promise<{ value: string }> };
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.convertToHtml!({ buffer: bytes });
  return result.value;
}

async function defaultExtractPdfText(bytes: Buffer): Promise<string> {
  const pdfParse = require('pdf-parse') as unknown;

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

function defaultReadWorkbook(bytes: Buffer): WorkbookPreviewSheet[] {
  // Use the xlsx library instead of read-excel-file because read-excel-file:
  // 1. Drops rows/columns when merged cells cause sparse leading rows (e.g. NS传MK订单字段.xlsx
  //    only shows the header "表头" because the merged A1:D1 leaves B1-D1 as null, so
  //    read-excel-file truncates to 1 column and loses all subsequent data rows).
  // 2. Does not expand merged cell values into the merged region, so a value like
  //    "MABANG ECOM ORDER DETAIL" merged across rows 3-30 only appears in the first row.
  // 3. May return sheets in an arbitrary order rather than the file's original sheet order.
  const XLSX = require('xlsx') as typeof import('xlsx');
  const workbook = XLSX.read(bytes, { type: 'buffer' });

  return workbook.SheetNames.map((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      return { name: sheetName, rows: [] as unknown[][] };
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    const merges = ws['!merges'] || [];

    // Build a cell grid from the worksheet
    const grid: unknown[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: unknown[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        row.push(cell ? cell.v : null);
      }
      grid.push(row);
    }

    // Expand merged cells: copy the top-left value into every cell in the merge range
    for (const m of merges) {
      const val = grid[m.s.r - range.s.r]?.[m.s.c - range.s.c];
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (r === m.s.r && c === m.s.c) continue;
          const rowIdx = r - range.s.r;
          const colIdx = c - range.s.c;
          if (grid[rowIdx]) {
            grid[rowIdx][colIdx] = val;
          }
        }
      }
    }

    // Trim trailing empty columns from each row and remove fully empty trailing rows
    const rows = grid
      .map((row) => {
        let lastNonEmpty = -1;
        for (let i = row.length - 1; i >= 0; i--) {
          if (row[i] !== null && row[i] !== undefined && row[i] !== '') {
            lastNonEmpty = i;
            break;
          }
        }
        return row.slice(0, lastNonEmpty + 1);
      })
      .filter((row, idx) => {
        // Keep rows that have at least one non-empty cell, or all rows up to the last non-empty row
        if (row.length > 0) return true;
        // Check if any subsequent row is non-empty
        for (let i = idx + 1; i < grid.length; i++) {
          if (grid[i].some((v) => v !== null && v !== undefined && v !== '')) {
            return true;
          }
        }
        return false;
      });

    return { name: sheetName, rows };
  });
}

function renderWorkbook(sheets: WorkbookPreviewSheet[]): string {
  return sheets.map((sheet) => `<section><h3>${escapeHtml(sheet.name)}</h3><table>${sheet.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table></section>`).join('');
}

function defaultReadCsv(buffer: Buffer): unknown[][] {
  const XLSX = require('xlsx') as typeof import('xlsx');
  const wb = XLSX.read(buffer.toString('utf8'), { type: 'string', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) {
    return [];
  }
  return (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]);
}

async function defaultConvertDoc(bytes: Buffer): Promise<string> {
  let WordExtractorModule: unknown;
  try {
    WordExtractorModule = require('word-extractor');
  } catch {
    throw new Error('Word 97-2003 格式预览需要 word-extractor 依赖，请运行 npm install word-extractor 后重试。');
  }

  const WordExtractor = WordExtractorModule as { default?: new () => WordExtractorInstance } | (new () => WordExtractorInstance);
  const Constructor = (WordExtractor as { default?: new () => WordExtractorInstance }).default || (WordExtractor as new () => WordExtractorInstance);
  const extractor = new Constructor();
  const doc = await extractor.extract(bytes);
  const body = doc.getBody();
  return body
    .split(/\r?\n/)
    .map((line: string) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

interface WordExtractorInstance {
  extract(input: Buffer): Promise<{ getBody(): string }>;
}
