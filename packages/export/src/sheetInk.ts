import type { Mm } from '@leathercad/core';
import { polyline, type Path, type Rect, type Vec2 } from '@leathercad/geometry';
import { PAPER_FURNITURE } from '@leathercad/render';
import { outlinesOf, placedText, textWidthMm, type TextPlacement } from '@leathercad/typography';

import { contentAreaMm, sheetSizeMm, VERIFICATION_TEXT, verificationLayout } from './paper.js';
import type { ExportPath, ExportText, PrintStyle } from './scene.js';
import { sheetLabel, type SheetPlan } from './sheetPlan.js';

/** Page furniture's own text size: the footer and the square's label. */
export const NOTE_SIZE_MM = 2.5;

const APP_NAME = 'LeatherCAD';

/** The block's lines: black, 0.2 mm, solid. */
const BLOCK: PrintStyle = { widthMm: 0.2, dashMm: [], grey: 0 };
const JOIN: PrintStyle = {
  widthMm: PAPER_FURNITURE.join.widthMm,
  dashMm: PAPER_FURNITURE.join.dashMm,
  grey: PAPER_FURNITURE.join.grey,
};
const CROSS: PrintStyle = { widthMm: PAPER_FURNITURE.join.widthMm, dashMm: [], grey: 0 };

/**
 * Everything printed on one sheet that is not a pattern piece (7.4c): the
 * verification block, the footer, and on a tiled sheet its joins, crosses and
 * tile label — **the one description of it**, in millimetres from the sheet's
 * bottom-left, Y up.
 *
 * The PDF writer prints it and the Sheets view draws it, so what the maker
 * sees on screen is what comes out of the printer; neither has a second way
 * of laying out the ruler or wording the footer.
 */
export interface SheetInk {
  /** The block's ruler and square. Drawn with butt caps, as printed. */
  readonly paths: readonly ExportPath[];
  /**
   * A tiled sheet's joins and registration crosses. Printed inside the clip
   * to the printable area, like the tile's piece.
   */
  readonly clipped: readonly ExportPath[];
  /** Every string: the block's words, the tile label and note, the footer. */
  readonly texts: readonly ExportText[];
  /** The printable area, which a tiled sheet's piece and joins are clipped to. */
  readonly clip: Rect | null;
}

/**
 * The ink of sheet `index` (0-based) of the plan. `now` dates the footer — the
 * one thing on a sheet that is "as of" when it is drawn.
 */
