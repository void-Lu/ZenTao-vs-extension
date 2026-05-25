# 禅道详情页展示变更 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化禅道详情页基础信息格式、内部关联跳转、页内搜索和附件内容预览。

**Architecture:** 详情字段格式化和关联链接在 `detailMapper.ts` 生成最终展示模型；`html.ts` 只做安全渲染和 Webview 端交互消息；`detailPanel.ts` 校验消息并协调详情跳转、Markdown 导出、附件下载和附件预览。附件预览新增纯逻辑解析模块 `attachmentPreview.ts`，下载字节复用 `AttachmentService`，所有解析输出都转义或经过 `sanitizeRichHtml` 清洗。

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, `sanitize-html`, `xlsx`, `mammoth`, `pdf-parse`, `markdown-it`, Node `Buffer`, Webview CSP/nonce.

---

## Scope Check

该 spec 聚焦现有详情页展示体验，虽包含附件内容解析，但仍属于同一个详情页 Webview 子系统：字段映射、HTML 渲染、消息处理、附件预览服务可以按任务独立交付，不需要拆成多个项目计划。

## File Structure

- Modify: `package.json` — 增加附件解析依赖和类型依赖。
- Modify: `package-lock.json` — 由 `npm install` 更新锁文件。
- Modify: `src/types.ts` — 扩展 `BasicField` 链接模型，补充附件 MIME/扩展名字段。
- Modify: `src/attachmentService.ts` — 抽出附件请求路径解析，新增无保存对话框的 `readBytes()`。
- Modify: `src/attachmentService.test.ts` — 覆盖 `readBytes()` 路径解析和缺少下载路径的行为。
- Modify: `src/detailMapper.ts` — 增加百分比、工时、日期、附件大小、关联需求/任务链接映射。
- Modify: `src/detailMapper.test.ts` — 覆盖基本信息格式化、附件大小和内部链接模型。
- Modify: `src/html.ts` — 渲染内部链接、附件预览列、页内搜索 UI 和搜索脚本。
- Modify: `src/html.test.ts` — 覆盖链接、预览列、搜索 UI 和消息类型。
- Create: `src/attachmentPreview.ts` — 解析 Excel、Word、PDF、TXT、Markdown 附件内容并输出安全预览 HTML。
- Create: `src/attachmentPreview.test.ts` — 用注入的解析适配器覆盖各文件类型、超大文件、失败路径和清洗。
- Modify: `src/detailPanel.ts` — 增加 `openDetail` 与 `previewAttachment` 消息处理，创建附件预览面板。
- Modify: `src/detailPanel.test.ts` — 覆盖详情跳转回调、附件预览面板和非法消息忽略。
- Modify: `src/extension.ts` — 装配 `DetailPanel` 的详情跳转回调和附件预览服务。
- Modify: `src/extension.test.ts` — 调整 `DetailPanel` mock 构造参数断言，确保详情跳转仍复用 `openDetail`。
- Modify: `src/markdownExport.ts` / `src/markdownExport.test.ts` — 保持 Markdown 导出兼容扩展后的 `BasicField` 类型，仅导出字段文本。

---

### Task 1: Dependencies and Attachment Bytes Boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/attachmentService.ts`
- Modify: `src/attachmentService.test.ts`

- [ ] **Step 1: Install preview parsing dependencies**

Run:

```powershell
npm install xlsx mammoth pdf-parse markdown-it; npm install -D @types/markdown-it
```

Expected: `package.json` gains runtime dependencies `xlsx`, `mammoth`, `pdf-parse`, `markdown-it`; dev dependency gains `@types/markdown-it`; `package-lock.json` updates.

- [ ] **Step 2: Write failing `readBytes()` tests**

Add these tests to `src/attachmentService.test.ts` inside the existing `describe('AttachmentService', () => { })` block:

```ts
  it('reads attachment bytes without opening a save dialog', async () => {
    const client = { downloadByPath: vi.fn(async () => new Uint8Array([9, 8, 7])) };
    const service = new AttachmentService(() => client as unknown as ZenTaoClient);

    const bytes = await service.readBytes({ id: 7, name: 'spec.docx', addedDate: '-', raw: {} });

    expect(bytes).toEqual(new Uint8Array([9, 8, 7]));
    expect(client.downloadByPath).toHaveBeenCalledWith('files/7');
    expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
  });

  it('reads attachment bytes from API URLs without duplicating the API prefix', async () => {
    const client = { downloadByPath: vi.fn(async () => new Uint8Array([1, 2])) };
    const service = new AttachmentService(() => client as unknown as ZenTaoClient);

    await service.readBytes({ name: 'spec.docx', addedDate: '-', url: 'https://zentao.example.com/api.php/v1/files/9', raw: {} });

    expect(client.downloadByPath).toHaveBeenCalledWith('files/9');
  });

  it('shows a warning when attachment bytes cannot be resolved', async () => {
    const client = { downloadByPath: vi.fn(async () => new Uint8Array([1])) };
    const service = new AttachmentService(() => client as unknown as ZenTaoClient);

    const bytes = await service.readBytes({ name: 'missing.bin', addedDate: '-', raw: {} });

    expect(bytes).toBeUndefined();
    expect(client.downloadByPath).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('当前附件缺少可下载地址。');
  });
```

- [ ] **Step 3: Run failing tests**

Run:

```powershell
npx vitest run src/attachmentService.test.ts --reporter=verbose
```

Expected: the new tests fail with `service.readBytes is not a function`.

- [ ] **Step 4: Implement `readBytes()` and shared path resolver**

