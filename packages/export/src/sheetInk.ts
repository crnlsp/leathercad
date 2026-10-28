import { NO_CORRECTION, isNoCorrection, type Mm, type ScaleCorrection } from '@leathercad/core';
import { PathOps, RectOps, polyline, type Path, type Rect, type Vec2 } from '@leathercad/geometry';
import { PAPER_FURNITURE } from '@leathercad/render';
import { outlinesOf, placedText, textWidthMm, type TextPlacement } from '@leathercad/typography';

import { assemblyDiagram } from './assembly.js';
import { brandMark } from './brandMark.js';
import { edgeArrows, neighboursOf, type EdgeArrow } from './edgeArrows.js';
import { contentAreaMm, describeJoins, VERIFICATION_TEXT, verificationLayout } from './paper.js';
import type { ExportPath, ExportText, PrintStyle } from './scene.js';
import { describeSheetNumbers, sheetLabel, type Assembly, type SheetPlan } from './sheetPlan.js';

export const APP_NAME = 'LeatherCAD';

/** The gauge's lines: black, 0.2 mm, solid. */
export const BLOCK: PrintStyle = { widthMm: 0.2, dashMm: [], grey: 0 };
const JOIN: PrintStyle = {
  widthMm: PAPER_FURNITURE.join.widthMm,
  dashMm: PAPER_FURNITURE.join.dashMm,
  grey: PAPER_FURNITURE.join.grey,
};
const CROSS: PrintStyle = { widthMm: PAPER_FURNITURE.join.widthMm, dashMm: [], grey: 0 };
/** An edge arrow: the join's grey, solid, so it is never read as a cut line. */
const ARROW: PrintStyle = { ...JOIN, dashMm: [] };
/** The part's outline on an assembly sheet's map: grey too, since nothing is cut from it. */
const MAP_OUTLINE = ARROW;

/**
 * What an assembly sheet says above its map (7.2), and how large. English,
 * like everything printed (ADR 0018).
 */
const ASSEMBLY_TEXT = {
  titleSizeMm: 4,
  noteSizeMm: 2.5,
  notes: [
    'Not to scale: a map of how the sheets join. Never cut from it.',
    'Cut each sheet on its dashed line, lay it over the next and match the crosses.',
  ],
  /** Between lines, and between the words and the map. */
  gapMm: 2,
  /** The largest a sheet's number is written in its cell. */
  cellLabelMaxMm: 5,
} as const;

/**
 * Everything printed on one sheet that is not a pattern piece (7.4c): the
 * verification strip — the gauge, the instruction, what the sheet is and the mark — and
 * on a tiled sheet its joins, crosses and edge arrows — **the one description of it**, in
 * millimetres from the sheet's bottom-left, Y up.
 *
 * The PDF writer prints it and the Sheets view draws it, so what the maker
 * sees on screen is what comes out of the printer; neither has a second way
 * of laying out the gauge or wording the sheet.
 */
export interface SheetInk {
  /** The gauge and its ticks, and an assembly sheet's map. Drawn with butt caps, as printed. */
  readonly paths: readonly ExportPath[];
  /**
   * A tiled sheet's joins, registration crosses and edge arrows. Printed
   * inside the clip to the printable area, like the tile's piece.
   */
  readonly clipped: readonly ExportPath[];
  /** The sheets its edge arrows name, inside the same clip, over the piece. */
  readonly clippedTexts: readonly ExportText[];
  /**
   * Every string: the instruction, and what the sheet is and where it came
   * from; on an assembly sheet, its heading and its cells' sheet numbers too.
   */
  readonly texts: readonly ExportText[];
  /** LeatherCAD's mark, filled, beside where the sheet came from. */
  readonly mark: readonly Path[];
  /** The printable area, which a tiled sheet's piece and joins are clipped to. */
  readonly clip: Rect | null;
}

/**
 * The ink of sheet `index` (0-based) of the plan. `now` dates the sheet — the
 * one thing on it that is "as of" when it is drawn. `correction` is the
 * printer's (7.5), which only the PDF Print sends is written with.
 */
