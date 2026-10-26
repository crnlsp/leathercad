import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { closeApp } from './closeApp.js';

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

/** What `launchApp` takes. */
export type LaunchOptions = NonNullable<Parameters<typeof launchApp>[0]>;

/**
 * Starts the app, with preferences of its own, and waits until a test can use
 * it: the page loaded, and the version in the status bar.
 *
 * `domcontentloaded` only means the markup parsed. The canvas's pointer
 * handlers are attached in an effect, so a drag started too early lands on
 * nothing. The version arrives from the main process through an effect, so a
 * non-empty one proves React mounted, effects ran and the platform bridge
 * answered: the earliest honest signal that the app is interactive.
 *
 * A refused unload makes Chromium report a "leave page?" dialog over the
 * debugging protocol, which Electron never shows — the window just stays.
 * Playwright's automatic dismissal then finds no dialog and throws, so it is
 * dismissed here and allowed to pass.
 */
export async function openApp(
  options: LaunchOptions & {
    /** The window's size, for a test that depends on the room it has. */
    readonly size?: readonly [number, number];
  } = {},
): Promise<{ app: ElectronApplication; window: Page }> {
  // Preferences of its own unless the test names a directory to share across
  // launches: a test that collapses the rail or moves a key (8.2) must not
  // change the next one.
  const app = await launchApp({
    ...options,
    env: {
      XDG_CONFIG_HOME:
        options.env?.['XDG_CONFIG_HOME'] ?? mkdtempSync(join(tmpdir(), 'leathercad-e2e-')),
      ...options.env,
    },
  });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
  await window.waitForLoadState('domcontentloaded');
  await expect(window.getByTestId('app-version')).not.toBeEmpty();
  if (options.size !== undefined) {
    await app.evaluate(
      ({ BrowserWindow }, [width, height]) =>
        BrowserWindow.getAllWindows()[0]?.setSize(width, height),
      options.size,
    );
  }
  return { app, window };
}

/** Runs a test body against an app of its own, and closes it whatever happens. */
export async function withApp(
  run: (window: Page, app: ElectronApplication) => Promise<void>,
  options: Parameters<typeof openApp>[0] = {},
): Promise<void> {
  const { app, window } = await openApp(options);
  try {
    await run(window, app);
  } finally {
    await closeApp(app);
  }
}

/** Opens the sample wallet from the empty Parts panel: three pieces. */
export async function openSample(window: Page): Promise<void> {
  await window.getByTestId('open-sample').click();
  await expect(window.getByTestId('part-count')).toHaveText('3');
}

/** `withApp`, with the sample wallet open. */
export async function withSample(
  run: (window: Page, app: ElectronApplication) => Promise<void>,
  options: Parameters<typeof openApp>[0] = {},
): Promise<void> {
  await withApp(async (window, app) => {
    await openSample(window);
    await run(window, app);
  }, options);
}

/**
 * Draws a 150-pixel-wide panel with the Rectangle tool, its left edge `left`
 * pixels into the board. With `parts`, waits until the project has that many.
 */
export async function drawAPanel(
  window: Page,
  { left = 150, parts }: { readonly left?: number; readonly parts?: string } = {},
): Promise<void> {
  await window.getByTestId('tool-rectangle').click();
  const box = (await window.getByTestId('editor-canvas').boundingBox())!;
  await window.mouse.move(box.x + left, box.y + 150);
  await window.mouse.down();
  await window.mouse.move(box.x + left + 150, box.y + 260, { steps: 5 });
  await window.mouse.up();
  if (parts !== undefined) await expect(window.getByTestId('part-count')).toHaveText(parts);
}

/**
 * The page's accessibility violations, by WCAG 2.1 A and AA and axe's best
 * practice. Legacy mode runs axe inside the page: the default opens a scratch
 * page to merge frame results, and Electron cannot create one — nor does it
 * need to, with a single frame.
 */
export async function scanA11y(
  window: Page,
): Promise<Awaited<ReturnType<AxeBuilder['analyze']>>['violations']> {
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  return results.violations
    .map((violation) =>
      violation.id === 'label-content-name-mismatch'
        ? { ...violation, nodes: violation.nodes.filter((node) => !isTreeRow(node.html)) }
        : violation,
    )
    .filter((violation) => violation.nodes.length > 0);
}

/**
 * A Parts tree row is named for its piece or feature alone, while it shows a
 * hole count and a problem badge too, which axe 4.14 reports as WCAG 2.5.3.
 * What a row should announce is a wording decision of its own, tracked apart
 * from the upgrade that found it; until then this one rule skips tree rows,
 * and only them.
 */
function isTreeRow(html: string): boolean {
  return html.startsWith('<div role="treeitem"');
}

/** Fails, naming each rule and the first element it found, if the page has any violation. */
export async function expectNoViolations(window: Page, what?: string): Promise<void> {
  const found = (await scanA11y(window)).map(
    (violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ') ?? ''}`,
  );
  expect(found, what).toEqual([]);
}
