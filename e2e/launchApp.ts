import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, type ElectronApplication } from '@playwright/test';

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

/** A new, empty directory for the app to use as its XDG state home. */
export function freshStateHome(): string {
  return mkdtempSync(join(tmpdir(), 'leathercad-e2e-state-'));
}

/**
 * Starts the development build for a test, in a state directory of its own.
 *
 * The state directory holds the log, crash dumps and crash-recovery copies
 * (5.3b), and it is never the developer's own ~/.local/state/leathercad. A copy
 * that an app killed with unsaved work left behind would otherwise open every
 * later launch with the recovery dialog, and its backdrop takes every click.
 * Each launch gets a new directory unless it passes `state`, which a test does
 * to start again where a crash left off, or to read what the app wrote there.
 *
 * Preferences are not handled here. playwright.config.ts gives the run a
 * configuration directory, and a test that changes a preference passes its own
 * XDG_CONFIG_HOME in `env`.
 */
export function launchApp(
  options: {
    /** Arguments after the app's own directory, such as a project to open. */
    readonly args?: readonly string[];
    /** Variables to add to the test runner's environment. */
    readonly env?: Readonly<Record<string, string>>;
    /** The XDG state home to start in. A new, empty one when omitted. */
    readonly state?: string;
  } = {},
): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', ...(options.args ?? [])],
    cwd: DESKTOP_DIR,
    env: { ...process.env, ...options.env, XDG_STATE_HOME: options.state ?? freshStateHome() },
  });
}
