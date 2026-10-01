import type { Mm } from '@leathercad/core';
import { polyline, type Path, type Rect, type Vec2 } from '@leathercad/geometry';
import { PAPER_FURNITURE } from '@leathercad/render';
import { outlinesOf, placedText, textWidthMm, type TextPlacement } from '@leathercad/typography';

import { brandMark } from './brandMark.js';
import type { Tile } from './paginate.js';
import {
  contentAreaMm,
  describeJoins,
  VERIFICATION_TEXT,
  verificationLayout,
  type Neighbours,
} from './paper.js';
import type { ExportPath, ExportText, PrintStyle } from './scene.js';
import { sheetLabel, type SheetPlan } from './sheetPlan.js';

const APP_NAME = 'LeatherCAD';

/** The gauge's lines: black, 0.2 mm, solid. */
const BLOCK: PrintStyle = { widthMm: 0.2, dashMm: [], grey: 0 };
const JOIN: PrintStyle = {
  widthMm: PAPER_FURNITURE.join.widthMm,
  dashMm: PAPER_FURNITURE.join.dashMm,
  grey: PAPER_FURNITURE.join.grey,
};
const CROSS: PrintStyle = { widthMm: PAPER_FURNITURE.join.widthMm, dashMm: [], grey: 0 };

/**
 * Everything printed on one sheet that is not a pattern piece (7.4c): the
 * verification strip — the gauge, the instruction, what the sheet is and the mark — and
 * on a tiled sheet its joins and crosses — **the one description of it**, in
 * millimetres from the sheet's bottom-left, Y up.
 *
 * The PDF writer prints it and the Sheets view draws it, so what the maker
 * sees on screen is what comes out of the printer; neither has a second way
 * of laying out the gauge or wording the sheet.
 */
export interface SheetInk {
  /** The gauge and its ticks. Drawn with butt caps, as printed. */
  readonly paths: readonly ExportPath[];
  /**
   * A tiled sheet's joins and registration crosses. Printed inside the clip
   * to the printable area, like the tile's piece.
   */
  readonly clipped: readonly ExportPath[];
  /** Every string: the instruction, and what the sheet is and where it came from. */
  readonly texts: readonly ExportText[];
  /** LeatherCAD's mark, filled, beside where the sheet came from. */
  readonly mark: readonly Path[];
  /** The printable area, which a tiled sheet's piece and joins are clipped to. */
  readonly clip: Rect | null;
}

/**
 * The ink of sheet `index` (0-based) of the plan. `now` dates the sheet — the
 * one thing on it that is "as of" when it is drawn.
 */
export function sheetInk(plan: SheetPlan, index: number, now: Date): SheetInk {
  const { setup, scene } = plan;
  const sheet = plan.sheets[index]!;
  const layout = verificationLayout(setup);
  const texts: ExportText[] = [];
  const paths: ExportPath[] = [];

  // The gauge: a box whose sides are the measurement, ticked every 5 mm along
  // its bottom like a rule, with the instruction written inside it.
  const { gauge, gaugeWidthMm: width, gaugeHeightMm: height } = layout;
  paths.push(
    ink(
      polyline(
        [
          gauge,
          { x: gauge.x + width, y: gauge.y },
          { x: gauge.x + width, y: gauge.y + height },
          { x: gauge.x, y: gauge.y + height },
        ],
        true,
      ),
      BLOCK,
    ),
  );
  for (let mm = 5; mm < width; mm += 5) {
    const tick = mm % 10 === 0 ? 1.5 : 0.8;
    paths.push(
      ink(
        polyline([
          { x: gauge.x + mm, y: gauge.y },
          { x: gauge.x + mm, y: gauge.y + tick },
        ]),
        BLOCK,
      ),
    );
  }
  texts.push(
    words(VERIFICATION_TEXT.instruction, VERIFICATION_TEXT.instructionSizeMm, layout.instruction),
  );

  // What the sheet is, right-aligned — measured by the layout itself rather
  // than by asking a font how wide it thinks the string is — and on a tiled
  // sheet, which piece and which sheets it joins. Where it came from below,
  // beside LeatherCAD's mark.
  const tile = sheet.tile;
  const size = VERIFICATION_TEXT.sizeMm;
  const right = { align: 'right' } as const;
  const project = scene.projectName.trim() === '' ? 'Untitled' : scene.projectName.trim();
  const number = sheetLabel(index + 1, plan.sheets.length);
  const identity =
    tile === undefined
      ? fitted([project], ([p]) => `${p!} · ${number}`, layout.textMaxWidthMm, size)
      : fitted(
          [project, tile.part.name.trim() === '' ? 'Part' : tile.part.name.trim()],
          ([p, part]) => `${p!} · ${number} · ${part!}, ${describeJoins(neighboursOf(plan, tile))}`,
          layout.textMaxWidthMm,
          size,
        );
  const { lines, mark } = layout;
  texts.push(words(identity, size, { x: lines.x, y: lines.top }, right));
  const date = now.toISOString().slice(0, 10);
  texts.push(words(`${date} · 1:1 · ${APP_NAME}`, size, { x: lines.x, y: lines.bottom }, right));

  // A tiled sheet: where it joins its neighbours.
  const clipped: ExportPath[] = [];
  let clip: Rect | null = null;
  if (tile !== undefined) {
    const area = contentAreaMm(setup);
    clip = {
      minX: area.x,
      minY: area.y,
      maxX: area.x + area.widthMm,
      maxY: area.y + area.heightMm,
    };

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

  return { paths, clipped, texts, mark: brandMark(mark, mark.heightMm), clip };
}

/** The sheets beside a tile, by side, numbered from 1 as printed. */
function neighboursOf(plan: SheetPlan, tile: Tile): Neighbours {
  const at = (row: number, column: number): number | undefined => {
    const index = plan.sheets.findIndex(
      (other) =>
        other.tile?.part.id === tile.part.id &&
        other.tile.row === row &&
        other.tile.column === column,
    );
    return index < 0 ? undefined : index + 1;
  };
  return {
    above: at(tile.row - 1, tile.column),
    left: at(tile.row, tile.column - 1),
    right: at(tile.row, tile.column + 1),
    below: at(tile.row + 1, tile.column),
  };
}

/**
 * `build(names)`, with the longest name shortened — an ellipsis for what is
 * cut — until the line is no wider than `maxMm`. The rest of the line is
 * never cut: a sheet's number is the one thing a maker cannot do without.
 */
function fitted(
  names: string[],
  build: (names: readonly string[]) => string,
  maxMm: Mm,
  sizeMm: Mm,
): string {
  const current = [...names];
  while (textWidthMm(build(current), sizeMm) > maxMm) {
    const longest = current.reduce((a, b, i) => (b.length > current[a]!.length ? i : a), 0);
    const name = current[longest]!;
    if (name.length <= 1) break;
    current[longest] = `${name.endsWith('…') ? name.slice(0, -2) : name.slice(0, -1)}…`;
  }
  return build(current);
}

function ink(path: Path, style: PrintStyle): ExportPath {
  return { role: 'annotation', path, style };
}

/** Laid out once, as filled outlines: the same shapes on screen and on paper. */
function words(content: string, sizeMm: Mm, at: Vec2, placement: TextPlacement = {}): ExportText {
  const placed = placedText(content, sizeMm, at, placement);
  return { role: 'annotation', source: content, glyphs: outlinesOf(placed), sizeMm };
}
