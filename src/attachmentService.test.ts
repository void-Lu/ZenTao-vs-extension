import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { AttachmentService } from './attachmentService';
import { ZenTaoClient } from './zentaoClient';

const writes: Array<{ path: string; bytes: number[] }> = [];

vi.mock('vscode', () => ({
  window: {
    showSaveDialog: vi.fn(async () => ({ fsPath: 'saved.txt' })),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn()
  },
  Uri: {
    file: (value: string) => ({ fsPath: value })
  },
  workspace: {
    fs: {
      writeFile: vi.fn(async (target: { fsPath: string }, bytes: Uint8Array) => {
        writes.push({ path: target.fsPath, bytes: [...bytes] });
      })
    }
  }
}));

describe('AttachmentService', () => {
  beforeEach(() => {
    writes.length = 0;
    vi.mocked(vscode.window.showSaveDialog).mockClear();
    vi.mocked(vscode.window.showWarningMessage).mockClear();
    vi.mocked(vscode.window.showInformationMessage).mockClear();
    vi.unstubAllGlobals();
  });

  it('uses the current ZenTao client when downloading attachments', async () => {
    const firstClient = { downloadByPath: vi.fn(async () => new Uint8Array([1])) };
    const secondClient = { downloadByPath: vi.fn(async () => new Uint8Array([2])) };
    let currentClient = firstClient;
    const service = new AttachmentService(() => currentClient as unknown as ZenTaoClient);

    await service.download({ id: 10, name: 'first.txt', addedDate: '-', raw: {} });
    currentClient = secondClient;
    await service.download({ id: 11, name: 'second.txt', addedDate: '-', raw: {} });

    expect(firstClient.downloadByPath).toHaveBeenCalledWith('files/10');
    expect(secondClient.downloadByPath).toHaveBeenCalledWith('files/11');
    expect(writes.map((write) => write.bytes)).toEqual([[1], [2]]);
  });

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

  it('downloads http images to a selected local file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([3, 4]).buffer
    })));
    const service = new AttachmentService(() => ({ downloadByPath: vi.fn() }) as unknown as ZenTaoClient);

    await service.downloadImage('https://zentao.example.com/uploads/screenshot.png');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://zentao.example.com/uploads/screenshot.png', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(writes).toEqual([{ path: 'saved.txt', bytes: [3, 4] }]);
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('shows a warning when an image download request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const service = new AttachmentService(() => ({ downloadByPath: vi.fn() }) as unknown as ZenTaoClient);

    await service.downloadImage('https://zentao.example.com/uploads/screenshot.png');

    expect(writes).toEqual([]);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('图片下载失败：network down');
  });

  it('rejects non-http image URLs before downloading', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const service = new AttachmentService(() => ({ downloadByPath: vi.fn() }) as unknown as ZenTaoClient);

    await service.downloadImage('javascript:alert(1)');

    expect(fetch).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('当前图片地址不支持下载。');
  });
});
