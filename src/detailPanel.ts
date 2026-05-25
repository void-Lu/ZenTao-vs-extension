import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { renderAttachmentPreview } from './attachmentPreview';
import { AttachmentService } from './attachmentService';
import { escapeHtml, renderDetailHtml } from './html';
import { detailToMarkdown, markdownFileName } from './markdownExport';
import { DetailViewModel, ZenTaoItemType } from './types';

interface DetailPanelState {
  panel: vscode.WebviewPanel;
  detail: DetailViewModel;
}

type DetailPanelMessage =
  | { type: 'downloadAttachment'; index: number }
  | { type: 'downloadImage'; src: string }
  | { type: 'exportMarkdown' }
  | { type: 'previewAttachment'; index: number }
  | { type: 'openDetail'; itemType: ZenTaoItemType; id: number };

function asMessageRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function isZenTaoItemType(value: unknown): value is ZenTaoItemType {
  return value === 'story' || value === 'task';
}

function parseDetailPanelMessage(value: unknown): DetailPanelMessage | undefined {
  const message = asMessageRecord(value);
  if (message.type === 'downloadAttachment' && typeof message.index === 'number') {
    return { type: 'downloadAttachment', index: message.index };
  }
  if (message.type === 'downloadImage' && typeof message.src === 'string') {
    return { type: 'downloadImage', src: message.src };
  }
  if (message.type === 'exportMarkdown') {
    return { type: 'exportMarkdown' };
  }
  if (message.type === 'previewAttachment' && typeof message.index === 'number') {
    return { type: 'previewAttachment', index: message.index };
  }
  if (
    message.type === 'openDetail'
    && isZenTaoItemType(message.itemType)
    && typeof message.id === 'number'
    && Number.isFinite(message.id)
  ) {
    return { type: 'openDetail', itemType: message.itemType, id: message.id };
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DetailPanel {
  private readonly panels = new Map<string, DetailPanelState>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly attachmentService: AttachmentService,
    private readonly openDetail: (type: ZenTaoItemType, id: number) => Promise<void> = async (type, id) => {
      await vscode.commands.executeCommand('zentao.openDetail', type, id);
    }
  ) {}

  show(detail: DetailViewModel): void {
    const key = `${detail.type}:${detail.id}`;
    let state = this.panels.get(key);
    if (!state) {
      const panel = vscode.window.createWebviewPanel(
        'zentaoDetail',
        '禅道详情',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      const createdState = { panel, detail };
      state = createdState;
      this.panels.set(key, createdState);
      panel.onDidDispose(() => {
        this.panels.delete(key);
      });
      panel.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
        const message = parseDetailPanelMessage(rawMessage);
        if (!message) {
          return;
        }
        if (message.type === 'downloadAttachment' && typeof message.index === 'number') {
          const attachment = createdState.detail.attachments[message.index];
          if (attachment) {
            await this.attachmentService.download(attachment);
          }
        } else if (message.type === 'downloadImage') {
          await this.attachmentService.downloadImage(message.src);
        } else if (message.type === 'exportMarkdown') {
          await this.exportMarkdown(createdState.detail);
        } else if (message.type === 'previewAttachment') {
          const attachment = createdState.detail.attachments[message.index];
          if (attachment) {
            await this.previewAttachment(attachment);
          }
        } else if (message.type === 'openDetail') {
          await this.openDetail(message.itemType, message.id);
        }
      });
    } else {
      state.detail = detail;
    }

    state.panel.title = `#${detail.id} ${detail.title}`;
    const nonce = crypto.randomBytes(16).toString('base64');
    state.panel.webview.html = renderDetailHtml({
      detail,
      nonce,
      cspSource: state.panel.webview.cspSource
    });
    state.panel.reveal(vscode.ViewColumn.One);
  }

  isOpen(): boolean {
    return this.panels.size > 0;
  }

  close(): void {
    for (const state of Array.from(this.panels.values())) {
      state.panel.dispose();
    }
    this.panels.clear();
  }

  private async exportMarkdown(detail: DetailViewModel): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage('请先打开一个工作区，再导出 MD 文件。');
      return;
    }

    try {
      const directory = vscode.Uri.joinPath(workspaceFolder.uri, 'requirements');
      await vscode.workspace.fs.createDirectory(directory);
      const target = await this.nextAvailableMarkdownUri(directory, markdownFileName(detail));
      await vscode.workspace.fs.writeFile(target, Buffer.from(detailToMarkdown(detail), 'utf8'));
      vscode.window.showInformationMessage(`详情已导出：${vscode.workspace.asRelativePath(target)}`);
    } catch (error) {
      vscode.window.showErrorMessage(`导出 MD 失败：${errorMessage(error)}`);
    }
  }

  private async previewAttachment(attachment: DetailViewModel['attachments'][number]): Promise<void> {
    const bytes = await this.attachmentService.readBytes(attachment);
    if (!bytes) {
      return;
    }

    let preview;
    try {
      preview = await renderAttachmentPreview(attachment, Buffer.from(bytes));
    } catch (error) {
      vscode.window.showErrorMessage(`附件预览失败：${errorMessage(error)}`);
      return;
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    const panel = vscode.window.createWebviewPanel(
      'zentaoAttachmentPreview',
      `附件预览：${attachment.name}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
      const message = asMessageRecord(rawMessage);
      if (message.type === 'exportMarkdown') {
        await this.exportPreviewMarkdown(attachment, preview);
      }
    });
    panel.webview.html = this.renderAttachmentPreviewHtml(attachment, preview, nonce);
  }

  private renderAttachmentPreviewHtml(
    attachment: DetailViewModel['attachments'][number],
    preview: Awaited<ReturnType<typeof renderAttachmentPreview>>,
    nonce: string
  ): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(attachment.name)}</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; }
    th { background: var(--vscode-editor-background); }
    pre { overflow: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 3px; padding: 5px 10px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .detail-actions { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .search-panel[hidden] { display: none; }
    .search-panel { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding: 8px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    .search-panel input { flex: 1; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 4px 6px; }
    .search-panel button { padding: 3px 6px; font-size: 12px; }
    mark.search-match { color: var(--vscode-editor-foreground); background: var(--vscode-editor-findMatchHighlightBackground); }
    mark.search-current { outline: 1px solid var(--vscode-editor-findMatchBorder); background: var(--vscode-editor-findMatchBackground); }
  </style>
</head>
<body>
  <div class="search-panel" data-search-panel hidden>
    <label for="zentao-preview-search">Ctrl+F</label>
    <input id="zentao-preview-search" data-search-input type="text" placeholder="搜索">
    <span data-search-count>0/0</span>
    <button type="button" data-search-prev title="上一个 (Shift+Enter)">&#x25B2;</button>
    <button type="button" data-search-next title="下一个 (Enter)">&#x25BC;</button>
    <button type="button" data-close-search>关闭</button>
  </div>
  <div class="detail-actions"><button type="button" data-export-markdown>导出 MD</button></div>
  <h1>${escapeHtml(preview.title || attachment.name)}</h1>
  <section><h2>附件信息</h2>${preview.metadataHtml}</section>
  <section><h2>预览内容</h2>${preview.html}</section>
  <details><summary>原始字段</summary><pre>${preview.rawJsonHtml}</pre></details>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelector('[data-export-markdown]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportMarkdown' });
    });

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
        searchCount.textContent = searchMatches.length ? String(currentSearchIndex + 1) + '/' + String(searchMatches.length) : '0/0';
      }
    }

    function collectTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest('script, style, [data-search-panel]')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) { nodes.push(walker.currentNode); }
      return nodes;
    }

    function runSearch(query) {
      clearSearchHighlights();
      if (!query) return;
      const lowerQuery = query.toLocaleLowerCase();
      collectTextNodes(document.body).forEach((node) => {
        const text = node.nodeValue || '';
        const lowerText = text.toLocaleLowerCase();
        let start = 0;
        const fragment = document.createDocumentFragment();
        let matched = false;
        while (true) {
          const index = lowerText.indexOf(lowerQuery, start);
          if (index === -1) break;
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
      if (searchMatches.length) { currentSearchIndex = 0; focusSearchMatch(0); }
      updateSearchCount();
    }

    function focusSearchMatch(index) {
      searchMatches.forEach((m) => m.classList.remove('search-current'));
      const match = searchMatches[index];
      if (match) { match.classList.add('search-current'); match.scrollIntoView({ block: 'center' }); }
      updateSearchCount();
    }

    function moveSearch(delta) {
      if (!searchMatches.length) return;
      currentSearchIndex = (currentSearchIndex + delta + searchMatches.length) % searchMatches.length;
      focusSearchMatch(currentSearchIndex);
    }

    function openSearch() { searchPanel?.removeAttribute('hidden'); searchInput?.focus(); if (searchInput?.value) runSearch(searchInput.value); }
    function closeSearch() { searchPanel?.setAttribute('hidden', ''); if (searchInput) searchInput.value = ''; clearSearchHighlights(); }

    searchInput?.addEventListener('input', () => runSearch(searchInput.value));
    searchInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); moveSearch(event.shiftKey ? -1 : 1); } });
    closeSearchButton?.addEventListener('click', closeSearch);
    document.querySelector('[data-search-prev]')?.addEventListener('click', () => moveSearch(-1));
    document.querySelector('[data-search-next]')?.addEventListener('click', () => moveSearch(1));

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); return; }
      if (event.key === 'Escape') { closeSearch(); }
    });
  </script>
</body>
</html>`;
  }

  private async exportPreviewMarkdown(
    attachment: DetailViewModel['attachments'][number],
    preview: Awaited<ReturnType<typeof renderAttachmentPreview>>
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage('请先打开一个工作区，再导出 MD 文件。');
      return;
    }

    try {
      const directory = vscode.Uri.joinPath(workspaceFolder.uri, 'requirements');
      await vscode.workspace.fs.createDirectory(directory);
      const baseName = attachment.name.replace(/\.[^.]+$/, '');
      const fileName = `${baseName}.md`;
      const target = await this.nextAvailableMarkdownUri(directory, fileName);

      const lines: string[] = [`# ${attachment.name}`, ''];
      if (attachment.size) { lines.push(`- **大小**：${attachment.size}`); }
      if (attachment.addedDate) { lines.push(`- **添加时间**：${attachment.addedDate}`); }
      lines.push('', '## 预览内容', '');

      // Strip HTML tags for a plain-text markdown export
      const textContent = preview.html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|section|h[1-6]|tr)[^>]*>/gi, '\n')
        .replace(/<\/?(td|th)[^>]*>/gi, ' | ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      lines.push(textContent);

      await vscode.workspace.fs.writeFile(target, Buffer.from(lines.join('\n'), 'utf8'));
      vscode.window.showInformationMessage(`预览已导出：${vscode.workspace.asRelativePath(target)}`);
    } catch (error) {
      vscode.window.showErrorMessage(`导出 MD 失败：${errorMessage(error)}`);
    }
  }

  private async nextAvailableMarkdownUri(directory: vscode.Uri, fileName: string): Promise<vscode.Uri> {
    const base = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
    for (let index = 0; index < 100; index++) {
      const candidateName = index === 0 ? fileName : `${base}-${index}.md`;
      const candidate = vscode.Uri.joinPath(directory, candidateName);
      try {
        await vscode.workspace.fs.stat(candidate);
      } catch {
        return candidate;
      }
    }
    return vscode.Uri.joinPath(directory, `${base}-${Date.now()}.md`);
  }
}
