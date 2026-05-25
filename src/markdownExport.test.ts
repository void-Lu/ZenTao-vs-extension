import { describe, expect, it } from 'vitest';
import { detailToMarkdown, markdownFileName } from './markdownExport';
import { DetailViewModel } from './types';

function detail(): DetailViewModel {
  return {
    id: 101,
    type: 'story',
    title: '登录/优化: 图片需求',
    basicFieldGroups: [{ fields: [{ label: '当前状态', value: '激活' }] }],
    contentSections: [
      { title: '需求描述', html: '<p>展示<a href="https://zentao.example.com/story/101">链接</a></p><p><img src="https://zentao.example.com/file.png" alt="截图"></p>' }
    ],
    attachments: [{ id: 1, name: 'spec.docx', size: '15K', addedDate: '2026-05-25', url: 'https://zentao.example.com/file/1', raw: {} }],
    activities: [{ date: '', actor: '', action: '', contentHtml: '<p>张三备注</p>' }],
    raw: { token: 'secret-token' }
  };
}

describe('markdownExport', () => {
  it('converts the rendered detail content to markdown without raw response data', () => {
    const markdown = detailToMarkdown(detail());

    expect(markdown).toContain('# #101 登录/优化: 图片需求');
    expect(markdown).toContain('## 基础字段');
    expect(markdown).toContain('| 当前状态 | 激活 |');
    expect(markdown).toContain('## 需求描述');
    expect(markdown).toContain('[链接](https://zentao.example.com/story/101)');
    expect(markdown).toContain('![截图](https://zentao.example.com/file.png)');
    expect(markdown).toContain('| [spec.docx](https://zentao.example.com/file/1) | 15K |');
    expect(markdown).toContain('- 张三备注');
    expect(markdown).not.toContain('secret-token');
    expect(markdown).not.toContain('完整原始响应');
  });

  it('creates a Windows-safe markdown file name', () => {
    expect(markdownFileName(detail())).toBe('story-101-登录_优化_ 图片需求.md');
  });

  it('exports linked basic fields as plain text', () => {
    const markdown = detailToMarkdown({
      ...detail(),
      basicFieldGroups: [{ fields: [{ label: '相关研发需求', value: '需求 A', linkType: 'story', linkId: 101 }] }]
    });

    expect(markdown).toContain('| 相关研发需求 | 需求 A |');
    expect(markdown).not.toContain('linkType');
  });
});