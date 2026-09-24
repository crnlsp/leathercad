import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';

/**
 * The platform boundary (architecture §5): the renderer reads, writes and
 * opens only what the user chose in the app's own dialogs this session. Unit
 * tests hold `PathGrants` to its rules; this holds the real IPC handlers to
 * `PathGrants`, from inside the real renderer.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

test('the renderer cannot read, write or open a file nobody chose', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-boundary-'));
  const secret = join(dir, 'secret.txt');
  const chosen = join(dir, 'chosen.pdf');
  writeFileSync(secret, 'not yours');

  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await app.evaluate(({ dialog, shell }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      shell.openPath = async () => '';
    }, chosen);

    type Outcome = 'done' | 'refused';
    const attempt = (call: string, path: string): Promise<Outcome> =>
      window.evaluate(
        async ([call, path]) => {
          const bridge = window.platform!;
          try {
            if (call === 'read') await bridge.readFile(path);
            else if (call === 'write') await bridge.writeFile(path, new Uint8Array([1, 2, 3]));
            else await bridge.openInExternalViewer(path);
            return 'done';
          } catch {
            return 'refused';
          }
        },
        [call, path] as const,
      );

    // Nothing has been chosen yet.
    expect(await attempt('read', secret)).toBe('refused');
    expect(await attempt('write', secret)).toBe('refused');
    expect(await attempt('view', secret)).toBe('refused');
    expect(readFileSync(secret, 'utf8')).toBe('not yours');

    // The user chooses a file; that file, and only that file, is usable.
    await window.evaluate(() => window.platform!.showSaveDialog({ title: 'Export PDF' }));
    expect(await attempt('write', chosen)).toBe('done');
    expect(existsSync(chosen)).toBe(true);
    expect(await attempt('view', chosen)).toBe('done');
    expect(await attempt('read', secret)).toBe('refused');
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
