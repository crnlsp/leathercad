import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { closeApp } from './closeApp.js';
import {
  expectDiagnostics,
  exportPdfTo,
  featureRow,
  holeCounts,
  panel,
  saveAs,
  size,
  stitchAndPunch,
} from './journeys.js';
import { expectNoViolations, openApp } from './launchApp.js';
import { piecesInPdf } from './pdfPieces.js';
import { fromProjectMenu } from './projectMenu.js';
import { chooseSvgFile } from './svgPatterns.js';

/**
 * R16: patterns that come from elsewhere — a drawing from Inkscape, and a
 * piece kept in the maker's library — reach the PDF as true as one drawn
 * here, their holes counted and nothing to fix.
 */

/**
 * A card holder's outer as Inkscape 1.3 saves it: millimetres, a layer moved
 * by a transform, and the outline a rectangle turned to a path, so each of
 * its 6 mm corners is a cubic Bézier (κ = 0.5523) written with relative
 * commands. 100 × 60 mm.
 */
const INKSCAPE_CARD_HOLDER = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="100mm" height="60mm" viewBox="0 0 100 60" version="1.1" id="svg1"
   inkscape:version="1.3.2 (091e20e, 2023-11-25)" sodipodi:docname="card-holder.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff" bordercolor="#000000"
     inkscape:document-units="mm" inkscape:zoom="2" />
  <defs id="defs1" />
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1"
     transform="translate(-10,-20)">
    <path style="fill:none;stroke:#000000;stroke-width:0.264583"
       d="m 16,20 h 88 c 3.3138,0 6,2.6862 6,6 v 48 c 0,3.3138 -2.6862,6 -6,6 h -88 c -3.3138,0 -6,-2.6862 -6,-6 v -48 c 0,-3.3138 2.6862,-6 6,-6 z"
       id="path1" />
  </g>
</svg>
`;

test('an Inkscape pattern imported at true size, stitched along its curves, to a PDF (R16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-r16-import-'));
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    await chooseSvgFile(app, 'card-holder', INKSCAPE_CARD_HOLDER);
    await fromProjectMenu(window, 'import-svg');
    const dialog = window.getByTestId('svg-import-dialog');
    await expect(dialog.getByTestId('svg-import-size')).toHaveText('100.0 × 60.0 mm');
    await expect(dialog).toContainText('From the file’s own units');
    await expect(dialog.getByTestId('svg-import-pieces')).toHaveText('1 piece');
    await dialog.getByTestId('svg-import-open').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');

    // Stitched 3 mm in all round, its four curved corners included (9.19).
    await featureRow(window, 'card-holder', 'Outline').click();
    await stitchAndPunch(window, 3);
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');
    // Each cubic corner offset as the arc it is: 2 × (88 + 48) + 6π round.
    await featureRow(window, 'card-holder', 'Stitch line').click();
    await expect(panel(window).getByTestId('measured-length')).toHaveText('290.85 mm');
    await expectNoViolations(window, 'an imported pattern, stitched');

    const project = await saveAs(app, window, join(dir, 'Imported.lcp'));
    expectDiagnostics(project, []);
    const holes = holeCounts(project)['card-holder › Stitch holes'];
    // 94 × 54 with 3 mm corners: 2 × (88 + 48) + 6π = 290.85 mm, at a 3.85 mm iron.
    expect(holes).toBe(76);

    const pdf = join(dir, 'Imported.pdf');
    await exportPdfTo(app, window, pdf);
    expect(piecesInPdf(pdf).map((p) => [size(p.widthMm, p.heightMm), p.holes])).toEqual([
      ['100.000 × 60.000', holes],
    ]);
  } finally {
    await window.screenshot({ path: test.info().outputPath('imported.png') });
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a piece saved to the library inserts into a new project whole, holes and all, to a PDF (R16)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'leathercad-r16-library-'));
  const { app, window } = await openApp({ size: [1440, 1000] });
  try {
    // The card holder's outer, kept as a piece.
    await fromProjectMenu(window, 'new-template');
    await window.getByTestId('template-builtin:card-holder').dblclick();
    await window.locator('[data-testid^="part-heading-"]', { hasText: 'Outer' }).click({
      button: 'right',
    });
    await window.getByTestId('context-save-template').click();
    await expect(window.getByTestId('template-name')).toHaveValue('Outer');
    await window.getByTestId('template-save').click();
    await expect(window.getByTestId('save-template-dialog')).toHaveCount(0);

    // A new project, and the piece inserted from the library.
    await window.keyboard.press('ControlOrMeta+N');
    await expect(window.getByTestId('part-count')).toHaveText('0');
    await fromProjectMenu(window, 'insert-pieces');
    const dialog = window.getByTestId('template-dialog');
    await dialog.getByTestId('template-mine:Outer').click();
    await expect(dialog.getByTestId('template-pieces').getByRole('checkbox')).toHaveCount(1);
    await dialog.getByTestId('template-use').click();
    await expect(window.getByTestId('part-count')).toHaveText('1');
    await expect(window.getByTestId('problems-verdict')).toHaveText('Nothing to fix.');

    const project = await saveAs(app, window, join(dir, 'Reused.lcp'));
    expectDiagnostics(project, []);
    expect(project.seams ?? []).toEqual([]);
    expect(holeCounts(project)).toEqual({ 'Outer › Stitch holes': 86 });
    const outline = project.parts[0]?.features.find((f) => f.kind === 'cut-contour');
    expect(outline?.source).toMatchObject({ kind: 'shape', shape: { width: 105, height: 70 } });

    const pdf = join(dir, 'Reused.pdf');
    await exportPdfTo(app, window, pdf);
    expect(piecesInPdf(pdf).map((p) => [size(p.widthMm, p.heightMm), p.holes])).toEqual([
      ['105.000 × 70.000', 86],
    ]);
  } finally {
    await window.screenshot({ path: test.info().outputPath('library.png') });
    await closeApp(app);
    rmSync(dir, { recursive: true, force: true });
  }
});
