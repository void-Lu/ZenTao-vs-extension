import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { renderDetailHtml } from './html';
import { detailToMarkdown, markdownFileName } from './markdownExport';
import { DetailViewModel } from './types';

interface DetailPanelState {
  panel: vscode.WebviewPanel;
  detail: DetailViewModel;
}

type DetailPanelMessage =
  | { type: 'downloadAttachment'; index: number }
  | { type: 'downloadImage'; src: string }
  | { type: 'exportMarkdown' };

function asMessageRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
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
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DetailPanel {
  private readonly panels = new Map<string, DetailPanelState>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly attachmentService: AttachmentService
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
