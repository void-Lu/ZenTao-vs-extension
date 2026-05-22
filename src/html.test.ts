import { describe, expect, it } from 'vitest';
import { renderDetailHtml } from './html';

describe('renderDetailHtml', () => {
  it('renders attachments before activities and includes CSP', () => {
    const html = renderDetailHtml({
      cspSource: 'vscode-webview:',
      nonce: 'abc',
      detail: {
        id: 101,
        type: 'story',
        title: '登录优化',
        basicFields: [
          { label: '项目', value: '企业管理系统' },
          { label: '产品', value: '客户门户' },
          { label: '状态', value: 'active' },
          { label: '优先级', value: 'P1' },
          { label: '指派', value: 'admin' },
          { label: '版本', value: '2' }
        ],
        descriptionHtml: '<p>描述</p>',
        acceptanceHtml: '<p>验收</p>',
        attachments: [{ id: 1, name: 'spec.docx', addedDate: '2026-05-21', raw: {} }],
        activities: [{ date: '2026-05-21', actor: '张三', action: 'commented', commentHtml: '评论', descriptionHtml: '' }],
        raw: { id: 101 }
      }
    });

    expect(html).toContain("script-src 'nonce-abc'");
    expect(html.indexOf('附件')).toBeLessThan(html.indexOf('评论 / 操作历史'));
    expect(html).toContain('描述 / 验收标准');
  });
});
