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

  async downloadImage(src: string): Promise<void> {
    const url = this.httpUrl(src);
    if (!url) {
      vscode.window.showWarningMessage('当前图片地址不支持下载。');
      return;
    }

    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(this.defaultImageName(url)) });
    if (!target) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        vscode.window.showWarningMessage(`图片下载失败：HTTP ${response.status}`);
        return;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      await vscode.workspace.fs.writeFile(target, bytes);
      vscode.window.showInformationMessage(`图片已保存：${path.basename(target.fsPath)}`);
    } catch (error) {
      vscode.window.showWarningMessage(this.imageDownloadErrorMessage(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  private httpUrl(src: string): URL | undefined {
    try {
      const url = new URL(src);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
    } catch {
      return undefined;
    }
  }

  private defaultImageName(url: URL): string {
    const basename = path.posix.basename(url.pathname) || `zentao-image-${Date.now()}`;
    let decoded = basename;
    try {
      decoded = decodeURIComponent(basename);
    } catch {
      decoded = basename;
    }
    return decoded.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `zentao-image-${Date.now()}`;
  }

  private imageDownloadErrorMessage(error: unknown): string {
    if (error instanceof Error && error.name === 'AbortError') {
      return '图片下载超时。';
    }
    const message = error instanceof Error ? error.message : String(error);
    return `图片下载失败：${message}`;
  }
}
