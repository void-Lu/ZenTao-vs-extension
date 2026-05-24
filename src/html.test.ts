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
        basicFieldGroups: [{ fields: [{ label: '当前状态', value: '激活' }] }],
        contentSections: [
          { title: '需求描述', html: '<p>描述</p>' },
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
    expect(html).toContain('data-attachment-index="0"');
    expect(html).toContain('spec.docx');
    expect(html).toContain('15.11K');
    expect(html).toContain('<ol class="activity-list">');
    expect(html).toContain('<div class="rich-content">评论</div>');
    expect(html).not.toContain('activity-meta');
    expect(html).not.toContain('2026-05-21，由 张三 commented');
    expect(html).not.toContain('<button');
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
