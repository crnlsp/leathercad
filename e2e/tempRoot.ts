import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Global setup for `playwright.config.ts`: one temp directory for the whole
 * run, removed when it ends. Everything a run puts in the temp directory goes
 * under it — each spec's mkdtemp, the app's own files, Chromium's — because
 * os.tmpdir() reads TMPDIR on Linux and macOS, TEMP and TMP on Windows, and
 * the workers and every app they launch inherit them. Before it, a morning of
 * runs left 3,877 directories, 1.4 GB, in a /tmp that is RAM on tmpfs.
 *
 * Chromium's single-instance socket is made under it too, and a Unix socket
 * path holds about 107 bytes: a TMPDIR much longer than 50 characters makes
 * every launch fail with "Socket path too long".
 *
 * Here and not in the config, which knip and every worker load as well: a
 * directory made there would leak once per load.
 */
export default function tempRoot(): () => void {
  const root = mkdtempSync(join(tmpdir(), 'leathercad-e2e-run-'));
  process.env['TMPDIR'] = process.env['TEMP'] = process.env['TMP'] = root;

  // Every app a test launches keeps its preferences and recent projects (8.2)
  // here — never in the developer's own ~/.config/leathercad, and never carried
  // from one run into the next. Tests that change a preference launch with a
  // directory of their own as well, so the order they run in cannot matter.
  process.env['XDG_CONFIG_HOME'] = join(root, 'config');
  // Nor its log, crash dumps and crash-recovery copies (5.3b) in the developer's
  // own ~/.local/state/leathercad. e2e/launchApp.ts gives every launch a state
  // directory of its own; this catches one that does not go through it.
  process.env['XDG_STATE_HOME'] = join(root, 'state');
  mkdirSync(process.env['XDG_CONFIG_HOME']);
  mkdirSync(process.env['XDG_STATE_HOME']);

  return () => rmSync(root, { recursive: true, force: true });
}
