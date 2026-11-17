import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication } from '@playwright/test';

/**
 * SVG patterns as Inkscape writes them (9.20b), for the import preview.
 *
 * `cardHolder`: a 100 × 60 mm outline with a window cut in it, an open line
 * across it clear of the window, a row of twelve 1.2 mm circles at an iron's pitch, and a text the
 * import leaves out. `layered`: the same outline, its line on a layer named
 * `fold` and a closed path on one named `stitch`, which the names decide.
 * `unitless`: a file that gives no unit, so the maker is asked. `broken`:
 * not well-formed, so refused.
 */
const holes = Array.from(
  { length: 12 },
  (_, i) => `<circle cx="${(8 + 3.85 * i).toFixed(2)}" cy="6" r="0.6"/>`,
).join('');
const INKSCAPE =
  'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:version="1.3"';

export const SVG_PATTERNS = {
  cardHolder: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" ${INKSCAPE} width="100mm" height="60mm" viewBox="0 0 100 60">
  <g inkscape:groupmode="layer" inkscape:label="Layer 1">
    <rect width="100" height="60"/>
    <rect x="15" y="20" width="20" height="20"/>
    <path d="M50 0V60"/>
    ${holes}
    <text x="5" y="55">card holder</text>
  </g>
</svg>`,
  layered: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" ${INKSCAPE} width="100mm" height="60mm" viewBox="0 0 100 60">
  <g inkscape:groupmode="layer" inkscape:label="cut"><rect width="100" height="60"/></g>
  <g inkscape:groupmode="layer" inkscape:label="fold"><path d="M50 0V60"/></g>
  <g inkscape:groupmode="layer" inkscape:label="stitch"><rect x="4" y="4" width="92" height="52"/></g>
</svg>`,
  unitless: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96"/>
</svg>`,
  broken: '<svg xmlns="http://www.w3.org/2000/svg"><rect',
} as const;

/** Writes a pattern to a file of its own and has the next open dialog choose it. */
export async function chooseSvg(
  app: ElectronApplication,
  pattern: keyof typeof SVG_PATTERNS,
): Promise<void> {
  await chooseSvgFile(app, pattern, SVG_PATTERNS[pattern]);
}

/** Writes `contents` to `<name>.svg` in a folder of its own and has the next open dialog choose it. */
export async function chooseSvgFile(
  app: ElectronApplication,
  name: string,
  contents: string | Uint8Array,
): Promise<void> {
  const path = join(mkdtempSync(join(tmpdir(), 'leathercad-svg-')), `${name}.svg`);
  writeFileSync(path, contents);
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, path);
}