In `src/attachmentService.ts`, replace the duplicated request-path logic with this structure:

```ts
  async download(attachment: AttachmentViewModel): Promise<void> {
    const defaultName = attachment.name || `zentao-attachment-${attachment.id ?? Date.now()}`;
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultName) });
    if (!target) {
      return;
    }

    const bytes = await this.readBytes(attachment);
    if (!bytes) {
      return;
    }

    await vscode.workspace.fs.writeFile(target, bytes);
    vscode.window.showInformationMessage(`附件已保存：${path.basename(target.fsPath)}`);
  }

  async readBytes(attachment: AttachmentViewModel): Promise<Uint8Array | undefined> {
    const requestPath = this.downloadPath(attachment);
    if (!requestPath) {
      vscode.window.showWarningMessage('当前附件缺少可下载地址。');
      return undefined;
    }

    return this.getClient().downloadByPath(requestPath);
  }

  private downloadPath(attachment: AttachmentViewModel): string {
    if (attachment.url) {
      return attachment.url.replace(/^.*api\.php\/v1\//, '').replace(/^\/+/, '');
    }
    return attachment.id ? `files/${attachment.id}` : '';
  }
```

Keep `downloadImage()`, `httpUrl()`, `defaultImageName()`, and `imageDownloadErrorMessage()` unchanged.

- [ ] **Step 5: Verify Task 1 passes**

Run:

```powershell
npx vitest run src/attachmentService.test.ts --reporter=verbose
```

Expected: all `AttachmentService` tests pass.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add package.json package-lock.json src/attachmentService.ts src/attachmentService.test.ts; git commit -m "feat: add attachment byte loading boundary"
```

---

### Task 2: Detail View Model Formatting and Internal Links

**Files:**
- Modify: `src/types.ts`
- Modify: `src/detailMapper.ts`
- Modify: `src/detailMapper.test.ts`
- Modify: `src/markdownExport.ts`
- Modify: `src/markdownExport.test.ts`

- [ ] **Step 1: Extend `BasicField` tests first**

Add a new test to `src/detailMapper.test.ts` under the existing `describe('toDetailViewModel', () => { })` block:

```ts
  it('formats task fields and creates a related story link', () => {
    const model = toDetailViewModel('task', {
      id: 2068,
      name: '开发任务',
      storyID: '101',
      storyTitle: '供应商付款单功能设计',
      progress: '17',
      estimate: '1',
      consumed: '1h',
      left: '0工时',
      realStarted: '2026-05-21 13:42',
      deadline: '2026-05-30',
      openedBy: 'john.wang',
      openedDate: '2026/05/21 11:17:14',
      desc: '',
      actions: []
    });

    const firstGroup = model.basicFieldGroups[0].fields;
    const secondGroup = model.basicFieldGroups[1].fields;
    const thirdGroup = model.basicFieldGroups[2].fields;

    expect(firstGroup.find((field) => field.label === '相关研发需求')).toMatchObject({
      value: '供应商付款单功能设计',
      linkType: 'story',
      linkId: 101
    });
    expect(firstGroup.find((field) => field.label === '进度')?.value).toBe('17%');
    expect(secondGroup.find((field) => field.label === '最初预计')?.value).toBe('1h');
    expect(secondGroup.find((field) => field.label === '总计消耗')?.value).toBe('1h');
    expect(secondGroup.find((field) => field.label === '预计剩余')?.value).toBe('0工时');
    expect(secondGroup.find((field) => field.label === '实际开始')?.value).toBe('2026-05-21 13:42:00');
    expect(secondGroup.find((field) => field.label === '截止日期')?.value).toBe('2026-05-30');
    expect(thirdGroup.find((field) => field.label === '由谁创建')?.value).toBe('john.wang 于 2026-05-21 11:17:14');
  });
```

Add another new test for story linked tasks and attachment sizes:

```ts
  it('formats story hours, linked tasks, dates, and attachment sizes', () => {
    const model = toDetailViewModel('story', {
      id: 101,
      title: '需求',
      estimate: '2',
      openedBy: 'amy.sun',
      openedDate: '2026-01-05',
      tasks: [
        { id: 2068, name: '前端开发' },
        { id: '2069', title: '接口联调' }
      ],
      files: [
        { id: 1, title: 'a.txt', size: 2048, addedDate: '2026-05-21 10:18' },
        { id: 2, title: 'b.pdf', size: '1.5MB', addedDate: '2026-05-22' }
      ],
      actions: []
    });

    expect(model.basicFieldGroups[1].fields.find((field) => field.label === '预计工时')?.value).toBe('2h');
    expect(model.basicFieldGroups[0].fields.find((field) => field.label === '由谁创建')?.value).toBe('amy.sun 于 2026-01-05');
    expect(model.basicFieldGroups[1].fields.find((field) => field.label === '关联任务')?.links).toEqual([
      { type: 'task', id: 2068, text: '前端开发' },
      { type: 'task', id: 2069, text: '接口联调' }
    ]);
    expect(model.attachments.map((attachment) => attachment.size)).toEqual(['2K', '1.5M']);
    expect(model.attachments.map((attachment) => attachment.addedDate)).toEqual(['2026-05-21 10:18:00', '2026-05-22']);
  });
```

- [ ] **Step 2: Run failing mapper tests**

Run:

```powershell
npx vitest run src/detailMapper.test.ts --reporter=verbose
```

Expected: failures show missing `linkType`, missing `links`, and current unformatted field values.

- [ ] **Step 3: Extend shared types**

Update `src/types.ts`:

```ts
export interface BasicFieldLink {
  type: ZenTaoItemType;
  id: number;
  text: string;
}

