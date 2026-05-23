import { describe, expect, it, vi } from 'vitest';
import { ensureProjectId, mapProjectQuickPickItems, parseManualProjectId } from './projectSelection';

function configuration() {
  const updates: Array<{ key: string; value: unknown; target: boolean }> = [];
  return {
    updates,
    config: {
      update: async (key: string, value: unknown, target: boolean) => {
        updates.push({ key, value, target });
      }
    }
  };
}

describe('mapProjectQuickPickItems', () => {
  it('maps accessible ZenTao projects to QuickPick items', () => {
    const items = mapProjectQuickPickItems({ projects: [{ id: 7, name: 'Alpha' }, { id: 8, name: 'Beta' }] });

    expect(items).toEqual([
      { label: 'Alpha', description: '#7', projectId: 7 },
      { label: 'Beta', description: '#8', projectId: 8 }
    ]);
  });
});

describe('parseManualProjectId', () => {
  it('accepts positive integer text', () => {
    expect(parseManualProjectId(' 42 ')).toBe(42);
  });

  it('rejects missing or invalid project ID text', () => {
    for (const value of [undefined, '', '0', '-1', '1.5', 'abc']) {
      expect(parseManualProjectId(value)).toBeUndefined();
    }
  });
});

describe('ensureProjectId', () => {
  it('returns an existing project ID without prompting', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn() };

    const projectId = await ensureProjectId({ existingProjectId: 12, client, configuration: cfg.config, window });

    expect(projectId).toBe(12);
    expect(client.getProjects).not.toHaveBeenCalled();
    expect(window.showQuickPick).not.toHaveBeenCalled();
    expect(cfg.updates).toEqual([]);
  });

  it('writes the selected accessible project ID', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(async () => ({ label: 'Alpha', description: '#7', projectId: 7 })),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [{ id: 7, name: 'Alpha' }] })) };

    const projectId = await ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window });

    expect(projectId).toBe(7);
    expect(window.showQuickPick).toHaveBeenCalledWith([{ label: 'Alpha', description: '#7', projectId: 7 }], {
      ignoreFocusOut: true,
      placeHolder: '选择禅道项目'
    });
    expect(cfg.updates).toEqual([{ key: 'projectId', value: 7, target: false }]);
  });

  it('falls back to manual project ID when selection is cancelled', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(async () => undefined),
      showInputBox: vi.fn(async () => '9'),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [{ id: 7, name: 'Alpha' }] })) };

    const projectId = await ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window });

    expect(projectId).toBe(9);
    expect(window.showInputBox).toHaveBeenCalledWith({ prompt: '输入禅道项目 ID', ignoreFocusOut: true });
    expect(cfg.updates).toEqual([{ key: 'projectId', value: 9, target: false }]);
  });

  it('falls back to manual project ID when project listing fails', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(async () => '10'),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => { throw new Error('network'); }) };

    const projectId = await ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window });

    expect(projectId).toBe(10);
    expect(window.showWarningMessage).toHaveBeenCalledWith('无法获取禅道项目列表，请手动输入项目 ID。');
    expect(cfg.updates).toEqual([{ key: 'projectId', value: 10, target: false }]);
  });

  it('rejects invalid manual project IDs without writing configuration', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(async () => undefined),
      showInputBox: vi.fn(async () => 'abc'),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [] })) };

    const projectId = await ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window });

    expect(projectId).toBeUndefined();
    expect(window.showWarningMessage).toHaveBeenCalledWith('ZenTao project ID must be a positive integer.');
    expect(cfg.updates).toEqual([]);
  });
});