export function sheetInk(plan: SheetPlan, index: number, now: Date): SheetInk {
  const { setup, scene } = plan;
  const sheet = plan.sheets[index]!;
  const layout = verificationLayout(setup);
  const texts: ExportText[] = [];
  const paths: ExportPath[] = [];

  // The 100 mm ruler: 10 mm major and 5 mm minor ticks.
  const { x, y } = layout.ruler;
  paths.push(
    ink(
      polyline([
        { x, y },
        { x: x + layout.rulerLengthMm, y },
      ]),
      BLOCK,
    ),
  );
  for (let mm = 0; mm <= layout.rulerLengthMm; mm += 5) {
    const height = mm % 10 === 0 ? layout.rulerHeightMm : 2;
    paths.push(
      ink(
        polyline([
          { x: x + mm, y },
          { x: x + mm, y: y + height },
        ]),
        BLOCK,
      ),
    );
  }

  // The 50 mm square.
  const { square, squareSizeMm: size } = layout;
  paths.push(
    ink(
      polyline(
        [
          square,
          { x: square.x + size, y: square.y },
          { x: square.x + size, y: square.y + size },
          { x: square.x, y: square.y + size },
        ],
        true,
      ),
      BLOCK,
    ),
  );
  texts.push(words('50 mm', NOTE_SIZE_MM, { x: square.x + 2, y: square.y + size - 5 }));
  texts.push(
    words(VERIFICATION_TEXT.instruction, VERIFICATION_TEXT.instructionSizeMm, layout.instruction),
  );
  texts.push(words(VERIFICATION_TEXT.note, VERIFICATION_TEXT.noteSizeMm, layout.note));

  // A tiled sheet: which tile, how they go together, and where they join.
  const clipped: ExportPath[] = [];
  const tile = sheet.tile;
  let clip: Rect | null = null;
  if (tile !== undefined) {
    const area = contentAreaMm(setup);
    clip = {
      minX: area.x,
      minY: area.y,
      maxX: area.x + area.widthMm,
      maxY: area.y + area.heightMm,
    };

    const tileSize = VERIFICATION_TEXT.tileSizeMm;
    const grid = ` · ${tile.label} · ${String(tile.rows)} × ${String(tile.columns)} sheets`;
    let name = tile.part.name.trim() === '' ? 'Part' : tile.part.name.trim();
    while (name.length > 1 && textWidthMm(`${name}${grid}`, tileSize) > layout.tileTextMaxWidthMm) {
      name = `${name.slice(0, -2)}…`;
    }
    texts.push(words(`${name}${grid}`, tileSize, layout.tileLabel));
    texts.push(words(VERIFICATION_TEXT.tileNote, tileSize, layout.tileNote));

    // In the part's own coordinates, then onto the sheet by the placement's
    // translation: so each lands on the same place in the pattern on every
    // sheet that shows it.
    const offset = sheet.placements[0]!.offsetMm;
    const at = (px: Mm, py: Mm): Vec2 => ({ x: px + offset.x, y: py + offset.y });
    const w = tile.windowMm;
    for (const jx of tile.joinsMm.x)
      clipped.push(ink(polyline([at(jx, w.minY), at(jx, w.maxY)]), JOIN));
    for (const jy of tile.joinsMm.y)
      clipped.push(ink(polyline([at(w.minX, jy), at(w.maxX, jy)]), JOIN));

    // A cross at the middle of the window's span along each line, and where
    // two lines cross.
    const middleX = (w.minX + w.maxX) / 2;
    const middleY = (w.minY + w.maxY) / 2;
    const crosses = [
      ...tile.joinsMm.x.flatMap((jx) => [
        { x: jx, y: middleY },
        ...tile.joinsMm.y.map((jy) => ({ x: jx, y: jy })),
      ]),
      ...tile.joinsMm.y.map((jy) => ({ x: middleX, y: jy })),
    ];
    const arm = PAPER_FURNITURE.crossArmMm;
    for (const c of crosses) {
      clipped.push(ink(polyline([at(c.x - arm, c.y), at(c.x + arm, c.y)]), CROSS));
      clipped.push(ink(polyline([at(c.x, c.y - arm), at(c.x, c.y + arm)]), CROSS));
    }
  }

  // The footer: what this is, and which sheet of how many.
  const footerY = setup.marginsMm.bottom - 5;
  if (footerY >= 0) {
    const name = scene.projectName.trim() === '' ? 'Untitled' : scene.projectName.trim();
    const date = now.toISOString().slice(0, 10);
    texts.push(
      words(`${name} · ${date} · ${APP_NAME}`, NOTE_SIZE_MM, {
        x: setup.marginsMm.left,
        y: footerY,
      }),
    );
    texts.push(
      words(
        `${sheetLabel(index + 1, plan.sheets.length)} · 1:1`,
        NOTE_SIZE_MM,
        { x: sheetSizeMm(setup).widthMm - setup.marginsMm.right, y: footerY },
        // Right-aligned by the layout's own measurement, rather than by asking
        // a font how wide it thinks the string is.
        { align: 'right' },
      ),
    );
  }

  return { paths, clipped, texts, clip };
}

function ink(path: Path, style: PrintStyle): ExportPath {
  return { role: 'annotation', path, style };
}

/** Laid out once, as filled outlines: the same shapes on screen and on paper. */
function words(content: string, sizeMm: Mm, at: Vec2, placement: TextPlacement = {}): ExportText {
  const placed = placedText(content, sizeMm, at, placement);
  return { role: 'annotation', source: content, glyphs: outlinesOf(placed), sizeMm };
}