export interface BasicField {
  label: string;
  value: string;
  linkType?: ZenTaoItemType;
  linkId?: number;
  links?: BasicFieldLink[];
}

export interface AttachmentViewModel {
  id?: number;
  name: string;
  size?: string;
  addedDate: string;
  url?: string;
  extension?: string;
  mimeType?: string;
  raw: unknown;
}
```

Keep existing interfaces not shown above unchanged.

- [ ] **Step 4: Implement formatter helpers in `detailMapper.ts`**

Add helpers near `displayFirst()`:

```ts
function numberValue(value: unknown): number | undefined {
  const raw = stringValue(value).trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateTimeValue(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw || raw === '0000-00-00' || raw === '0000-00-00 00:00:00') {
    return '';
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!match) {
    return raw;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (hour === undefined || minute === undefined) {
    return date;
  }
  return `${date} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${(second ?? '0').padStart(2, '0')}`;
}

function displayDateFirst(raw: AnyRecord, keys: string[]): string {
  return displayValue(dateTimeValue(firstValue(raw, keys)));
}

function displayHoursFirst(raw: AnyRecord, keys: string[]): string {
  const value = displayFirst(raw, keys);
  if (value === emptyValue || /(?:\d)\s*(?:h|H|工时|小时)\b/.test(value) || /(?:工时|小时)$/.test(value)) {
    return value;
  }
  return `${value}h`;
}

function displayProgress(raw: AnyRecord): string {
  const value = displayFirst(raw, ['progress']);
  if (value === emptyValue || value.includes('%')) {
    return value;
  }
  return `${value}%`;
}

function displayAttachmentSize(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw) {
    return '';
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
  if (!match) {
    return raw;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) {
    return raw;
  }
  if (!unit || unit === 'b' || unit === 'byte' || unit === 'bytes') {
    return `${formatNumber(amount / 1024)}K`;
  }
  if (unit === 'k' || unit === 'kb') {
    return `${formatNumber(amount)}K`;
  }
  if (unit === 'm' || unit === 'mb') {
    return `${formatNumber(amount)}M`;
  }
  return raw;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
```

- [ ] **Step 5: Implement link helpers and field overloads**

Replace `field()` in `src/detailMapper.ts` with:

```ts
function field(label: string, value: string, extra: Partial<BasicField> = {}): BasicField {
  return { label, value, ...extra };
}

function objectId(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null) {
    return numberValue(asRecord(value).id ?? asRecord(value).ID);
  }
  return numberValue(value);
}

function relatedStoryField(raw: AnyRecord): BasicField {
  const storyRecord = asRecord(raw.story);
  const id = numberValue(raw.storyID ?? raw.storyId ?? storyRecord.id ?? storyRecord.ID);
  const title = displayValue(raw.storyTitle ?? raw.storyName ?? storyRecord.title ?? storyRecord.name ?? raw.story);
  return id ? field('相关研发需求', title, { linkType: 'story', linkId: id }) : field('相关研发需求', title);
}

function linkedTaskField(raw: AnyRecord): BasicField {
  const links = [...asArray(raw.tasks), ...asArray(raw.linkedTasks), ...asArray(raw.children)]
    .map((item) => {
      const task = asRecord(item);
      const id = objectId(task.id ?? task.ID ?? item);
      const text = stringValue(task.name ?? task.title ?? (id ? `#${id}` : ''));
      return id && text ? { type: 'task' as ZenTaoItemType, id, text } : undefined;
    })
    .filter((item): item is { type: ZenTaoItemType; id: number; text: string } => Boolean(item));
  return links.length ? field('关联任务', links.map((link) => link.text).join('、'), { links }) : field('关联任务', emptyValue);
}
```

- [ ] **Step 6: Apply formatters in story/task groups and attachments**

Make these targeted replacements in `src/detailMapper.ts`:

```ts
field('评审时间', displayDateFirst(raw, ['reviewedDate', 'reviewDate'])),
field('预计工时', displayHoursFirst(raw, ['estimate', 'estimatedHours'])),
linkedTaskField(raw)
```

For task fields:

```ts
relatedStoryField(raw),
field('进度', displayProgress(raw)),
field('最初预计', displayHoursFirst(raw, ['estimate', 'estimatedHours'])),
field('总计消耗', displayHoursFirst(raw, ['consumed'])),
field('预计剩余', displayHoursFirst(raw, ['left', 'remain', 'remaining'])),
field('预计开始', displayDateFirst(raw, ['estStarted', 'estimateStarted'])),
field('实际开始', displayDateFirst(raw, ['realStarted', 'startedDate'])),
field('截止日期', displayDateFirst(raw, ['deadline', 'dueDate']))
```

Update `withDate()` to format date values:

```ts
function withDate(raw: AnyRecord, nameKeys: string[], dateKeys: string[]): string {
  const name = stringValue(firstValue(raw, nameKeys));
  const date = dateTimeValue(firstValue(raw, dateKeys));
  if (name && date) {
    return `${name} 于 ${date}`;
  }
  return name || date || emptyValue;
}
```

Update `extractAttachments()` return object:

```ts
      size: displayAttachmentSize(file.size),
      addedDate: dateTimeValue(file.addedDate ?? file.addedTime ?? file.date ?? file.openedDate) || '未知',
      url: stringValue(file.url ?? file.webUrl ?? file.downloadUrl, ''),
      extension: stringValue(file.extension ?? file.ext, ''),
      mimeType: stringValue(file.type ?? file.mimeType ?? file.contentType, ''),
```

- [ ] **Step 7: Keep Markdown export compatible**

In `src/markdownExport.ts`, keep existing table output based on `field.value`. Add this test to `src/markdownExport.test.ts`:

```ts
  it('exports linked basic fields as plain text', () => {
    const markdown = detailToMarkdown({
      ...detail(),
      basicFieldGroups: [{ fields: [{ label: '相关研发需求', value: '需求 A', linkType: 'story', linkId: 101 }] }]
    });

    expect(markdown).toContain('| 相关研发需求 | 需求 A |');
    expect(markdown).not.toContain('linkType');
  });
```

If this test already passes after type updates, do not change production code.

- [ ] **Step 8: Verify Task 2 passes**

Run:

```powershell
npx vitest run src/detailMapper.test.ts src/markdownExport.test.ts --reporter=verbose
```

Expected: mapper and markdown export tests pass.

- [ ] **Step 9: Commit Task 2**

Run:

```powershell
git add src/types.ts src/detailMapper.ts src/detailMapper.test.ts src/markdownExport.ts src/markdownExport.test.ts; git commit -m "feat: format detail fields and related links"
```

---

### Task 3: Detail HTML Links, Attachment Preview Action, and Page Search

**Files:**
- Modify: `src/html.ts`
- Modify: `src/html.test.ts`

- [ ] **Step 1: Write failing HTML rendering tests**

Update the first `renderDetailHtml` test detail in `src/html.test.ts` so `basicFieldGroups` contains linked fields:

```ts
        basicFieldGroups: [{ fields: [
          { label: '当前状态', value: '激活' },
          { label: '相关研发需求', value: '需求 A', linkType: 'story', linkId: 101 },
          { label: '关联任务', value: '任务 A、任务 B', links: [
            { type: 'task', id: 201, text: '任务 A' },
            { type: 'task', id: 202, text: '任务 B' }
          ] }
        ] }],
```

Add expectations to the same test:

```ts
    expect(html).toContain('data-detail-link-type="story"');
    expect(html).toContain('data-detail-link-id="101"');
    expect(html).toContain('data-detail-link-type="task"');
    expect(html).toContain('data-detail-link-id="201"');
    expect(html).toContain('<th>预览</th>');
    expect(html).toContain('data-preview-attachment-index="0"');
    expect(html).toContain('previewAttachment');
    expect(html).toContain('data-search-panel');
    expect(html).toContain('data-search-input');
    expect(html).toContain('Ctrl+F');
```

- [ ] **Step 2: Run failing HTML tests**

Run:

```powershell
npx vitest run src/html.test.ts --reporter=verbose
```

Expected: failures show missing link data attributes, missing preview column, and missing search UI.

- [ ] **Step 3: Add field rendering helpers**

In `src/html.ts`, add helpers above `renderDetailHtml()`:

```ts
function renderFieldValue(field: DetailViewModel['basicFieldGroups'][number]['fields'][number]): string {
  if (field.links?.length) {
    return field.links.map((link) => renderDetailLink(link.type, link.id, link.text)).join('、');
  }
  if (field.linkType && typeof field.linkId === 'number') {
    return renderDetailLink(field.linkType, field.linkId, field.value);
  }
  return escapeHtml(field.value);
}

function renderDetailLink(type: string, id: number, text: string): string {
  return `<a href="#" data-detail-link-type="${escapeHtml(type)}" data-detail-link-id="${escapeHtml(id)}">${escapeHtml(text)}</a>`;
}
```

Change field group rendering from `escapeHtml(field.value)` to `renderFieldValue(field)`:

```ts
      <div class="field-row"><strong>${escapeHtml(field.label)}</strong><span>${renderFieldValue(field)}</span></div>`).join('')}
```

- [ ] **Step 4: Render preview column**

Replace attachment table HTML in `src/html.ts` with:

```ts
  const attachments = detail.attachments.length
    ? `<table class="attachment-table"><thead><tr><th>文件名</th><th>大小</th><th>预览</th></tr></thead><tbody>${detail.attachments.map((attachment, index) => `
      <tr><td><a href="#" data-attachment-index="${index}">${escapeHtml(attachment.name)}</a></td><td>${escapeHtml(attachment.size || '暂无')}</td><td><a href="#" data-preview-attachment-index="${index}">预览</a></td></tr>`).join('')}</tbody></table>`
    : '<p>暂无附件</p>';
```

- [ ] **Step 5: Add search UI and styles**

Add these style rules in the `<style>` block:

```css
    .search-panel[hidden] { display: none; }
    .search-panel { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding: 8px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    .search-panel input { flex: 1; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 4px 6px; }
    mark.search-match { color: var(--vscode-editor-foreground); background: var(--vscode-editor-findMatchHighlightBackground); }
    mark.search-current { outline: 1px solid var(--vscode-editor-findMatchBorder); background: var(--vscode-editor-findMatchBackground); }
```

Add this before `<div class="detail-actions">`:

```html
  <div class="search-panel" data-search-panel hidden>
    <label for="zentao-detail-search">Ctrl+F</label>
    <input id="zentao-detail-search" data-search-input type="text" placeholder="搜索当前详情">
    <span data-search-count>0/0</span>
    <button type="button" data-close-search>关闭</button>
  </div>
```

- [ ] **Step 6: Add Webview message listeners**

Add these listeners in the `<script>` block after attachment download binding:

```js
    document.querySelectorAll('[data-preview-attachment-index]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'previewAttachment', index: Number(link.dataset.previewAttachmentIndex) });
      });
    });

    document.querySelectorAll('[data-detail-link-type][data-detail-link-id]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'openDetail', itemType: link.dataset.detailLinkType, id: Number(link.dataset.detailLinkId) });
      });
    });
```

- [ ] **Step 7: Add page-search script**

Add this script logic before the existing keydown listener block, then merge Escape behavior with the existing modal close logic:

```js
    const searchPanel = document.querySelector('[data-search-panel]');
    const searchInput = document.querySelector('[data-search-input]');
    const searchCount = document.querySelector('[data-search-count]');
    const closeSearchButton = document.querySelector('[data-close-search]');
    let searchMatches = [];
    let currentSearchIndex = -1;

    function clearSearchHighlights() {
      document.querySelectorAll('mark.search-match').forEach((mark) => {
        mark.replaceWith(document.createTextNode(mark.textContent || ''));
      });
      document.body.normalize();
      searchMatches = [];
      currentSearchIndex = -1;
      updateSearchCount();
    }

    function updateSearchCount() {
      if (searchCount) {
        searchCount.textContent = searchMatches.length ? `${currentSearchIndex + 1}/${searchMatches.length}` : '0/0';
      }
    }

    function collectTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest('script, style, [data-search-panel], .image-modal')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }
      return nodes;
    }

    function runSearch(query) {
      clearSearchHighlights();
      if (!query) {
        return;
      }
      const lowerQuery = query.toLocaleLowerCase();
      collectTextNodes(document.body).forEach((node) => {
        const text = node.nodeValue || '';
        const lowerText = text.toLocaleLowerCase();
        let start = 0;
        const fragment = document.createDocumentFragment();
        let matched = false;
        while (true) {
          const index = lowerText.indexOf(lowerQuery, start);
          if (index === -1) {
            break;
          }
          matched = true;
          fragment.append(document.createTextNode(text.slice(start, index)));
          const mark = document.createElement('mark');
          mark.className = 'search-match';
          mark.textContent = text.slice(index, index + query.length);
          fragment.append(mark);
          searchMatches.push(mark);
          start = index + query.length;
        }
        if (matched) {
          fragment.append(document.createTextNode(text.slice(start)));
          node.replaceWith(fragment);
        }
      });
      if (searchMatches.length) {
        currentSearchIndex = 0;
        focusSearchMatch(0);
      }
      updateSearchCount();
    }

    function focusSearchMatch(index) {
      searchMatches.forEach((match) => match.classList.remove('search-current'));
      const match = searchMatches[index];
      if (match) {
        match.classList.add('search-current');
        match.scrollIntoView({ block: 'center' });
      }
      updateSearchCount();
    }

    function moveSearch(delta) {
      if (!searchMatches.length) {
        return;
      }
      currentSearchIndex = (currentSearchIndex + delta + searchMatches.length) % searchMatches.length;
      focusSearchMatch(currentSearchIndex);
    }

    function openSearch() {
      searchPanel?.removeAttribute('hidden');
      searchInput?.focus();
      if (searchInput?.value) {
        runSearch(searchInput.value);
      }
    }

    function closeSearch() {
      searchPanel?.setAttribute('hidden', '');
      if (searchInput) {
        searchInput.value = '';
      }
      clearSearchHighlights();
    }

    searchInput?.addEventListener('input', () => runSearch(searchInput.value));
    searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        moveSearch(event.shiftKey ? -1 : 1);
      }
    });
    closeSearchButton?.addEventListener('click', closeSearch);
```

Update keydown listener to:

```js
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (event.key === 'Escape') {
        closeImageModal();
        closeSearch();
      }
    });
```

- [ ] **Step 8: Verify Task 3 passes**

Run:

```powershell
npx vitest run src/html.test.ts --reporter=verbose
```

Expected: all HTML tests pass.

- [ ] **Step 9: Commit Task 3**

Run:

```powershell
git add src/html.ts src/html.test.ts; git commit -m "feat: add detail links search and attachment preview action"
```

---

### Task 4: Attachment Preview Parser

**Files:**
- Create: `src/attachmentPreview.ts`
- Create: `src/attachmentPreview.test.ts`

- [ ] **Step 1: Create failing parser tests**

Create `src/attachmentPreview.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing parser tests**

Run:

```powershell
npx vitest run src/attachmentPreview.test.ts --reporter=verbose
```

Expected: fails because `src/attachmentPreview.ts` does not exist.

- [ ] **Step 3: Implement `src/attachmentPreview.ts`**

Create `src/attachmentPreview.ts`:

```ts
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import MarkdownIt from 'markdown-it';
import { AttachmentViewModel } from './types';
import { escapeHtml, sanitizeRichHtml } from './html';
import { escapedJson } from './detailMapper';

export const maxPreviewBytes = 10 * 1024 * 1024;

type PreviewKind = 'excel' | 'word' | 'pdf' | 'text' | 'markdown' | 'unsupported' | 'error';

export interface AttachmentPreviewResult {
  title: string;
  kind: PreviewKind;
  html: string;
  metadataHtml: string;
  rawJsonHtml: string;
  error?: string;
}

interface WorkbookSheet {
  name: string;
  rows: string[][];
}

export interface AttachmentPreviewAdapters {
  readWorkbook?(bytes: Buffer): WorkbookSheet[];
  convertDocx?(bytes: Buffer): Promise<string>;
  extractPdfText?(bytes: Buffer): Promise<string>;
  renderMarkdown?(markdown: string): string;
}

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

export async function renderAttachmentPreview(
  attachment: AttachmentViewModel,
  bytes: Buffer,
  adapters: AttachmentPreviewAdapters = {}
): Promise<AttachmentPreviewResult> {
  const metadataHtml = renderMetadata(attachment);
  const rawJsonHtml = escapedJson(attachment.raw);
  if (bytes.byteLength > maxPreviewBytes) {
    return previewError(attachment, 'error', '附件超过预览大小限制。', metadataHtml, rawJsonHtml);
  }

  try {
    const extension = attachmentExtension(attachment);
    if (extension === 'txt') {
      return previewOk(attachment, 'text', `<pre>${escapeHtml(decodeText(bytes))}</pre>`, metadataHtml, rawJsonHtml);
    }
    if (extension === 'md' || extension === 'markdown') {
      const html = adapters.renderMarkdown ? adapters.renderMarkdown(decodeText(bytes)) : markdown.render(decodeText(bytes));
      return previewOk(attachment, 'markdown', sanitizeRichHtml(html), metadataHtml, rawJsonHtml);
    }
    if (extension === 'docx') {
      const html = adapters.convertDocx ? await adapters.convertDocx(bytes) : (await mammoth.convertToHtml({ buffer: bytes })).value;
      return previewOk(attachment, 'word', sanitizeRichHtml(html), metadataHtml, rawJsonHtml);
    }
    if (extension === 'doc') {
      return previewError(attachment, 'unsupported', '不支持该 Word 格式预览。', metadataHtml, rawJsonHtml);
    }
    if (extension === 'pdf') {
      const text = adapters.extractPdfText ? await adapters.extractPdfText(bytes) : (await pdfParse(bytes)).text;
      return previewOk(attachment, 'pdf', renderPdfText(text), metadataHtml, rawJsonHtml);
    }
    if (extension === 'xlsx' || extension === 'xls') {
      const sheets = adapters.readWorkbook ? adapters.readWorkbook(bytes) : readWorkbook(bytes);
      return previewOk(attachment, 'excel', renderWorkbook(sheets), metadataHtml, rawJsonHtml);
    }
    return previewError(attachment, 'unsupported', '当前附件类型不支持预览。', metadataHtml, rawJsonHtml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return previewError(attachment, 'error', `附件预览失败：${message}`, metadataHtml, rawJsonHtml);
  }
}

function previewOk(attachment: AttachmentViewModel, kind: PreviewKind, html: string, metadataHtml: string, rawJsonHtml: string): AttachmentPreviewResult {
  return { title: attachment.name || '附件预览', kind, html: html || '<p>暂无可预览内容</p>', metadataHtml, rawJsonHtml };
}

function previewError(attachment: AttachmentViewModel, kind: PreviewKind, error: string, metadataHtml: string, rawJsonHtml: string): AttachmentPreviewResult {
  return { title: attachment.name || '附件预览', kind, error, html: `<p>${escapeHtml(error)}</p>`, metadataHtml, rawJsonHtml };
}

function attachmentExtension(attachment: AttachmentViewModel): string {
  const explicit = (attachment.extension || '').replace(/^\./, '').toLowerCase();
  if (explicit) {
    return explicit;
  }
  const match = attachment.name.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function decodeText(bytes: Buffer): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function renderMetadata(attachment: AttachmentViewModel): string {
  const rows = [
    ['文件名', attachment.name || '未命名附件'],
    ['大小', attachment.size || '暂无'],
    ['添加时间', attachment.addedDate || '未知'],
    ['下载地址', attachment.url || (attachment.id ? `files/${attachment.id}` : '暂无')]
  ];
  return `<table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

function renderPdfText(text: string): string {
  const pages = text.split(/\n\s*\n/g).filter((page) => page.trim());
  if (!pages.length) {
    return '<p>暂无可预览内容</p>';
  }
  return pages.map((page, index) => `<section><h3>第 ${index + 1} 页</h3><pre>${escapeHtml(page)}</pre></section>`).join('');
}

function readWorkbook(bytes: Buffer): WorkbookSheet[] {
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' })
  }));
}

function renderWorkbook(sheets: WorkbookSheet[]): string {
  if (!sheets.length) {
    return '<p>暂无可预览内容</p>';
  }
  return sheets.map((sheet) => `
    <section>
      <h3>${escapeHtml(sheet.name)}</h3>
      <table>${sheet.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>
    </section>`).join('');
}
```

- [ ] **Step 4: Verify parser tests pass**

Run:

```powershell
npx vitest run src/attachmentPreview.test.ts --reporter=verbose
```

Expected: all attachment preview parser tests pass.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add src/attachmentPreview.ts src/attachmentPreview.test.ts; git commit -m "feat: parse attachment previews"
```

---

### Task 5: DetailPanel Preview Webview and Open Detail Messages

**Files:**
- Modify: `src/detailPanel.ts`
- Modify: `src/detailPanel.test.ts`

- [ ] **Step 1: Write failing `DetailPanel` message tests**

In `src/detailPanel.test.ts`, extend the mock panel object pattern so each panel has `webview.html`. Add this test:

```ts
  it('opens linked detail messages through the injected callback', async () => {
    const messageHandlers: Array<(message: { type?: string; itemType?: string; id?: number }) => Promise<void>> = [];
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: {
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: vi.fn((handler: (message: { type?: string; itemType?: string; id?: number }) => Promise<void>) => { messageHandlers.push(handler); }),
        html: ''
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    const openDetail = vi.fn(async () => undefined);
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, { download: vi.fn(), downloadImage: vi.fn(), readBytes: vi.fn() } as any, openDetail);

    panel.show(detail(1));
    await messageHandlers[0]?.({ type: 'openDetail', itemType: 'story', id: 101 });
    await messageHandlers[0]?.({ type: 'openDetail', itemType: 'bug', id: 102 });

    expect(openDetail).toHaveBeenCalledTimes(1);
    expect(openDetail).toHaveBeenCalledWith('story', 101);
  });
```

Add this preview test:

```ts
  it('opens an attachment preview panel with parsed content', async () => {
    const messageHandlers: Array<(message: { type?: string; index?: number }) => Promise<void>> = [];
    const detailWebview = { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn((handler) => { messageHandlers.push(handler); }), html: '' };
    const previewWebview = { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' };
    createWebviewPanel
      .mockReturnValueOnce({ title: '', webview: detailWebview, onDidDispose: vi.fn(), reveal: vi.fn(), dispose: vi.fn() })
      .mockReturnValueOnce({ title: '', webview: previewWebview, onDidDispose: vi.fn(), reveal: vi.fn(), dispose: vi.fn() });
    const attachment = { id: 7, name: 'notes.txt', size: '1K', addedDate: '2026-05-21', raw: {} };
    const attachmentService = { download: vi.fn(), downloadImage: vi.fn(), readBytes: vi.fn(async () => new Uint8Array(Buffer.from('hello'))) };
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentService as any, vi.fn());

    panel.show({ ...detail(1), attachments: [attachment] });
    await messageHandlers[0]?.({ type: 'previewAttachment', index: 0 });

    expect(attachmentService.readBytes).toHaveBeenCalledWith(attachment);
    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
    expect(previewWebview.html).toContain('hello');
    expect(previewWebview.html).toContain('notes.txt');
  });
```

- [ ] **Step 2: Run failing panel tests**

Run:

```powershell
npx vitest run src/detailPanel.test.ts --reporter=verbose
```

Expected: fails because constructor signature and message types do not support `openDetail` or `previewAttachment`.

- [ ] **Step 3: Extend message parsing and constructor**

Update `src/detailPanel.ts` imports:

```ts
import { renderAttachmentPreview } from './attachmentPreview';
import { DetailViewModel, ZenTaoItemType } from './types';
```

Update message union:

```ts
type DetailPanelMessage =
  | { type: 'downloadAttachment'; index: number }
  | { type: 'previewAttachment'; index: number }
  | { type: 'downloadImage'; src: string }
  | { type: 'openDetail'; itemType: ZenTaoItemType; id: number }
  | { type: 'exportMarkdown' };
```

Update constructor:

```ts
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly attachmentService: AttachmentService,
    private readonly openDetail: (type: ZenTaoItemType, id: number) => Promise<void>
  ) {}
```

Update parser:

```ts
  if (message.type === 'previewAttachment' && typeof message.index === 'number') {
    return { type: 'previewAttachment', index: message.index };
  }
  if (message.type === 'openDetail' && (message.itemType === 'story' || message.itemType === 'task') && typeof message.id === 'number' && Number.isFinite(message.id)) {
    return { type: 'openDetail', itemType: message.itemType, id: message.id };
  }
```

- [ ] **Step 4: Handle preview and detail messages**

Inside `panel.webview.onDidReceiveMessage`, add branches:

```ts
        } else if (message.type === 'previewAttachment') {
          const attachment = createdState.detail.attachments[message.index];
          if (attachment) {
            await this.previewAttachment(attachment);
          }
        } else if (message.type === 'openDetail') {
          await this.openDetail(message.itemType, message.id);
```

Add private methods to `DetailPanel`:

```ts
  private async previewAttachment(attachment: DetailViewModel['attachments'][number]): Promise<void> {
    const bytes = await this.attachmentService.readBytes(attachment);
    if (!bytes) {
      return;
    }
    const preview = await renderAttachmentPreview(attachment, Buffer.from(bytes));
    const panel = vscode.window.createWebviewPanel(
      'zentaoAttachmentPreview',
      `预览 ${attachment.name}`,
      vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    panel.webview.html = this.renderAttachmentPreviewHtml(preview);
    panel.reveal(vscode.ViewColumn.One);
  }

  private renderAttachmentPreviewHtml(preview: Awaited<ReturnType<typeof renderAttachmentPreview>>): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(preview.title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; vertical-align: top; }
    pre { white-space: pre-wrap; overflow: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); }
  </style>
</head>
<body>
  <h1>${escapeHtml(preview.title)}</h1>
  <section><h2>附件信息</h2>${preview.metadataHtml}</section>
  <section><h2>预览内容</h2>${preview.html}</section>
  <details><summary>原始附件字段</summary><pre>${preview.rawJsonHtml}</pre></details>
</body>
</html>`;
  }
```

Also import `escapeHtml` from `./html`:

```ts
import { escapeHtml, renderDetailHtml } from './html';
```

- [ ] **Step 5: Update existing tests for constructor signature**

In `src/detailPanel.test.ts`, update every `new DetailPanel({} as any, attachmentService as any)` call to pass a third argument:

```ts
new DetailPanel({} as any, attachmentService as any, vi.fn())
```

For tests that pass `{}` as attachment service, use:

```ts
new DetailPanel({} as any, { download: vi.fn(), downloadImage: vi.fn(), readBytes: vi.fn() } as any, vi.fn())
```

- [ ] **Step 6: Verify Task 5 passes**

Run:

```powershell
npx vitest run src/detailPanel.test.ts --reporter=verbose
```

Expected: all `DetailPanel` tests pass.

- [ ] **Step 7: Commit Task 5**

Run:

```powershell
git add src/detailPanel.ts src/detailPanel.test.ts; git commit -m "feat: preview attachments from detail panel"
```

---

### Task 6: Extension Wiring and Regression Tests

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/extension.test.ts`

- [ ] **Step 1: Write/update extension wiring tests**

In `src/extension.test.ts`, update `DetailPanel` mocks to accept the third constructor argument and capture it:

```ts
let capturedOpenDetail: ((type: 'story' | 'task', id: number) => Promise<void>) | undefined;
vi.doMock('./detailPanel', () => ({
  DetailPanel: class {
    constructor(_extensionUri: unknown, _attachmentService: unknown, openDetail: (type: 'story' | 'task', id: number) => Promise<void>) {
      capturedOpenDetail = openDetail;
    }
    show = vi.fn();
    isOpen = vi.fn(() => true);
    close = vi.fn();
  }
}));
```

Add a focused assertion in the existing detail-opening test after activation and first detail open:

```ts
expect(capturedOpenDetail).toBeTypeOf('function');
```

If there is already a mock in two tests, update both mock blocks the same way.

- [ ] **Step 2: Run failing extension tests**

Run:

```powershell
npx vitest run src/extension.test.ts --reporter=verbose
```

Expected: fails until production wiring passes the new callback.

- [ ] **Step 3: Wire `DetailPanel` constructor**

In `src/extension.ts`, change construction from:

```ts
detailPanel = new DetailPanel(context.extensionUri, new AttachmentService(getClient));
```

to:

```ts
const attachmentService = new AttachmentService(getClient);
detailPanel = new DetailPanel(context.extensionUri, attachmentService, async (linkedType, linkedId) => {
  await openDetail(linkedType, linkedId);
});
```

- [ ] **Step 4: Verify Task 6 passes**

Run:

```powershell
npx vitest run src/extension.test.ts --reporter=verbose
```

Expected: all extension tests pass.

- [ ] **Step 5: Commit Task 6**

Run:

```powershell
git add src/extension.ts src/extension.test.ts; git commit -m "feat: wire detail panel link navigation"
```

---

### Task 7: Focused Integration Verification

**Files:**
- All changed source and tests from Tasks 1-6

- [ ] **Step 1: Run focused test suite**

Run:

```powershell
npx vitest run src/attachmentService.test.ts src/detailMapper.test.ts src/html.test.ts src/attachmentPreview.test.ts src/detailPanel.test.ts src/extension.test.ts src/markdownExport.test.ts --reporter=verbose
```

Expected: all focused tests pass.

- [ ] **Step 2: Run TypeScript compile**

Run:

```powershell
npm run compile
```

Expected: `tsc -p ./` completes with exit code 0.

- [ ] **Step 3: Fix package/module import issues if compile fails**

If compile reports default import issues for `pdf-parse`, replace:

```ts
import pdfParse from 'pdf-parse';
```

with:

```ts
import pdfParse = require('pdf-parse');
```

Then rerun:

```powershell
npm run compile
```

Expected: compile completes with exit code 0.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm run verify
```

Expected: `npm run compile` and `vitest run` both pass.

- [ ] **Step 5: Commit verification fixes**

If Step 3 changed code, run:

```powershell
git add src/attachmentPreview.ts; git commit -m "fix: align pdf parser import with commonjs build"
```

If Step 3 made no changes, do not create a verification-only commit.

---

### Task 8: Manual Smoke Check in VS Code Extension Host

**Files:**
- No required file changes unless smoke testing finds a reproducible bug.

- [ ] **Step 1: Package the extension**

Run:

```powershell
npx @vscode/vsce package --allow-missing-repository --skip-license
```

Expected: a `.vsix` package is created in the workspace root.

- [ ] **Step 2: Manual detail page checks**

Open the extension in an Extension Development Host and verify:

```text
1. Task progress value "17" renders as "17%".
2. Task progress value "17%" remains "17%".
3. Hour values "1", "1h", and "1工时" render as "1h", "1h", and "1工时".
4. Date-time values render as yyyy-mm-dd hh:mm:ss.
5. Pure date values render as yyyy-mm-dd.
6. Related story link opens the story detail panel.
7. Linked task link opens the task detail panel.
8. Ctrl+F opens the in-page search box, highlights matches, Enter moves forward, Shift+Enter moves backward, Escape closes it.
9. Attachment size 2048 renders as 2K, 15.11K remains 15.11K, 1.5MB renders as 1.5M.
10. Preview opens readable content for txt, md, xlsx, docx, and pdf attachments.
11. Legacy doc preview shows "不支持该 Word 格式预览。".
12. Existing attachment download, rich-content image preview, image download, and Markdown export still work.
```

- [ ] **Step 3: Record smoke result in final response**

If all checks pass, state the focused tests, `npm run verify`, package command, and smoke checks that passed. If a manual attachment type is unavailable in the current ZenTao data, state exactly which type was not manually exercised.

---

## Self-Review Checklist

- Spec coverage: Tasks 2-6 cover field formatting, links, search, preview action, parser and panel behavior; Task 7 covers automated verification; Task 8 covers manual smoke checks.
- Placeholder scan: The plan contains concrete file paths, commands, expected results, and code snippets for each implementation task.
- Type consistency: `BasicField.linkType/linkId/links`, `AttachmentViewModel.extension/mimeType`, `AttachmentService.readBytes()`, and `DetailPanel` constructor signatures are introduced before later tasks use them.
- Security coverage: preview content is escaped or sanitized, Webview preview panel has no scripts, message payloads are validated, and preview byte size is capped.