export function sheetInk(
  plan: SheetPlan,
  index: number,
  now: Date,
  correction: ScaleCorrection = NO_CORRECTION,
): SheetInk {
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
  const assembly = sheet.assembly;
  const identity =
    assembly !== undefined
      ? fitted(
          [project, partName(assembly)],
          ([p, part]) => `${p!} · ${number} · ${part!}, ${mapOf(assembly)}`,
          layout.textMaxWidthMm,
          size,
        )
      : tile === undefined
        ? fitted([project], ([p]) => `${p!} · ${number}`, layout.textMaxWidthMm, size)
        : fitted(
            [project, partName(tile)],
            ([p, part]) =>
              `${p!} · ${number} · ${part!}, ${describeJoins(neighboursOf(plan, tile))}`,
            layout.textMaxWidthMm,
            size,
          );
  const { lines, mark } = layout;
  texts.push(words(identity, size, { x: lines.x, y: lines.top }, right));
  const date = now.toISOString().slice(0, 10);
  texts.push(
    words(
      `${date} · ${scaleOf(correction)} · ${APP_NAME}`,
      size,
      { x: lines.x, y: lines.bottom },
      right,
    ),
  );

  // An assembly sheet: its taped part's tiles as a map (7.2).
  if (assembly !== undefined) {
    const drawn = assemblyInk(assembly, contentAreaMm(setup));
    paths.push(...drawn.paths);
    texts.push(...drawn.texts);
  }

  // A tiled sheet: where it joins its neighbours.
  const clipped: ExportPath[] = [];
  const clippedTexts: ExportText[] = [];
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

    // At each shared edge, an arrow at the join naming the sheet beyond (7.2).
    for (const arrow of edgeArrows(tile, neighboursOf(plan, tile))) {
      const drawn = arrowInk(arrow, offset);
      clipped.push(...drawn.paths);
      clippedTexts.push(drawn.label);
    }
  }

  return { paths, clipped, clippedTexts, texts, mark: brandMark(mark, mark.heightMm), clip };
}

/**
 * The sheet's scale, as it says beside its date. `1:1` is what the PDF
 * holds. A corrected sheet does not hold it — its gauge is 100.5 mm in a
 * viewer when its printer prints 0.5 % short — so it says instead that it
 * was corrected, and by how much on each axis of the paper, so a sheet
 * printed from it elsewhere is known for what it is (docs/printing.md §8.2).
 */
function scaleOf(correction: ScaleCorrection): string {
  if (isNoCorrection(correction)) return '1:1';
  const factor = (value: number): string => value.toFixed(4);
  return `corrected for its printer: x ${factor(correction.x)}, y ${factor(correction.y)}`;
}

/** A part's name as the paper gives it, never blank. */
function partName({ part }: { part: { name: string } }): string {
  return part.name.trim() === '' ? 'Part' : part.name.trim();
}

/** `assembly map of sheets 3–4`. */
function mapOf(assembly: Assembly): string {
  const sheets = assembly.tiles.map((entry) => entry.sheet);
  return `assembly map of ${describeSheetNumbers(sheets).toLowerCase()}`;
}

/**
 * An assembly sheet's printable area: what it is and that it is not to scale,
 * across the top, and below that the map — each tile's share of the part as a
 * cell, named with its sheet, over the part's outline in grey.
 */
