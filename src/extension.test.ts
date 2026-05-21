import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(__dirname, '..');

describe('extension scaffold', () => {
  test('uses an SVG resource for the Activity Bar icon', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const icon = manifest.contributes.viewsContainers.activitybar[0].icon;

    expect(icon).toBe('resources/zentao.svg');
    expect(icon).toMatch(/\.svg$/);
  });

  test('registers every contributed command', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const extensionSource = readFileSync(resolve(root, 'src', 'extension.ts'), 'utf8');
    const contributedCommands = manifest.contributes.commands.map(
      (command: { command: string }) => command.command
    );

    for (const command of contributedCommands) {
      expect(extensionSource).toContain(`registerCommand('${command}'`);
    }
  });
});