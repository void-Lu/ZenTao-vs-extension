import { describe, expect, it, vi } from 'vitest';
import { ProjectListUnavailableError, ensureProjectId, mapProjectQuickPickItems, parseManualProjectId } from './projectSelection';

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
  it('returns an existing project ID without prompting by default', async () => {
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

  it('forces project selection during reconnect even when an existing project ID is configured', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(async () => ({ label: 'Beta', description: '#8', projectId: 8 })),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [{ id: 8, name: 'Beta' }] })) };

    const projectId = await ensureProjectId({ existingProjectId: 12, forceSelection: true, client, configuration: cfg.config, window });

    expect(projectId).toBe(8);
    expect(cfg.updates).toEqual([{ key: 'projectId', value: 8, target: false }]);
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

  it('preserves an existing project ID when forced selection is cancelled', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(async () => undefined),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [{ id: 7, name: 'Alpha' }] })) };

    const projectId = await ensureProjectId({ existingProjectId: 12, forceSelection: true, client, configuration: cfg.config, window });

    expect(projectId).toBe(12);
    expect(window.showInputBox).not.toHaveBeenCalled();
    expect(cfg.updates).toEqual([]);
  });

  it('does not write a project ID when first-time selection is cancelled', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(async () => undefined),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [{ id: 7, name: 'Alpha' }] })) };

    const projectId = await ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window });

    expect(projectId).toBeUndefined();
    expect(window.showInputBox).not.toHaveBeenCalled();
    expect(cfg.updates).toEqual([]);
  });

  it('reports project list unavailability instead of falling back to manual input', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => { throw new Error('network'); }) };

    await expect(ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window })).rejects.toBeInstanceOf(ProjectListUnavailableError);

    expect(window.showInputBox).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith('无法获取禅道项目列表。');
    expect(cfg.updates).toEqual([]);
  });

  it('reports empty project lists as unavailable', async () => {
    const cfg = configuration();
    const window = {
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn()
    };
    const client = { getProjects: vi.fn(async () => ({ projects: [] })) };

    await expect(ensureProjectId({ existingProjectId: undefined, client, configuration: cfg.config, window })).rejects.toBeInstanceOf(ProjectListUnavailableError);

    expect(window.showQuickPick).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith('没有可选择的禅道项目。');
    expect(cfg.updates).toEqual([]);
  });
});
