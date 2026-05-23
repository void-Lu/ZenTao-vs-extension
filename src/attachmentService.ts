import * as path from 'path';
import * as vscode from 'vscode';
import { AttachmentViewModel } from './types';
import { ZenTaoClient } from './zentaoClient';

export class AttachmentService {
  constructor(private readonly getClient: () => ZenTaoClient) {}

  async download(attachment: AttachmentViewModel): Promise<void> {
    const defaultName = attachment.name || `zentao-attachment-${attachment.id ?? Date.now()}`;
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultName) });
    if (!target) {
      return;
    }

    const requestPath = attachment.url
      ? attachment.url.replace(/^.*api\.php\/v1\//, '')
      : attachment.id
        ? `files/${attachment.id}`
        : '';

    if (!requestPath) {
      vscode.window.showWarningMessage('当前附件缺少可下载地址。');
      return;
    }

    const bytes = await this.getClient().downloadByPath(requestPath);
    await vscode.workspace.fs.writeFile(target, bytes);
    vscode.window.showInformationMessage(`附件已保存：${path.basename(target.fsPath)}`);
  }
}
