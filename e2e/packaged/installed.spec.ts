import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { closeApp } from '../closeApp.js';
import { expectPieces } from '../counts.js';

/**
 * The installed app, launched as the operating system launches it (R13): a
 * `.lcp` on its command line, as a double-click gives it, and then a second
 * launch with another, which the running app takes as a tab of its own (8.11,
 * 8.12). `e2e/single-instance.spec.ts` checks the same on the development
 * build; this is the binary an installer put in place, the .deb's on Linux
 * and the NSIS installer's on Windows, in `installers.yml`.
 *
 * Only for an installed app: the unpacked one has no installer to test.
 */

const INSTALLED = process.env['LEATHERCAD_PACKAGED_EXECUTABLE'] ?? '';
const PROJECTS = resolve(import.meta.dirname, '../../fixtures/projects');

test.skip(INSTALLED === '', 'needs an installed app: LEATHERCAD_PACKAGED_EXECUTABLE');

test('opens a project named on its command line, and a second launch beside it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-installed-'));
  // Copies: the app renames a project's file when the project is renamed.
  const first = join(dir, 'Wallet from Files.lcp');
  const second = join(dir, 'Coaster from Files.lcp');
  copyFileSync(join(PROJECTS, 'bifold-wallet.lcp'), first);
  copyFileSync(join(PROJECTS, 'coaster.lcp'), second);
  // One configuration for both launches, so the second finds the first's
  // lock. Linux reads it; a packaged app on Windows keeps to %APPDATA%.
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, 'config'),
    XDG_STATE_HOME: join(dir, 'state'),
  };
  const app = await electron.launch({
    executablePath: INSTALLED,
    args: [first],
    chromiumSandbox: true,
    env: { ...env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:1/' },
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId('project-name').locator('..')).toHaveAttribute(
      'title',
      /Wallet from Files/,
    );
    await expectPieces(window, '3');

    // As a file manager starts it: hands its line to the running app, ends.
    const ended = await new Promise<{ code: number | null; output: string }>((done) => {
      const launch = spawn(INSTALLED, [second], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      launch.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
      launch.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
      const timer = setTimeout(() => launch.kill(), 15_000);
      launch.once('exit', (code) => {
        clearTimeout(timer);
        done({ code, output });
      });
    });
    expect(ended.code, ended.output).toBe(0);

    await expect(window.getByTestId('project-name').locator('..')).toHaveAttribute(
      'title',
      /Coaster from Files/,
    );
    await expect(window.getByTestId('tab-strip').getByRole('tab')).toHaveCount(2);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
