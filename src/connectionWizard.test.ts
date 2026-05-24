import { describe, expect, it, vi } from 'vitest';
import { runConnectionWizard } from './connectionWizard';

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

function windowWithInputs(inputs: Array<string | undefined>, quickPickItems: Array<{ label: string; description: string; projectId: number } | undefined>) {
  return {
    showInputBox: vi.fn(async () => inputs.shift()),
    showQuickPick: vi.fn(async () => quickPickItems.shift()),
    showWarningMessage: vi.fn(async () => undefined)
  };
}

describe('runConnectionWizard', () => {
  it('collects first-time connection data and writes settings only after login and project selection succeed', async () => {
    const cfg = configuration();
    const window = windowWithInputs(['https://zentao.example.com', 'alice', 'secret'], [
      { label: 'Alpha', description: '#7', projectId: 7 }
    ]);
    const storeLogin = vi.fn(async () => undefined);
    const client = {
      login: vi.fn(async () => 'token-1'),
      getProjects: vi.fn(async () => ({ projects: [{ id: 7, name: 'Alpha' }] }))
    };

    const result = await runConnectionWizard({
      mode: 'firstTime',
      window,
      configuration: cfg.config,
      createClient: vi.fn(() => client),
      storeLogin
    });

    expect(result).toEqual({ baseUrl: 'https://zentao.example.com/', projectId: 7 });
    expect(client.login).toHaveBeenCalledWith('alice', 'secret');
    expect(storeLogin).toHaveBeenCalledWith('alice', 'secret', 'token-1', 'https://zentao.example.com/');
    expect(cfg.updates).toEqual([
      { key: 'baseUrl', value: 'https://zentao.example.com/', target: false },
      { key: 'projectId', value: 7, target: false }
    ]);
  });

  it('rejects invalid base URLs and asks again without writing partial values', async () => {
    const cfg = configuration();
    const window = windowWithInputs(['https://user:pass@zentao.example.com', 'https://zentao.example.com', 'alice', 'secret'], [
      { label: 'Alpha', description: '#7', projectId: 7 }
    ]);
    const client = {
      login: vi.fn(async () => 'token-1'),
      getProjects: vi.fn(async () => ({ projects: [{ id: 7, name: 'Alpha' }] }))
    };

    await runConnectionWizard({
      mode: 'firstTime',
      window,
      configuration: cfg.config,
      createClient: vi.fn(() => client),
      storeLogin: vi.fn(async () => undefined)
    });

    expect(window.showWarningMessage).toHaveBeenCalledWith('ZenTao URL must not include credentials.');
    expect(cfg.updates[0]).toEqual({ key: 'baseUrl', value: 'https://zentao.example.com/', target: false });
  });

  it('stops without writes when a first-time prompt is cancelled', async () => {
    const cfg = configuration();
    const window = windowWithInputs(['https://zentao.example.com', undefined], []);
    const createClient = vi.fn();
    const storeLogin = vi.fn();

    const result = await runConnectionWizard({
      mode: 'firstTime',
      window,
      configuration: cfg.config,
      createClient,
      storeLogin
    });

    expect(result).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
    expect(storeLogin).not.toHaveBeenCalled();
    expect(cfg.updates).toEqual([]);
  });

  it('restarts first-time setup from URL when the project list is unavailable', async () => {
    const cfg = configuration();
    const window = windowWithInputs([
      'https://bad.example.com', 'alice', 'secret',
      'https://zentao.example.com', 'bob', 'secret2'
    ], [
      { label: 'Beta', description: '#8', projectId: 8 }
    ]);
    const firstClient = {
      login: vi.fn(async () => 'token-bad'),
      getProjects: vi.fn(async () => { throw new Error('network'); })
    };
    const secondClient = {
      login: vi.fn(async () => 'token-good'),
      getProjects: vi.fn(async () => ({ projects: [{ id: 8, name: 'Beta' }] }))
    };
    const createClient = vi.fn().mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
    const storeLogin = vi.fn(async () => undefined);

    const result = await runConnectionWizard({
      mode: 'firstTime',
      window,
      configuration: cfg.config,
      createClient,
      storeLogin
    });

    expect(result).toEqual({ baseUrl: 'https://zentao.example.com/', projectId: 8 });
    expect(createClient).toHaveBeenNthCalledWith(1, 'https://bad.example.com/');
    expect(createClient).toHaveBeenNthCalledWith(2, 'https://zentao.example.com/');
    expect(storeLogin).toHaveBeenCalledTimes(1);
    expect(storeLogin).toHaveBeenCalledWith('bob', 'secret2', 'token-good', 'https://zentao.example.com/');
  });

  it('restarts reconnect from username when the project list is unavailable', async () => {
    const cfg = configuration();
    const window = windowWithInputs(['alice', 'secret', 'bob', 'secret2'], [
      { label: 'Beta', description: '#8', projectId: 8 }
    ]);
    const firstClient = {
      login: vi.fn(async () => 'token-bad'),
      getProjects: vi.fn(async () => ({ projects: [] }))
    };
    const secondClient = {
      login: vi.fn(async () => 'token-good'),
      getProjects: vi.fn(async () => ({ projects: [{ id: 8, name: 'Beta' }] }))
    };
    const createClient = vi.fn().mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);
    const storeLogin = vi.fn(async () => undefined);

    const result = await runConnectionWizard({
      mode: 'reconnect',
      currentBaseUrl: 'https://zentao.example.com/',
      existingProjectId: 7,
      previousAccount: 'old-user',
      window,
      configuration: cfg.config,
      createClient,
      storeLogin
    });

    expect(result).toEqual({ baseUrl: 'https://zentao.example.com/', projectId: 8 });
    expect(window.showInputBox).toHaveBeenCalledTimes(4);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(storeLogin).toHaveBeenCalledWith('bob', 'secret2', 'token-good', 'https://zentao.example.com/');
  });
});
