import { describe, expect, it } from 'vitest';
import { renderDetailHtml } from './html';

describe('renderDetailHtml', () => {
  it('renders attachments before history and includes CSP', () => {
    const html = renderDetailHtml({
      cspSource: 'vscode-webview:',
      nonce: 'abc',
      detail: {
        id: 101,
        type: 'story',
        title: '登录优化',
        basicFieldGroups: [{ fields: [
          { label: '当前状态', value: '激活' },
          { label: '相关研发需求', value: '需求 A', linkType: 'story', linkId: 101 },
          { label: '关联任务', value: '任务 A、任务 B', links: [
            { type: 'task', id: 201, text: '任务 A' },
            { type: 'task', id: 202, text: '任务 B' }
          ] }
        ] }],
        contentSections: [
          { title: '需求描述', html: '<p>描述<img src="https://zentao.example.com/file.png" alt="截图"></p>' },
          { title: '验收标准', html: '暂无' }
        ],
        attachments: [{ id: 1, name: 'spec.docx', size: '15.11K', addedDate: '2026-05-21', raw: {} }],
        activities: [{ date: '2026-05-21', actor: '张三', action: 'commented', contentHtml: '评论' }],
        raw: { id: 101 }
      }
    });

    expect(html).toContain("script-src 'nonce-abc'");
    expect(html).toContain('img-src vscode-webview: https: http:;');
    expect(html.indexOf('附件')).toBeLessThan(html.indexOf('历史记录'));
    expect(html).toContain('需求描述');
    expect(html).toContain('验收标准');
    expect(html).toContain('>暂无<');
    expect(html).toContain('<th>文件名</th>');
    expect(html).toContain('<th>大小</th>');
    expect(html).toContain('<th>添加时间</th>');
    expect(html).toContain('data-detail-link-type="story"');
    expect(html).toContain('data-detail-link-id="101"');
    expect(html).toContain('data-detail-link-type="task"');
    expect(html).toContain('data-detail-link-id="201"');
    expect(html).toContain('<th>预览</th>');
    expect(html).toContain('data-attachment-index="0"');
    expect(html).toContain('data-preview-attachment-index="0"');
    expect(html).toContain('spec.docx');
    expect(html).toContain('15.11K');
    expect(html).toContain('2026-05-21');
    expect(html).toContain('data-export-markdown');
    expect(html).toContain('导出 MD');
    expect(html).toContain('class="image-modal"');
    expect(html).toContain('data-modal-image');
    expect(html).toContain('downloadImage');
    expect(html).toContain('previewAttachment');
    expect(html).toContain('exportMarkdown');
    expect(html).toContain('data-search-panel');
    expect(html).toContain('data-search-input');
    expect(html).toContain('Ctrl+F');
    expect(html).toContain('<ol class="activity-list">');
    expect(html).toContain('<div class="rich-content">评论</div>');
    expect(html).not.toContain('activity-meta');
    expect(html).not.toContain('2026-05-21，由 张三 commented');
  });

  it('renders an empty history state when actions are absent', () => {
    const html = renderDetailHtml({
      cspSource: 'vscode-webview:',
      nonce: 'abc',
      detail: {
        id: 102,
        type: 'task',
        title: '任务',
        basicFieldGroups: [],
        contentSections: [],
        attachments: [],
        activities: [],
        raw: { id: 102 }
      }
    });

    expect(html).toContain('暂无历史记录');
  });
});
