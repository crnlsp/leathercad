import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/**
 * An automated accessibility scan of the running window.
 *
 * axe checks what is rendered: names on controls, contrast, roles, labels. It
 * finds perhaps a third of real accessibility problems. The rest need a person
 * with a screen reader, which is why this scan is a floor and not a verdict.
 *
 * It ratchets. The violations present when the scan was added are listed in
 * KNOWN, each a recorded finding. A new one fails the test. So does a listed
 * one that has been fixed, so the list shrinks with the code rather than
 * going stale. See the engineering-tooling spec §4.
 */

const DESKTOP_DIR = resolve(import.meta.dirname, '../apps/desktop');

/**
 * Rule id → what it found when recorded. Empty is the goal — and reached.
 *
 * Found on an empty document on 2026-09-23: no main landmark, three unnamed
 * <aside> panels, and content outside any landmark. All three were in the
 * workspace markup, and F.2 rebuilt it: the canvas column is the <main>
 * landmark, and every panel is named. The project name, labelled only by its
 * tooltip, was fixed when the scan was added.
 */
const KNOWN: Record<string, string> = {};

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
});

test.afterAll(async () => {
  await app?.close();
});

test('the main window has no accessibility violations beyond those recorded', async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // The version arrives through an effect, so it proves React has mounted
  // and the panels are on screen to be scanned. See shell.spec.ts.
  await expect(window.getByTestId('app-version')).not.toBeEmpty();

  // Legacy mode runs axe inside the page. The default opens a scratch page to
  // merge frame results, and Electron cannot create one — nor does it need
  // to, with a single frame.
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  const found = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length,
    first: violation.nodes[0]?.target.join(' '),
  }));

  const unexpected = found.filter((violation) => !(violation.rule in KNOWN));
  const fixed = Object.keys(KNOWN).filter((rule) => !found.some((v) => v.rule === rule));

  expect(unexpected, 'new accessibility violations').toEqual([]);
  expect(fixed, 'recorded violations that are gone — remove them from KNOWN').toEqual([]);
});

test('the F.2 layout at work has no accessibility violations either', async () => {
  // The first scan sees an empty document at the default size. This one sees
  // what F.2 added: the collapsed rail, a populated parts tree with its menus,
  // the problems drawer open, and the properties overlay below 1024 px.
  const instance = await electron.launch({ args: ['.'], cwd: DESKTOP_DIR });
  try {
    const window = await instance.firstWindow();
    await expect(window.getByTestId('app-version')).not.toBeEmpty();

    const box = (await window.getByTestId('editor-canvas').boundingBox())!;
    await window.getByTestId('tool-rectangle').click();
    await window.mouse.move(box.x + 150, box.y + 150);
    await window.mouse.down();
    await window.mouse.move(box.x + 330, box.y + 270, { steps: 5 });
    await window.mouse.up();
    const panel = window.getByTestId('property-panel');
    await panel.getByTestId('add-stitch-line').click();
    const margin = panel.locator('label', { hasText: /^Edge margin/ }).locator('input');
    await margin.fill('60');
    await margin.press('Enter');
    await window.getByTestId('problems-toggle').click();

    await instance.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1000, 700);
    });
    await expect(window.getByTestId('tool-rail')).toHaveClass(/collapsed/);
    await window.getByTestId('toggle-properties').click();
    await expect(panel).toBeVisible();

    const results = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    const found = results.violations.map((violation) => ({
      rule: violation.id,
      help: violation.help,
      first: violation.nodes[0]?.target.join(' '),
      nodes: violation.nodes.length,
    }));
    expect(found, 'accessibility violations in the working layout').toEqual([]);
  } finally {
    await instance.close();
  }
});
