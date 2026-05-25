import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWebviewPanel = vi.fn();
const createDirectory = vi.fn();
const writeFile = vi.fn();
const stat = vi.fn();
const showWarningMessage = vi.fn();
const showInformationMessage = vi.fn();
const showErrorMessage = vi.fn();

vi.mock('vscode', () => ({
  window: { createWebviewPanel, showWarningMessage, showInformationMessage, showErrorMessage },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: 'C:/workspace' } }],
    fs: { createDirectory, writeFile, stat },
    asRelativePath: (uri: { fsPath: string }) => uri.fsPath
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: [base.fsPath, ...parts].join('/') })
  },
  ViewColumn: { One: 1, Beside: 2 }
}));

vi.mock('./html', () => ({
  escapeHtml: (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'),
  sanitizeRichHtml: (value: unknown) => String(value ?? ''),
  renderDetailHtml: vi.fn(() => '<html></html>')
}));

vi.mock('./markdownExport', () => ({
  detailToMarkdown: vi.fn(() => '# exported\n'),
  markdownFileName: vi.fn(() => 'story-1-Item 1.md')
}));

function detail(id: number, type: 'story' | 'task' = 'story') {
  return {
    id,
    type,
    title: `Item ${id}`,
    basicFieldGroups: [],
    contentSections: [],
    attachments: [],
    activities: [],
    raw: {}
  };
}

function attachmentServiceFake() {
  return { download: vi.fn(), downloadImage: vi.fn(), readBytes: vi.fn() };
}

describe('DetailPanel', () => {
  beforeEach(() => {
    createWebviewPanel.mockReset();
    createDirectory.mockReset();
    writeFile.mockReset();
    stat.mockReset();
    stat.mockRejectedValue(new Error('missing'));
    showWarningMessage.mockReset();
    showInformationMessage.mockReset();
    showErrorMessage.mockReset();
  });

  it('closes all open webview panels', async () => {
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    createWebviewPanel.mockReturnValueOnce({
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: firstDispose
    }).mockReturnValueOnce({
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: secondDispose
    });
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentServiceFake() as any, vi.fn());

    panel.show(detail(1));
    panel.show(detail(2, 'task'));
    panel.close();

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('reports closed state after the webview is disposed', async () => {
    let disposeHandler: (() => void) | undefined;
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn((handler: () => void) => { disposeHandler = handler; }),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentServiceFake() as any, vi.fn());

    panel.show(detail(1));
    expect(panel.isOpen()).toBe(true);
    disposeHandler?.();

    expect(panel.isOpen()).toBe(false);
  });

  it('opens different details in separate panels and reuses an existing panel for the same detail', async () => {
    const firstReveal = vi.fn();
    const secondReveal = vi.fn();
    const firstPanel = {
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn(),
      reveal: firstReveal,
      dispose: vi.fn()
    };
    const secondPanel = {
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn(),
      reveal: secondReveal,
      dispose: vi.fn()
    };
    createWebviewPanel.mockReturnValueOnce(firstPanel).mockReturnValueOnce(secondPanel);
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentServiceFake() as any, vi.fn());

    panel.show(detail(1));
    panel.show(detail(2, 'task'));
    panel.show({ ...detail(1), title: 'Updated Item 1' });

    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
    expect(firstPanel.title).toBe('#1 Updated Item 1');
    expect(secondPanel.title).toBe('#2 Item 2');
    expect(firstReveal).toHaveBeenCalledTimes(2);
    expect(secondReveal).toHaveBeenCalledTimes(1);
  });
  it('downloads attachments from the detail that owns the posting webview', async () => {
    const messageHandlers: Array<(message: { type?: string; index?: number; src?: string }) => Promise<void>> = [];
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: {
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: vi.fn((handler: (message: { type?: string; index?: number; src?: string }) => Promise<void>) => { messageHandlers.push(handler); }),
        html: ''
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    const attachment = { id: 7, name: 'spec.docx', addedDate: '2026-05-21', raw: {} };
    const otherAttachment = { id: 8, name: 'image.png', addedDate: '2026-05-22', raw: {} };
    const attachmentService = attachmentServiceFake();
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentService as any, vi.fn());

    panel.show({ ...detail(1), attachments: [attachment] });
    panel.show({ ...detail(2, 'task'), attachments: [otherAttachment] });
    await messageHandlers[0]?.({ type: 'downloadAttachment', index: 0 });
    await messageHandlers[1]?.({ type: 'downloadAttachment', index: 0 });

    expect(attachmentService.download).toHaveBeenCalledWith(attachment);
    expect(attachmentService.download).toHaveBeenCalledWith(otherAttachment);
  });

  it('downloads rich content images and exports markdown from the detail that owns the posting webview', async () => {
    const messageHandlers: Array<(message: { type?: string; index?: number; src?: string }) => Promise<void>> = [];
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: {
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: vi.fn((handler: (message: { type?: string; index?: number; src?: string }) => Promise<void>) => { messageHandlers.push(handler); }),
        html: ''
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    const attachmentService = attachmentServiceFake();
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentService as any, vi.fn());

    panel.show(detail(1));
    await messageHandlers[0]?.({ type: 'downloadImage', src: 'https://zentao.example.com/file.png' });
    await messageHandlers[0]?.({ type: 'exportMarkdown' });

    expect(attachmentService.downloadImage).toHaveBeenCalledWith('https://zentao.example.com/file.png');
    expect(createDirectory).toHaveBeenCalledWith({ fsPath: 'C:/workspace/requirements' });
    expect(writeFile).toHaveBeenCalledWith(
      { fsPath: 'C:/workspace/requirements/story-1-Item 1.md' },
      Buffer.from('# exported\n', 'utf8')
    );
  });

  it('shows an error message when markdown export fails', async () => {
    const messageHandlers: Array<(message: { type?: string; index?: number; src?: string }) => Promise<void>> = [];
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: {
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: vi.fn((handler: (message: { type?: string; index?: number; src?: string }) => Promise<void>) => { messageHandlers.push(handler); }),
        html: ''
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    writeFile.mockRejectedValue(new Error('disk full'));
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentServiceFake() as any, vi.fn());

    panel.show(detail(1));
    await messageHandlers[0]?.({ type: 'exportMarkdown' });

    expect(showErrorMessage).toHaveBeenCalledWith('导出 MD 失败：disk full');
  });

  it('opens linked story and task details from webview messages', async () => {
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
    const openDetail = vi.fn();
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentServiceFake() as any, openDetail);

    panel.show(detail(1));
    await messageHandlers[0]?.({ type: 'openDetail', itemType: 'story', id: 101 });
    await messageHandlers[0]?.({ type: 'openDetail', itemType: 'bug', id: 102 });

    expect(openDetail).toHaveBeenCalledOnce();
    expect(openDetail).toHaveBeenCalledWith('story', 101);
  });

  it('previews attachments from the detail that owns the posting webview', async () => {
    const messageHandlers: Array<(message: { type?: string; index?: number }) => Promise<void>> = [];
    const detailWebview = {
      cspSource: 'vscode-resource:',
      onDidReceiveMessage: vi.fn((handler: (message: { type?: string; index?: number }) => Promise<void>) => { messageHandlers.push(handler); }),
      html: ''
    };
    const previewWebview = { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' };
    const previewReveal = vi.fn();
    createWebviewPanel.mockReturnValueOnce({
      title: '',
      webview: detailWebview,
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    }).mockReturnValueOnce({
      title: '',
      webview: previewWebview,
      onDidDispose: vi.fn(),
      reveal: previewReveal,
      dispose: vi.fn()
    });
    const attachment = { id: 7, name: 'notes.txt', addedDate: '2026-05-25', raw: { id: 7, name: 'notes.txt' } };
    const attachmentService = attachmentServiceFake();
    attachmentService.readBytes.mockResolvedValue(Buffer.from('Hello preview', 'utf8'));
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentService as any, vi.fn());

    panel.show({ ...detail(1), attachments: [attachment] });
    await messageHandlers[0]?.({ type: 'previewAttachment', index: 0 });

    expect(attachmentService.readBytes).toHaveBeenCalledWith(attachment);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      'zentaoAttachmentPreview',
      '附件预览：notes.txt',
      2,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    expect(previewWebview.html).toContain('notes.txt');
    expect(previewWebview.html).toContain('Hello preview');
  });
});
