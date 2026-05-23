import { describe, expect, it, vi } from 'vitest';
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
});
