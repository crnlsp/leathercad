import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { loadProject, saveProject } from '../packages/persist/src/index.js';
import { closeApp } from './closeApp.js';
import { expectNoViolations, openApp } from './launchApp.js';

// The card holder as 1.6 shipped it: its pocket's drawn sides drift 0.61 mm.
const cardHolder = resolve(import.meta.dirname, '../fixtures/regressions/card-holder-1.6.lcp');

test('a drifting seam offers its fix: previewed while pointed at, one undo step (9.17)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-fix-')), 'Sewn.lcp');
  const p = loadProject(readFileSync(cardHolder)).project;
  writeFileSync(
    file,
    saveProject(
      {
        ...p,
        seams: [
          {
            id: 'left',
            a: {
              holeSetId: 'pocket-holes',
              stretch: { kind: 'between', fromAnchor: 0, toAnchor: 'start' },
            },
            b: {
              holeSetId: 'outer-holes',
              stretch: { kind: 'from', anchor: 3, toward: 'previous' },
            },
          },
        ],
      },
      { applicationVersion: '1.7.0', now: () => new Date('2026-11-11T00:00:00Z') },
    ),
  );
  const { app, window } = await openApp({ args: [file], size: [1440, 1000] });
  try {
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, file);
    // From the Problems drawer to the piece, where the problem is explained.
    await window.getByTestId('problems-toggle').click();
    await window.getByTestId('problems-panel').locator('[data-code="SEAM_HOLES_DRIFT"]').click();
    await window.getByTestId('problems-toggle').click();
    const problems = window.getByTestId('feature-problems');
    const fix = problems.getByTestId('problem-fix');
    await expect(fix).toHaveText('Shorten Stitch line by 0.61 mm');
    const verdict = window.getByTestId('seam-panel').getByTestId('seam-verdict');
    await expect(verdict).toHaveText(/11 = 11 holes · drift 0.61 mm/);
    await expect(window.getByTestId('undo')).toBeDisabled();
    await expectNoViolations(window, 'a problem with its fix');

    // Pointing previews it; the row stays, and history is untouched.
    await fix.hover();
    await expect(verdict).toHaveText(/11 = 11 holes · drift 0 mm/);
    await expect(fix).toBeVisible();
    await expect(window.getByTestId('undo')).toBeDisabled();
    await window.screenshot({ path: test.info().outputPath('fix-preview.png') });
    await window.getByTestId('property-header').hover();
    await expect(verdict).toHaveText(/drift 0.61 mm/);

    // By keyboard: focus previews, Enter applies, as one step.
    await fix.focus();
    await expect(verdict).toHaveText(/drift 0 mm/);
    await window.keyboard.press('Enter');
    await expect(problems.locator('[data-code="SEAM_HOLES_DRIFT"]')).toHaveCount(0);
    await expect(verdict).toHaveText(/11 = 11 holes · drift 0 mm/);
    await expect(verdict).toHaveAttribute('data-severity', 'info');
    await expect(window.getByTestId('property-panel')).toBeFocused();
    await window.getByTestId('undo').click();
    await expect(verdict).toHaveText(/drift 0.61 mm/);
    await expect(window.getByTestId('undo')).toBeDisabled();
    await window.getByTestId('redo').click();
    await expect(verdict).toHaveText(/drift 0 mm/);

    // What is saved: the pocket's stitching ends 0.61 mm lower; nothing cut moved.
    await window.getByTestId('save').click();
    await expect(window.getByTestId('save-state')).toHaveText('Saved');
    const saved = loadProject(readFileSync(file)).project;
    const pocket = saved.parts.find((part) => part.id === 'pocket')!;
    const line = pocket.features.find((f) => f.id === 'pocket-stitch')!;
    expect(line.source.kind === 'path' && line.source.path.segments[0]?.a).toEqual({
      x: 3,
      y: -19.6053,
    });
    expect(pocket.features.find((f) => f.id === 'pocket-outline')).toEqual(
      p.parts.find((part) => part.id === 'pocket')!.features.find((f) => f.id === 'pocket-outline'),
    );
  } finally {
    await closeApp(app);
  }
});

test('stitching too near the edge is offered the margin that clears it (9.17)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'leathercad-fix-')), 'Tight.lcp');
  const p = loadProject(readFileSync(cardHolder)).project;
  const tight = {
    ...p,
    parts: p.parts.map((part) => ({
      ...part,
      features: part.features.map((f) =>
        f.id === 'outer-stitch' && f.source.kind === 'derived' && f.source.op.type === 'offset'
          ? { ...f, source: { ...f.source, op: { ...f.source.op, distanceMm: 1 } } }
          : f,
      ),
    })),
  };
  writeFileSync(
    file,
    saveProject(tight, {
      applicationVersion: '1.7.0',
      now: () => new Date('2026-11-11T00:00:00Z'),
    }),
  );
  const { app, window } = await openApp({ args: [file], size: [1440, 1000] });
  try {
    await window.getByTestId('feature-row-outer-holes').click();
    const problems = window.getByTestId('feature-problems');
    const tooNear = problems.locator('[data-code="HOLE_TOO_CLOSE_TO_EDGE"]');
    await expect(tooNear).toHaveCount(1);
    const fix = problems.getByTestId('problem-fix');
    await expect(fix).toHaveText('Move Stitch line 1.50 mm in');
    await fix.click();
    await expect(tooNear).toHaveCount(0);
    await window.getByTestId('undo').click();
    await expect(tooNear).toHaveCount(1);
    await expect(window.getByTestId('undo')).toBeDisabled();
  } finally {
    await closeApp(app);
  }
});
