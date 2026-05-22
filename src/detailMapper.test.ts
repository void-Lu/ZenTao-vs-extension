import { describe, expect, it } from 'vitest';
import { toDetailViewModel } from './detailMapper';
import { sanitizeRichHtml } from './html';

describe('sanitizeRichHtml', () => {
  it('removes scripts and event handlers while keeping basic formatting', () => {
    const clean = sanitizeRichHtml('<p onclick="x()">ok</p><script>alert(1)</script><table><tr><td>A</td></tr></table>');
    expect(clean).toContain('<p>ok</p>');
    expect(clean).toContain('<table>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });
});

describe('toDetailViewModel', () => {
  it('extracts story detail fields in the required order', () => {
    const model = toDetailViewModel('story', {
      id: 101,
      title: '登录优化',
      project: 123,
      projectName: '企业管理系统',
      product: 4,
      productName: '客户门户',
      status: 'active',
      pri: 1,
      assignedTo: { account: 'admin', realname: '管理员' },
      version: 2,
      spec: '<p>描述</p>',
      verify: '<p>验收</p>',
      files: [{ id: 8, title: 'spec.docx', addedDate: '2026-05-21 10:18' }],
      actions: [{ date: '2026-05-21 11:02', actor: '张三', action: 'commented', comment: '请补充验收标准。', desc: '' }]
    });

    expect(model.basicFields.map((field) => field.label)).toEqual(['项目', '产品', '状态', '优先级', '指派', '版本']);
    expect(model.attachments[0].addedDate).toBe('2026-05-21 10:18');
    expect(model.activities[0].actor).toBe('张三');
  });
});
