import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import {
  drawRectangle,
  enter,
  expectDiagnostics,
  exportPdfTo,
  featureId,
  featureRow,
  holeCounts,
  panel,
  saveAs,
  shapePiece,
  size,
  stitchAndPunch,
} from './journeys.js';
import { expectNoViolations, openApp } from './launchApp.js';
import { piecesInPdf } from './pdfPieces.js';

/**
 * R16, the journey the Smart Features audit found hardest: a card pocket from
 * a blank, square-cornered rectangle. Stitched *Open at the top* (Q48), its
 * two end holes start as far in from the cut edge as the stitching is (U2);
 * typed back to 0, *Start offset* and *End offset* put them on it, and Problems
 * says so and names those fields (Q47). Said to hold a payment card with the
 * maker's own ease from My tools (9.14b), it is too narrow, and widening it is
 * the fix. Each state's whole diagnostic list is read back from the saved
 * file, as the Smart Features scenarios read theirs, and the PDF is measured.
 */

test('a card pocket from a blank rectangle: open at the top, the edge problem, offsets, a payment card, the warning and its fix (R16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-r16-pocket-'));
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    const file = join(dir, 'Card pocket.lcp');
    const fields = panel(window);
    const verdict = window.getByTestId('problems-verdict');

    // The maker's ease, once, in My tools: 4 mm.
    await window.getByTestId('settings').click();
    await window.getByTestId('settings-tab-tools').click();
    await enter(window.getByTestId('setting-pocket-ease').getByRole('textbox'), '4');
    await window.getByTestId('settings-close').click();

    // ── 92 × 60, square corners, stitched 3 mm in, open at the top ─────────
    await drawRectangle(window, [200, 200, 480, 380]);
    await shapePiece(window, { name: 'Card pocket', width: 92, height: 60 });
    await stitchAndPunch(window, 3, 'Open at the top');
    await featureRow(window, 'Card pocket', 'Stitch line').click();
    await expect(fields.getByTestId('stitch-run').locator('option:checked')).toHaveText(
      'Open at the top',
    );
    await expect(fields.getByTestId('pocket-width')).toHaveText('86 mm');

    // ── Opened, its end holes start as far in as the stitching: 3 mm (U2) ──
    await expect(verdict).toHaveText('Nothing to fix.');
    let project = await saveAs(app, window, file);
    const holes = featureId(project, 'Card pocket', 'Stitch holes');
    const stitch = featureId(project, 'Card pocket', 'Stitch line');
    expectDiagnostics(project, []);
    const after = holeCounts(project)['Card pocket › Stitch holes'];

    // ── Offsets typed as 0: the end holes on the cut edge ───────────────────
    // The iron My tools holds cuts a slit, and at each end it would run off
    // the leather (Q46): one problem, an error, whose advice names the fields.
    await featureRow(window, 'Card pocket', 'Stitch holes').click();
    await expect(fields.getByRole('textbox', { name: 'Start offset' })).toHaveValue('3');
    await enter(fields.getByRole('textbox', { name: 'Start offset' }), '0');
    await enter(fields.getByRole('textbox', { name: 'End offset' }), '0');
    await expect(verdict).toHaveText('1 error');
    project = await saveAs(app, window, file);
    expectDiagnostics(project, [
      {
        code: 'OUTSIDE_PART',
        severity: 'error',
        on: holes,
        facts: { what: 'holes', atEnds: true },
        location: { points: 2 },
      },
    ]);
    const before = holeCounts(project)['Card pocket › Stitch holes'];
    const problems = fields.getByTestId('feature-problems');
    await expect(problems).toContainText('Off the material');
    await expect(problems).toContainText('raise Start offset and End offset');
    // A hole kept on every corner: the run is shorter, by no more than its two ends.
    expect(after).toBeLessThanOrEqual(before!);
    expect(after).toBeGreaterThanOrEqual(before! - 2);

    // ── Both back to 3 mm ───────────────────────────────────────────────────
    await enter(fields.getByRole('textbox', { name: 'Start offset' }), '3');
    await expect(verdict).toHaveText('1 error');
    await enter(fields.getByRole('textbox', { name: 'End offset' }), '3');
    await expect(verdict).toHaveText('Nothing to fix.');
    project = await saveAs(app, window, file);
    expectDiagnostics(project, []);

    // ── Holds a payment card, with the 4 mm ease from My tools ─────────────
    await featureRow(window, 'Card pocket', 'Stitch line').click();
    await fields.getByTestId('pocket-holds').selectOption('id-1');
    await expect(fields.getByRole('textbox', { name: 'Ease' })).toHaveValue('4');
    await expect(verdict).toHaveText('1 warning');
    await expect(problems).toContainText('Pocket too narrow');
    await expect(problems).toContainText('a payment card with 4.00 mm of ease needs 89.60 mm');
    await expect(fields.getByTestId('pocket-across')).toHaveText(
      'Too narrow: 86 mm across for 85.6 mm and 4 mm ease.',
    );
    await expectNoViolations(window, 'a pocket too narrow for its card');
    project = await saveAs(app, window, file);
    expectDiagnostics(project, [
      {
        code: 'POCKET_TOO_NARROW',
        severity: 'warning',
        on: stitch,
        facts: { content: 'id-1', widthMm: 86, neededMm: 89.6, easeMm: 4 },
      },
    ]);

    // ── The fix: 4 mm wider, and it says nothing ────────────────────────────
    await featureRow(window, 'Card pocket', 'Outline').click();
    await enter(fields.getByLabel('Width'), '96');
    await expect(verdict).toHaveText('Nothing to fix.');
    await featureRow(window, 'Card pocket', 'Stitch line').click();
    await expect(fields.getByTestId('pocket-width')).toHaveText('90 mm');
    await expect(fields.getByTestId('feature-problems')).toHaveCount(0);
    project = await saveAs(app, window, file);
    expectDiagnostics(project, []);
    const line = project.parts[0]?.features.find((f) => f.id === stitch);
    expect(line).toMatchObject({ holds: { content: { kind: 'id-1' }, easeMm: 4 } });
    const holeSet = project.parts[0]?.features.find((f) => f.id === holes);
    expect(holeSet?.source).toMatchObject({ op: { startOffsetMm: 3, endOffsetMm: 3 } });
    const punched = holeCounts(project)['Card pocket › Stitch holes'];

    // ── The PDF: 96 × 60, every hole on it ─────────────────────────────────
    const pdf = join(dir, 'Card pocket.pdf');
    await exportPdfTo(app, window, pdf);
    expect(piecesInPdf(pdf).map((p) => [size(p.widthMm, p.heightMm), p.holes])).toEqual([
      ['96.000 × 60.000', punched],
    ]);
  } finally {
    await window.screenshot({ path: test.info().outputPath('card-pocket.png') });
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * U2, in the order *Getting started* §3 gives: stitch line, holes, and only
 * then *Open at the top*. Opening the run moves the end holes off the open
 * edge, so there is nothing to fix; Ctrl+Z takes the run and the offsets back
 * as one step.
 */
test('U2 · a pocket stitched, punched, then opened at the top has nothing to fix', async () => {
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    const fields = panel(window);
    const verdict = window.getByTestId('problems-verdict');
    await drawRectangle(window, [200, 200, 480, 380]);
    await shapePiece(window, { name: 'Pocket', width: 92, height: 60 });
    await stitchAndPunch(window, 3.5);
    await expect(verdict).toHaveText('Nothing to fix.');

    await featureRow(window, 'Pocket', 'Stitch line').click();
    await fields.getByTestId('stitch-run').selectOption({ label: 'Open at the top' });
    await expect(verdict).toHaveText('Nothing to fix.');

    await featureRow(window, 'Pocket', 'Stitch holes').click();
    await expect(fields.getByRole('textbox', { name: 'Start offset' })).toHaveValue('3.5');
    await expect(fields.getByRole('textbox', { name: 'End offset' })).toHaveValue('3.5');
  } finally {
    await window.screenshot({ path: test.info().outputPath('open-at-the-top.png') });
    await closeApp(app);
  }
});