function assemblyInk(
  assembly: Assembly,
  area: { x: Mm; y: Mm; widthMm: Mm; heightMm: Mm },
): { paths: ExportPath[]; texts: ExportText[] } {
  const { titleSizeMm, noteSizeMm, notes, gapMm, cellLabelMaxMm } = ASSEMBLY_TEXT;
  const texts: ExportText[] = [];
  const top = { align: 'left', baseline: 'top' } as const;
  let y = area.y + area.heightMm;
  const title = fitted(
    [partName(assembly)],
    ([part]) => `${part!} · ${mapOf(assembly)}`,
    area.widthMm,
    titleSizeMm,
  );
  texts.push(words(title, titleSizeMm, { x: area.x, y }, top));
  y -= titleSizeMm + gapMm;
  for (const note of notes) {
    texts.push(words(note, noteSizeMm, { x: area.x, y }, top));
    y -= noteSizeMm + gapMm;
  }

  const region = RectOps.fromCorners(
    { x: area.x, y: area.y },
    { x: area.x + area.widthMm, y: y - gapMm },
  );
  const { cells, placement } = assemblyDiagram(assembly, region);
  const paths = assembly.part.paths
    .filter((item) => item.role === 'cut')
    .map((item) => ink(PathOps.transform(item.path, placement), MAP_OUTLINE));
  for (const cell of cells) {
    const r = cell.rectMm;
    paths.push(
      ink(
        polyline(
          [
            { x: r.minX, y: r.minY },
            { x: r.maxX, y: r.minY },
            { x: r.maxX, y: r.maxY },
            { x: r.minX, y: r.maxY },
          ],
          true,
        ),
        BLOCK,
      ),
    );
    // In the cell's top left corner, where the centred part least often is,
    // as large as the cell allows up to a size read across a table.
    const label = describeSheetNumbers([cell.sheet]);
    const sizeMm = Math.min(
      cellLabelMaxMm,
      (0.6 * RectOps.width(r)) / textWidthMm(label, 1),
      0.3 * RectOps.height(r),
    );
    const inset = sizeMm / 2;
    texts.push(words(label, sizeMm, { x: r.minX + inset, y: r.maxY - inset }, top));
  }
  return { paths, texts };
}

/**
 * An edge arrow on the sheet: its shaft, an open head at the tip, and the
 * neighbour's sheet written past its tail, reading across the sheet.
 */
function arrowInk(arrow: EdgeArrow, offset: Vec2): { paths: ExportPath[]; label: ExportText } {
  const { lengthMm, headLengthMm, headHalfWidthMm, labelSizeMm, labelGapMm } =
    PAPER_FURNITURE.edgeArrow;
  const at = (p: Vec2): Vec2 => ({ x: p.x + offset.x, y: p.y + offset.y });
  const { tip, tail } = arrow;
  const d = { x: (tip.x - tail.x) / lengthMm, y: (tip.y - tail.y) / lengthMm };
  const back = { x: tip.x - d.x * headLengthMm, y: tip.y - d.y * headLengthMm };
  const head = [
    { x: back.x - d.y * headHalfWidthMm, y: back.y + d.x * headHalfWidthMm },
    tip,
    { x: back.x + d.y * headHalfWidthMm, y: back.y - d.x * headHalfWidthMm },
  ];
  const labels: Record<EdgeArrow['side'], { at: Vec2; placement: TextPlacement }> = {
    right: {
      at: { x: tail.x - labelGapMm, y: tail.y },
      placement: { align: 'right', baseline: 'middle' },
    },
    left: {
      at: { x: tail.x + labelGapMm, y: tail.y },
      placement: { align: 'left', baseline: 'middle' },
    },
    above: {
      at: { x: tail.x, y: tail.y - labelGapMm },
      placement: { align: 'centre', baseline: 'top' },
    },
    below: {
      at: { x: tail.x, y: tail.y + labelGapMm },
      placement: { align: 'centre', baseline: 'bottom' },
    },
  };
  const label = labels[arrow.side];
  return {
    paths: [ink(polyline([at(tail), at(tip)]), ARROW), ink(polyline(head.map(at)), ARROW)],
    label: words(describeSheetNumbers([arrow.sheet]), labelSizeMm, at(label.at), label.placement),
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

export function ink(path: Path, style: PrintStyle): ExportPath {
  return { role: 'annotation', path, style };
}

/** Laid out once, as filled outlines: the same shapes on screen and on paper. */
export function words(
  content: string,
  sizeMm: Mm,
  at: Vec2,
  placement: TextPlacement = {},
): ExportText {
  const placed = placedText(content, sizeMm, at, placement);
  return { role: 'annotation', source: content, glyphs: outlinesOf(placed), sizeMm };
}
