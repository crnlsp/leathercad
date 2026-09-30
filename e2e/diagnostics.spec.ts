import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import { freshStateHome, launchApp } from './launchApp.js';

/**
 * The app leaves a log behind, in the XDG state directory and not among the
 * user's configuration. See apps/desktop/src/main/diagnostics.ts and ADR 0015.
 */

test('writes a start-up line to $XDG_STATE_HOME/leathercad/logs/main.log', async () => {
  const home = freshStateHome();
  const app = await launchApp({ state: home });
  try {
    const { version, crashes } = await app.evaluate(({ app: electronApp }) => ({
      version: electronApp.getVersion(),
      crashes: electronApp.getPath('crashDumps'),
    }));
    const state = join(home, 'leathercad');
    const logFile = join(state, 'logs', 'main.log');

    await expect.poll(() => existsSync(logFile)).toBe(true);
    expect(readFileSync(logFile, 'utf8')).toContain(`LeatherCAD ${version} starting`);
    expect(crashes).toBe(join(state, 'crashes'));
  } finally {
    await closeApp(app);
  }
});
