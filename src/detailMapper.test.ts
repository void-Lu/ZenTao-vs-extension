import { describe, expect, it } from 'vitest';
import { escapedJson, toDetailViewModel } from './detailMapper';
import { sanitizeRichHtml } from './html';

describe('sanitizeRichHtml', () => {
  it('removes scripts and event handlers while keeping basic formatting', () => {
    const clean = sanitizeRichHtml('<p onclick="x()">ok</p><script>alert(1)</script><table><tr><td>A</td></tr></table>');
    expect(clean).toContain('<p>ok</p>');
    expect(clean).toContain('<table>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });

  it('removes remote images from rich text to avoid automatic outbound requests', () => {
    const clean = sanitizeRichHtml('<p>ok</p><img src="https://example.com/track.png" alt="tracking">');

    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toContain('<img');
    expect(clean).not.toContain('track.png');
  });
});

describe('toDetailViewModel', () => {
  it('maps story details to the fixed requirement-page field template', () => {
    const model = toDetailViewModel('story', {
      id: 101,
      title: '供应商付款单功能设计',
      openedBy: 'amy.sun',
      openedDate: '2026-01-05 18:30:13',
      assignedTo: 'gino.lu',
      assignedDate: '2026-05-18 17:47:37',
      reviewedBy: 'amy.sun',
      reviewedDate: '2026-05-18 17:47:33',
      closedBy: '',
      closedReason: '',
      lastEditedBy: 'gino.lu',
      lastEditedDate: '2026-05-19 16:51:07',
      moduleName: '应付功能（常规）',
      planTitle: '',
      source: '',
      sourceNote: '',
      status: '激活',
      stage: '研发完毕',
      category: '功能',
      pri: 3,
      estimate: '0h',
      keywords: '',
      mailto: '',
      spec: '<p>详细逻辑见附件</p>',
      verify: '',
      files: [{ id: 8, title: 'spec.docx', size: '15.11K', addedDate: '2026-05-21 10:18' }],
      actions: []
    });

    expect(model.basicFieldGroups.map((group) => group.fields.map((field) => field.label))).toEqual([
      ['由谁创建', '指派给', '评审人员', '评审时间', '由谁关闭', '关闭原因', '最后修改'],
      ['所属模块', '所属计划', '来源', '来源备注', '当前状态', '所处阶段', '类别', '优先级', '预计工时', '关键词', '抄送给']
    ]);
    expect(model.basicFieldGroups[0].fields.find((field) => field.label === '由谁关闭')?.value).toBe('暂无');
    expect(model.contentSections.map((section) => section.title)).toEqual(['需求描述', '验收标准']);
    expect(model.contentSections[0].html).toContain('<p>详细逻辑见附件</p>');
    expect(model.contentSections[1].html).toBe('暂无');
    expect(model.attachments[0].size).toBe('15.11K');
  });

  it('maps task details to the fixed task-page template and existing actions only', () => {
    const model = toDetailViewModel('task', {
      id: 2068,
      name: '供应商付款单功能设计',
      executionName: 'PJ4258 广州汇登',
      moduleName: '',
      storyTitle: '供应商付款单功能设计',
      assignedTo: 'neil.tang gino.lu will.liu',
      mode: '多人并行',
      type: '开发',
      status: '进行中',
      progress: '17%',
      pri: 1,
      mailto: '',
      estimate: '1工时',
      consumed: '1工时',
      left: '0工时',
      estStarted: '',
      realStarted: '2026-05-21 13:42:40',
      deadline: '',
      openedBy: 'john.wang',
      openedDate: '2026-05-21 11:17:14',
      finishedBy: 'gino.lu',
      finishedDate: '2026-05-21 16:45:35',
      canceledBy: '',
      closedBy: '',
      closedReason: '',
      lastEditedBy: 'gino.lu',
      lastEditedDate: '2026-05-21 16:45:42',
      desc: '',
      storySpec: '<p>需求详情<script>alert(1)</script></p>',
      storyVerify: '',
      actions: [
        { date: '2025-12-22 18:10:22', actor: 'amy.sun', action: '创建', comment: '', desc: '' },
        { date: '2025-12-26 11:08:34', actor: 'amy.sun', action: '添加备注', comment: '<p>字段变更</p>', history: '<script>x()</script>' }
      ]
    });

    expect(model.basicFieldGroups.map((group) => group.fields.map((field) => field.label))).toEqual([
      ['所属执行', '所属模块', '相关研发需求', '指派给', '任务模式', '任务类型', '任务状态', '进度', '优先级', '抄送给'],
      ['最初预计', '总计消耗', '预计剩余', '预计开始', '实际开始', '截止日期'],
      ['由谁创建', '由谁完成', '由谁取消', '由谁关闭', '关闭原因', '最后编辑']
    ]);
    expect(model.basicFieldGroups[0].fields.find((field) => field.label === '所属模块')?.value).toBe('暂无');
    expect(model.contentSections.map((section) => section.title)).toEqual(['任务描述', '研发需求描述', '验收标准']);
    expect(model.contentSections[0].html).toBe('暂无');
    expect(model.contentSections[1].html).toContain('<p>需求详情</p>');
    expect(model.contentSections[1].html).not.toContain('script');
    expect(model.activities).toHaveLength(2);
    expect(model.activities[1].contentHtml).toContain('<p>字段变更</p>');
    expect(model.activities[1].contentHtml).not.toContain('script');
  });
});

describe('escapedJson', () => {
  it('redacts token, password, and cookie fields before HTML escaping', () => {
    const html = escapedJson({
      token: 'tok_secret',
      password: 'pw_secret',
      cookie: 'sid=secret',
      name: '<b>safe</b>'
    });

    expect(html).not.toContain('tok_secret');
    expect(html).not.toContain('pw_secret');
    expect(html).not.toContain('sid=secret');
    expect(html).toContain('[REDACTED]');
    expect(html).toContain('&lt;b&gt;safe&lt;/b&gt;');
  });

  it('redacts sensitive raw JSON keys with embedded quotes recursively', () => {
    const html = escapedJson({
      password: 'pw"tail',
      nested: {
        Token: 'tok"tail',
        items: [
          { cookie: 'sid="abc"; x=1' },
          { name: 'safe value' }
        ]
      }
    });

    expect(html).not.toContain('pw');
    expect(html).not.toContain('tok');
    expect(html).not.toContain('tail');
    expect(html).not.toContain('sid=');
    expect(html).not.toContain('abc');
    expect(html).not.toContain('x=1');
    expect(html).toContain('safe value');
  });
});
