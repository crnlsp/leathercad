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
 * Rule id → what it found when recorded. Empty is the goal. Found on an empty
 * document on 2026-09-23. All three are in the workspace markup that the F
 * slices are rebuilding, so they are left to those slices. The fourth finding,
 * the project name labelled only by its tooltip, was a one-attribute fix
 * outside that markup and is fixed.
 */
const KNOWN: Record<string, string> = {
  // No <main>. `.workspace` and `.canvas-column` are plain divs.
  'landmark-one-main': 'the window has no main landmark',
  // Three unnamed <aside> panels (parts, properties, problems), which a screen
  // reader cannot tell apart. Each needs an aria-label.
  'landmark-unique': 'aside[data-testid="parts-list"] has no accessible name',
  // The "Draw as" label and the canvas host sit outside any landmark. A
  // <main> around the canvas column fixes both.
  region: 'content outside landmarks',
};

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
