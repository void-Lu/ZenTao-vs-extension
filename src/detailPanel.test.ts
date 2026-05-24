import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWebviewPanel = vi.fn();

vi.mock('vscode', () => ({
  window: { createWebviewPanel },
  ViewColumn: { One: 1 }
}));

vi.mock('./html', () => ({
  renderDetailHtml: vi.fn(() => '<html></html>')
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

describe('DetailPanel', () => {
  beforeEach(() => {
    createWebviewPanel.mockReset();
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
    const panel = new DetailPanel({} as any, {} as any);

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
    const panel = new DetailPanel({} as any, {} as any);

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
    const panel = new DetailPanel({} as any, {} as any);

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
    const messageHandlers: Array<(message: { type?: string; index?: number }) => Promise<void>> = [];
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: {
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: vi.fn((handler: (message: { type?: string; index?: number }) => Promise<void>) => { messageHandlers.push(handler); }),
        html: ''
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    const attachment = { id: 7, name: 'spec.docx', addedDate: '2026-05-21', raw: {} };
    const otherAttachment = { id: 8, name: 'image.png', addedDate: '2026-05-22', raw: {} };
    const attachmentService = { download: vi.fn() };
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentService as any);

    panel.show({ ...detail(1), attachments: [attachment] });
    panel.show({ ...detail(2, 'task'), attachments: [otherAttachment] });
    await messageHandlers[0]?.({ type: 'downloadAttachment', index: 0 });
    await messageHandlers[1]?.({ type: 'downloadAttachment', index: 0 });

    expect(attachmentService.download).toHaveBeenCalledWith(attachment);
    expect(attachmentService.download).toHaveBeenCalledWith(otherAttachment);
  });
});
