import { describe, expect, it, vi } from 'vitest';
import { renderAttachmentPreview, maxPreviewBytes } from '../attachmentPreview';

const attachment = { id: 1, name: 'file.txt', size: '1K', addedDate: '2026-05-21 10:00:00', raw: { token: 'secret', safe: 'ok' } };

describe('renderAttachmentPreview', () => {
  it('renders txt content with escaped HTML and preserved line breaks', async () => {
    const result = await renderAttachmentPreview({ ...attachment, name: 'notes.txt' }, Buffer.from('a < b\nline 2'));

    expect(result.kind).toBe('text');
    expect(result.html).toContain('<pre>a &lt; b\nline 2</pre>');
    expect(result.html).not.toContain('< b');
  });

  it('renders markdown through the injected renderer and sanitizes scripts', async () => {
    const result = await renderAttachmentPreview(
      { ...attachment, name: 'readme.md' },
      Buffer.from('# Title'),
      { renderMarkdown: () => '<h1>Title</h1><script>alert(1)</script>' }
    );

    expect(result.kind).toBe('markdown');
    expect(result.html).toContain('<h1>Title</h1>');
    expect(result.html).not.toContain('script');
  });

  it('renders docx content through mammoth adapter and sanitizes output', async () => {
    const convertDocx = vi.fn(async () => '<p>Word</p><img src="javascript:alert(1)">');

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'spec.docx' },
      Buffer.from([1, 2, 3]),
      { convertDocx }
    );

    expect(result.kind).toBe('word');
    expect(convertDocx).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(result.html).toContain('<p>Word</p>');
    expect(result.html).not.toContain('javascript:');
  });

  it('renders pdf text by pages', async () => {
    const result = await renderAttachmentPreview(
      { ...attachment, name: 'spec.pdf' },
      Buffer.from([1]),
      { extractPdfText: vi.fn(async () => 'page one\n\npage two') }
    );

    expect(result.kind).toBe('pdf');
    expect(result.html).toContain('<h3>第 1 页</h3>');
    expect(result.html).toContain('page one');
    expect(result.html).toContain('<h3>第 2 页</h3>');
  });

  it('renders workbook sheets as tables', async () => {
    const result = await renderAttachmentPreview(
      { ...attachment, name: 'tasks.xlsx' },
      Buffer.from([1]),
      { readWorkbook: vi.fn(() => [{ name: 'Sheet1', rows: [['ID', 'Name'], ['1', '<Task>']] }]) }
    );

    expect(result.kind).toBe('excel');
    expect(result.html).toContain('<h3>Sheet1</h3>');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('&lt;Task&gt;');
  });

  it('returns escaped redacted raw JSON without a pre wrapper', async () => {
    const result = await renderAttachmentPreview(
      {
        ...attachment,
        name: 'notes.txt',
        raw: { token: 'super-secret-token', password: 'super-secret-password', name: '<b>safe</b>' }
      },
      Buffer.from('preview')
    );

    expect(result.rawJsonHtml).not.toContain('<pre>');
    expect(result.rawJsonHtml).not.toContain('</pre>');
    expect(result.rawJsonHtml).not.toContain('super-secret-token');
    expect(result.rawJsonHtml).not.toContain('super-secret-password');
    expect(result.rawJsonHtml).toContain('[REDACTED]');
    expect(result.rawJsonHtml).toContain('&lt;b&gt;safe&lt;/b&gt;');
  });

  it('renders doc content through convertDoc adapter', async () => {
    const convertDoc = vi.fn(async () => '<p>Legacy Word Content</p>');

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'legacy.doc' },
      Buffer.from([1, 2, 3]),
      { convertDoc }
    );

    expect(result.kind).toBe('word');
    expect(convertDoc).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(result.html).toContain('Legacy Word Content');
  });

  it('returns error when .doc file bytes are invalid', async () => {
    const result = await renderAttachmentPreview({ ...attachment, name: 'legacy.doc' }, Buffer.from([1]));

    expect(result.kind).toBe('error');
    expect(result.error).toContain('附件预览失败');
  });

  it('rejects files larger than the preview limit', async () => {
    const result = await renderAttachmentPreview({ ...attachment, name: 'large.txt' }, Buffer.alloc(maxPreviewBytes + 1));

    expect(result.kind).toBe('error');
    expect(result.error).toBe('附件超过预览大小限制。');
  });

  it('renders CSV files as table rows using the xlsx library', async () => {
    const result = await renderAttachmentPreview(
      { ...attachment, name: 'data.csv' },
      Buffer.from('Name,Count\nApple,3\nBanana,5')
    );

    expect(result.kind).toBe('csv');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('Name');
    expect(result.html).toContain('Apple');
    expect(result.html).toContain('Banana');
    expect(result.html).toContain('<h3>CSV</h3>');
  });

  it('renders image files as base64 data URL img tags', async () => {
    // A minimal 1x1 red PNG
    const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'photo.png' },
      png1x1
    );

    expect(result.kind).toBe('image');
    expect(result.html).toContain('<img src="data:image/png;base64,');
    expect(result.html).toContain('alt="photo.png"');
    expect(result.html).toContain('max-width:100%');
  });

  it('renders JPEG images with correct MIME type', async () => {
    const result = await renderAttachmentPreview(
      { ...attachment, name: 'screenshot.jpg' },
      Buffer.from([0xFF, 0xD8, 0xFF])
    );

    expect(result.kind).toBe('image');
    expect(result.html).toContain('data:image/jpeg;base64,');
  });

  it('renders SVG images with correct MIME type', async () => {
    const result = await renderAttachmentPreview(
      { ...attachment, name: 'icon.svg' },
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    );

    expect(result.kind).toBe('image');
    expect(result.html).toContain('data:image/svg+xml;base64,');
  });
});

