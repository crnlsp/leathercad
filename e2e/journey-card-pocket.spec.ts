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
 * two end holes land on the cut edge, and Problems says so; *Start offset* and
 * *End offset* move them in (Q47). Said to hold a payment card with the
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

    // ── The edge problem: its two end holes are on the cut edge ─────────────
    // The iron My tools holds cuts a slit, and at each end it would run off
    // the leather (Q46): the same one problem, as an error.
    await expect(verdict).toHaveText('1 error');
    let project = await saveAs(app, window, file);
    const holes = featureId(project, 'Card pocket', 'Stitch holes');
    const stitch = featureId(project, 'Card pocket', 'Stitch line');
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

    // F8 goes to it, and its advice names the fields that fix it.
    await window.getByTestId('editor-canvas').focus();
    await window.keyboard.press('F8');
    const problems = fields.getByTestId('feature-problems');
    await expect(problems).toContainText('Off the material');
    await expect(problems).toContainText('raise Start offset and End offset');

    // ── Offsets: both end holes 3 mm in ─────────────────────────────────────
    await enter(fields.getByRole('textbox', { name: 'Start offset' }), '3');
    await expect(verdict).toHaveText('1 error');
    await enter(fields.getByRole('textbox', { name: 'End offset' }), '3');
    await expect(verdict).toHaveText('Nothing to fix.');
    project = await saveAs(app, window, file);
    expectDiagnostics(project, []);
    // A hole kept on every corner: the run is shorter, by no more than its two ends.
    const after = holeCounts(project)['Card pocket › Stitch holes'];
    expect(after).toBeLessThanOrEqual(before!);
    expect(after).toBeGreaterThanOrEqual(before! - 2);

    // ── Holds a payment card, with the 4 mm ease from My tools ─────────────
    await featureRow(window, 'Card pocket', 'Stitch line').click();
    await fields.getByTestId('pocket-holds').selectOption('id-1');
    await expect(fields.getByRole('textbox', { name: 'Ease' })).toHaveValue('4');
    await expect(verdict).toHaveText('1 warning');
    await expect(problems).toContainText('Pocket too narrow');
    await expect(problems).toContainText('a payment card with 4.00 mm of ease needs 89.60 mm');
    await expect(fields.getByTestId('pocket-across')).toHaveText(
      '86 mm between stitch lines; 85.6 mm stated, with 4 mm ease.',
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
