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

  it('closes the active webview panel', async () => {
    const dispose = vi.fn();
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose
    });
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, {} as any);

    panel.show(detail(1));
    panel.close();

    expect(dispose).toHaveBeenCalledOnce();
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

  it('updates the current detail in the existing panel without creating another panel', async () => {
    const reveal = vi.fn();
    const panelObject = {
      title: '',
      webview: { cspSource: 'vscode-resource:', onDidReceiveMessage: vi.fn(), html: '' },
      onDidDispose: vi.fn(),
      reveal,
      dispose: vi.fn()
    };
    createWebviewPanel.mockReturnValue(panelObject);
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, {} as any);

    panel.show(detail(1));
    panel.show(detail(2, 'task'));

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panelObject.title).toBe('#2 Item 2');
    expect(reveal).toHaveBeenCalledTimes(2);
  });
  it('downloads the selected attachment from a webview message', async () => {
    let messageHandler: ((message: { type?: string; index?: number }) => Promise<void>) | undefined;
    createWebviewPanel.mockReturnValue({
      title: '',
      webview: {
        cspSource: 'vscode-resource:',
        onDidReceiveMessage: vi.fn((handler: (message: { type?: string; index?: number }) => Promise<void>) => { messageHandler = handler; }),
        html: ''
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn()
    });
    const attachment = { id: 7, name: 'spec.docx', addedDate: '2026-05-21', raw: {} };
    const attachmentService = { download: vi.fn() };
    const { DetailPanel } = await import('./detailPanel');
    const panel = new DetailPanel({} as any, attachmentService as any);

    panel.show({ ...detail(1), attachments: [attachment] });
    await messageHandler?.({ type: 'downloadAttachment', index: 0 });

    expect(attachmentService.download).toHaveBeenCalledWith(attachment);
  });
});
