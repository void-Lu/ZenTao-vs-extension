import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { renderDetailHtml } from './html';
import { DetailViewModel } from './types';

interface DetailPanelState {
  panel: vscode.WebviewPanel;
  detail: DetailViewModel;
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
      panel.webview.onDidReceiveMessage(async (message: { type?: string; index?: number }) => {
        if (message.type === 'downloadAttachment' && typeof message.index === 'number') {
          const attachment = createdState.detail.attachments[message.index];
          if (attachment) {
            await this.attachmentService.download(attachment);
          }
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
}
