import { describe, expect, it, vi } from 'vitest';
import { renderAttachmentPreview, maxPreviewBytes } from './attachmentPreview';

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

  it('returns unsupported preview for legacy doc files', async () => {
    const result = await renderAttachmentPreview({ ...attachment, name: 'legacy.doc' }, Buffer.from([1]));

    expect(result.kind).toBe('unsupported');
    expect(result.error).toBe('不支持该 Word 格式预览。');
  });

  it('rejects files larger than the preview limit', async () => {
    const result = await renderAttachmentPreview({ ...attachment, name: 'large.txt' }, Buffer.alloc(maxPreviewBytes + 1));

    expect(result.kind).toBe('error');
    expect(result.error).toBe('附件超过预览大小限制。');
  });
});
