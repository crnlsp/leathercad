import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

import { emptyDocument, rectanglePart, rectShape } from '../packages/document/src/index.js';
import { saveProject } from '../packages/persist/src/index.js';
import { boardMap } from './boardMap.js';
import { closeApp } from './closeApp.js';
import { openApp } from './launchApp.js';
import { resizeWindow } from './windowSize.js';

/** A 100 × 80 mm panel whose stitch line is set deeper than the panel holds: one error. */
function oneErrorFile(dir: string): string {
  const panel = rectanglePart('panel', 'outline', 'Body panel', rectShape({ x: 0, y: 0 }, 100, 80));
  const file = join(dir, 'One error.lcp');
  writeFileSync(
    file,
    saveProject(
      {
        ...emptyDocument('one-error').project,
        parts: [
          {
            ...panel,
            features: [
              ...panel.features,
              {
                id: 'stitch',
                name: 'Stitch line',
                visible: true,
                locked: false,
                kind: 'stitch-line',
                source: {
                  kind: 'derived',
                  sourceId: 'outline',
                  op: { type: 'offset', distanceMm: 60, side: 'inward', run: { kind: 'whole' } },
                },
              },
            ],
          },
        ],
      },
      { applicationVersion: '1.6.0', now: () => new Date('2026-11-01T00:00:00Z') },
    ),
  );
  return file;
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('Not laid out');
  return found;
}

test('the drawer’s handle is named as it is said, "Problems 1 error" (U.24e, X22)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-u24e-'));
  const { app, window } = await openApp({ args: [oneErrorFile(dir)] });
  try {
    const toggle = window.getByTestId('problems-toggle');
    // Not "Problems error 1 1 error": the badge's glyph and count were read,
    // then the verdict that says them.
    await expect(toggle).toHaveAccessibleName('Problems 1 error');
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Problems 1 error');
    // A badge, where it is read, is one phrase, not "error 1".
    await expect(
      window.getByTestId('parts-list').getByTestId('count-badge').first(),
    ).toHaveAccessibleName('1 problem, worst: error');

    const found = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .include('[data-testid="problems-panel"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
      [],
    );

    // Mended, it says so in the same words.
    await window.getByTestId('problems-panel').getByTestId('problem-row').click();
    const margin = window
      .getByTestId('property-panel')
      .locator('label', { hasText: /^Edge margin/ })
      .locator('input');
    await margin.fill('3');
    await margin.press('Enter');
    await expect(toggle).toHaveAccessibleName('Problems Nothing to fix.');
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('at the minimum window a problem and the piece it names are both in view (U.24e, X23)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-u24e-'));
  const { app, window } = await openApp({ args: [oneErrorFile(dir)] });
  try {
    await resizeWindow(app, window, 860, 600);
    const toggle = window.getByTestId('problems-toggle');
    await toggle.click();
    const drawer = window.getByTestId('problems-panel');
    const row = drawer.getByTestId('problem-row');
    await row.click();
    await expect(row).toHaveAttribute('aria-current', 'true');

    // Previous and Next share the handle's line rather than taking one of
    // their own: the board keeps the height.
    const handle = await box(toggle);
    for (const id of ['problem-previous', 'problem-next']) {
      const button = await box(window.getByTestId(id));
      expect(button.y + button.height / 2).toBeGreaterThan(handle.y);
      expect(button.y + button.height / 2).toBeLessThan(handle.y + handle.height);
    }

    // The whole problem is in view, why and what to do, not scrolled past.
    const body = await box(drawer.locator('.drawer-body'));
    const shown = await box(row);
    expect(shown.y).toBeGreaterThanOrEqual(body.y);
    expect(shown.y + shown.height).toBeLessThanOrEqual(body.y + body.height);

    // And the piece it names, framed by *go to*, is on the board above it.
    const canvas = await box(window.getByTestId('editor-canvas'));
    const at = await boardMap(window);
    for (const corner of [
      { x: 0, y: 0 },
      { x: 100, y: 80 },
    ]) {
      const point = at(corner);
      expect(point.x).toBeGreaterThan(canvas.x);
      expect(point.x).toBeLessThan(canvas.x + canvas.width);
      expect(point.y).toBeGreaterThan(canvas.y);
      expect(point.y).toBeLessThan(canvas.y + canvas.height);
    }
  } finally {
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