describe('defaultReadWorkbook', () => {
  // We test defaultReadWorkbook through renderAttachmentPreview by providing
  // no readWorkbook adapter, which exercises the real xlsx-based path.
  // However, we need to create real xlsx buffers to test merge and sheet-order behavior.

  it('expands merged cells across the merge region', async () => {
    // Create an xlsx buffer with a merged cell: A1:D1 merged with value "表头"
    // This simulates the NS传MK订单字段.xlsx problem where read-excel-file
    // only showed 1 column "表头" and dropped all data rows.
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['表头', null, null, null, 'MK字段'],
      ['字段名称', '字段ID', '字段格式', '字段值样例', '字段名称'],
      ['Order #', 'tranid', '文本', null, 'fd_tranid'],
    ]);
    // Merge A1:D1
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'test.xlsx' },
      Buffer.from(buf)
    );

    expect(result.kind).toBe('excel');
    // After merge expansion, columns B1-D1 should also show "表头"
    expect(result.html).toContain('表头');
    // Row 2 data should be present (not lost like with read-excel-file)
    expect(result.html).toContain('字段名称');
    expect(result.html).toContain('字段ID');
    // Row 3 data should be present
    expect(result.html).toContain('Order #');
    expect(result.html).toContain('fd_tranid');
  });

  it('preserves sheet order from the workbook', async () => {
    // Simulates the 中台系统对接 problem where sheets appeared in wrong order.
    // Workbook has Sheet1 before Sheet10, and we should preserve that order.
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([['序列一'], ['数据A']]);
    const ws10 = XLSX.utils.aoa_to_sheet([['序列二'], ['数据B']]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
    XLSX.utils.book_append_sheet(wb, ws10, 'Sheet10');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'order.xlsx' },
      Buffer.from(buf)
    );

    expect(result.kind).toBe('excel');
    // Sheet1 should appear before Sheet10 in the HTML
    const sheet1Pos = result.html.indexOf('Sheet1');
    const sheet10Pos = result.html.indexOf('Sheet10');
    expect(sheet1Pos).toBeGreaterThan(-1);
    expect(sheet10Pos).toBeGreaterThan(-1);
    expect(sheet1Pos).toBeLessThan(sheet10Pos);
  });

  it('expands vertical merged cells so repeated values appear in every row', async () => {
    // Simulates the 中台系统对接 Sheet10 problem where "MABANG ECOM ORDER DETAIL"
    // was merged across rows 3-30 but only appeared in the first row.
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Type'],
      ['MABANG ECOM ORDER DETAIL', 'CREATE_CREDITMEMO'],
      [null, 'CREATE_RETURNAUTHORIZATION'],
      [null, 'CREATE_SALESORDER'],
    ]);
    // Merge A2:A4 (vertical merge of "MABANG ECOM ORDER DETAIL")
    ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'merge.xlsx' },
      Buffer.from(buf)
    );

    expect(result.kind).toBe('excel');
    // The merged value should appear in every row of the merge region
    expect(result.html).toContain('MABANG ECOM ORDER DETAIL');
    // Count occurrences — should appear in all 3 data rows (rows 2-4)
    const matches = result.html.match(/MABANG ECOM ORDER DETAIL/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it('reads all rows from xlsx with merged header cells (NS传MK订单字段 regression)', async () => {
    // Exact reproduction of the NS传MK订单字段.xlsx problem:
    // Row 0 has a merged cell "表头" spanning 4 columns, with "MK字段" in column E.
    // Row 1 has headers. Rows 2+ have data. read-excel-file was returning only 1 row
    // with just "表头" because the merge made it think there was only 1 column.
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['表头', null, null, null, 'MK字段'],
      ['字段名称', '字段ID', '字段格式', '字段值样例', '字段名称'],
      ['Order #', 'tranid', '文本', null, 'fd_tranid'],
      ['建单人', 'SET BY', '员工档案', '', 'fd_creatorName'],
      ['Date', 'trandate', '日期', null, 'fd_trandate'],
    ]);
    // Merge A1:D1 for "表头"
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await renderAttachmentPreview(
      { ...attachment, name: 'NS传MK订单字段.xlsx' },
      Buffer.from(buf)
    );

    expect(result.kind).toBe('excel');
    // Should have all 5 rows, not just 1
    expect(result.html).toContain('表头');
    expect(result.html).toContain('字段名称');
    expect(result.html).toContain('字段ID');
    expect(result.html).toContain('Order #');
    expect(result.html).toContain('fd_tranid');
    expect(result.html).toContain('建单人');
    expect(result.html).toContain('fd_creatorName');
    expect(result.html).toContain('Date');
    // "表头" should be expanded across merged cells A1-D1
    const headerMatches = result.html.match(/表头/g);
    expect(headerMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
