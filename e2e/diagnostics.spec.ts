import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

/**
 * The app leaves a log behind, in the XDG state directory and not among the
 * user's configuration. See apps/desktop/src/main/diagnostics.ts and ADR 0015.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

test('writes a start-up line to ~/.local/state/leathercad/logs/main.log', async () => {
  const app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const { home, version, crashes } = await app.evaluate(({ app: electronApp }) => ({
      home: electronApp.getPath('home'),
      version: electronApp.getVersion(),
      crashes: electronApp.getPath('crashDumps'),
    }));
    const xdg = process.env['XDG_STATE_HOME'];
    const state = join(
      xdg !== undefined && xdg !== '' ? xdg : join(home, '.local', 'state'),
      'leathercad',
    );
    const logFile = join(state, 'logs', 'main.log');

    await expect.poll(() => existsSync(logFile)).toBe(true);
    expect(readFileSync(logFile, 'utf8')).toContain(`LeatherCAD ${version} starting`);
    expect(crashes).toBe(join(state, 'crashes'));
  } finally {
    await app.close();
  }
});
