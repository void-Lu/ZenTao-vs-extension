import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { renderDetailHtml } from './html';
import { DetailViewModel } from './types';

export class DetailPanel {
  private panel: vscode.WebviewPanel | undefined;
  private currentDetail: DetailViewModel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly attachmentService: AttachmentService
  ) {}

  show(detail: DetailViewModel): void {
    this.currentDetail = detail;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'zentaoDetail',
        '禅道详情',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.currentDetail = undefined;
      });
      this.panel.webview.onDidReceiveMessage(async (message: { type?: string; index?: number }) => {
        if (message.type === 'downloadAttachment' && this.currentDetail && typeof message.index === 'number') {
          const attachment = this.currentDetail.attachments[message.index];
          if (attachment) {
            await this.attachmentService.download(attachment);
          }
        }
      });
    }

    this.panel.title = `#${detail.id} ${detail.title}`;
    const nonce = crypto.randomBytes(16).toString('base64');
    this.panel.webview.html = renderDetailHtml({
      detail,
      nonce,
      cspSource: this.panel.webview.cspSource
    });
    this.panel.reveal(vscode.ViewColumn.One);
  }

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  close(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.currentDetail = undefined;
  }
}
