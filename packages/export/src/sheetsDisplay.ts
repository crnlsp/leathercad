import { approxEq, type Mm } from '@leathercad/core';
import {
  MatOps,
  PathOps,
  RectOps,
  polyline,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import {
  CANVAS,
  EDGE_PX,
  GROUND,
  PAPER_FURNITURE,
  ROLE_STYLES,
  SHEET,
  extentOf,
  reachesView,
  unionExtent,
  widestPixelsToMm,
  type BoundedItem,
  type DisplayItem,
  type DisplayList,
  type Extent,
  type ViewportView,
} from '@leathercad/render';

import type { PlacedPart, Tile } from './paginate.js';
import { contentAreaMm } from './paper.js';
import type { ExportPath, ExportText } from './scene.js';
import { pathReaches } from './pdf/reach.js';
import { sheetInk } from './sheetInk.js';
import { describeSheetNumbers, sheetLabel, type SheetPlan } from './sheetPlan.js';
import type { SheetsLayout } from './sheetsLayout.js';

/** How far a join line runs past the piece, so its ends are seen. */
const JOIN_OVERRUN_MM = 6;

/** What a halo reaches past its path, in CSS pixels: half its width, and the antialiased edge. */
const HALO_EDGE_PX = CANVAS.halo.widthPx / 2 + EDGE_PX;

/** The tiles of each taped part, keyed by part id, in sheet order. */
function tilesByPart(plan: SheetPlan): Map<string, { bounds: Rect; tiles: Tile[] }> {
  const byPart = new Map<string, { bounds: Rect; tiles: Tile[] }>();
  for (const sheet of plan.sheets) {
    const tile = sheet.tile;
    if (tile === undefined) continue;
    const known = byPart.get(tile.part.id) ?? { bounds: tile.part.boundsMm, tiles: [] };
    known.tiles.push(tile);
    byPart.set(tile.part.id, known);
  }
  return byPart;
}

/**
 * Where a taped piece's sheets will join, drawn on the **design board**
 * (7.4b): each join line the PDF prints, at the same model coordinates, across
 * the piece and a little past it.
 *
 * Screen furniture, not pattern: the magenta that nothing printed can be, one
 * pixel wide, in the join's own printed dash rhythm, and a label saying what
 * it is. It is derived from the sheet plan and moves when the paper or the
 * piece changes; nothing about it is stored, and nothing can select it.
 *
 * Its sizes are CSS pixels, like every screen-constant size: the screen
 * backends apply the display's ratio (U.1).
 */
export function tapeJoins(plan: SheetPlan): DisplayList {
  const items: DisplayItem[] = [];

  for (const { bounds, tiles } of tilesByPart(plan).values()) {
    const xs = unique(tiles.flatMap((tile) => tile.joinsMm.x));
    const ys = unique(tiles.flatMap((tile) => tile.joinsMm.y));
    const low = bounds.minY - JOIN_OVERRUN_MM;
    const high = bounds.maxY + JOIN_OVERRUN_MM;
    const left = bounds.minX - JOIN_OVERRUN_MM;
    const right = bounds.maxX + JOIN_OVERRUN_MM;

    for (const x of xs) {
      items.push(
        joinLine([
          { x, y: low },
          { x, y: high },
        ]),
      );
      items.push(label('Tape join', { x, y: high }, 'center'));
    }
    for (const y of ys) {
      items.push(
        joinLine([
          { x: left, y },
          { x: right, y },
        ]),
      );
      items.push(label('Tape join', { x: right, y }, 'left'));
    }
  }
  return { items };
}

function joinLine(points: { x: Mm; y: Mm }[]): DisplayItem {
  return {
    kind: 'path',
    role: 'construction',
    path: polyline(points),
    stroke: {
      colour: SHEET.furniture,
      widthPx: SHEET.joinStrokePx,
      dashMm: PAPER_FURNITURE.join.dashMm,
    },
  };
}

function label(text: string, at: { x: Mm; y: Mm }, align: 'center' | 'left'): DisplayItem {
  return {
    kind: 'overlay-text',
    role: 'construction',
    at,
    text,
    sizePx: SHEET.joinLabelPx,
    colour: SHEET.furniture,
    align,
    baseline: align === 'center' ? 'bottom' : 'middle',
  };
}

/** Joins closer than EPS_POINT are one join: two tiles name the one they share. */
function unique(values: readonly Mm[]): Mm[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, i) => i === 0 || !approxEq(value, sorted[i - 1]!));
}

/** One layer of the Sheets view: drawn clipped to `clipMm` when it has one. */
export interface SheetsLayer {
  readonly list: DisplayList;
  readonly clipMm: Rect | null;
}

/**
 * One sheet of the Sheets view, or a taped piece's name below its grid, as
 * drawn: its items in the order the view draws them, and where they can put
 * ink (PERF-003). A page is the unit the camera leaves out — a page it can see
 * any of is drawn whole, as it always was.
 *
 * `paper` is drawn under every page's `base`, and a taped sheet's `tile`
 * above it, whichever pages are drawn: the order the view has always had,
 * because a sheet's label can run over another sheet's paper when zoomed out.
 */
export interface SheetsPage {
  /** Null for a page that draws nothing. */
  readonly extent: Extent | null;
  readonly paper: readonly BoundedItem[];
  readonly base: readonly BoundedItem[];
  readonly tile: SheetsLayer | null;
  /** The pieces on this page, where their ink starts in `tile`'s items, or in `base`'s when untiled. */
  readonly pieces: readonly SheetPiece[];
}

/**
 * A piece on a page. Its ink is part of the page and never changes; a halo —
 * the only thing selecting or pointing at it adds — is drawn beneath that ink,
 * so the page's items are cut at `start` and the halo put there (PERF-003).
 */
interface SheetPiece {
  readonly partId: string;
  /** Where the piece's own origin is on the view. */
  readonly at: Vec2;
  /** What the halo follows. */
  readonly paths: readonly ExportPath[];
  readonly start: number;
}

/** What is emphasised: parts to halo as selected, and a part to halo as under the pointer. */
export interface SheetsEmphasis {
  readonly selected?: ReadonlySet<string>;
  readonly hovered?: string | null;
}

export interface SheetsContentOptions {
  /** Dates the footer, as the PDF's is dated when it is written. */
  readonly now: Date;
  /**
   * The screen's words for what the view labels (U.9, ADR 0018), which the
   * app supplies: a package below it holds no sentence of the interface's.
   * Absent, the labels are the paper's own English and no piece is captioned.
   */
  readonly words?: SheetsWords;
}

export type SheetsViewOptions = SheetsContentOptions & SheetsEmphasis;

/** The interface's words on the Sheets view. */
export interface SheetsWords {
  /** Above a sheet: "Sheet 1 of 2 · 2 pieces". */
  readonly sheet: (number: number, count: number, pieces: number) => string;
  /** Below a sheet holding pieces turned a quarter to save a sheet: "Outer, turned 90°". */
  readonly turned: (names: readonly string[]) => string;
  /** Below a taped piece's sheets: "Strap, taped: sheets 2–3". */
  readonly taped: (name: string, sheets: readonly number[]) => string;
  /** Above a taped piece's assembly sheet (7.2): "Sheet 2 of 4 · Assembly map of Strap". */
  readonly assembly: (number: number, count: number, name: string) => string;
}

/**
 * The sheet plan drawn as the paper it will be (7.4c): **what the Sheets view
 * shows is what the PDF prints**, because it is drawn from the same plan and
 * the same `sheetInk`, placed by the same offsets.
 *
 * - White sheets on a dimmed ground; the margins plain white.
 * - Everything that prints — pieces, captions, the verification block, the
 *   footer, a taped sheet's joins and crosses — in **ink**: the print grey of
 *   its role or furniture, at true-millimetre dash rhythms.
 * - Everything that does not print — the printable area's outline, the
 *   verification band's tint, "Sheet 2 of 3" above a sheet, a taped piece's
 *   name below its grid — in the **furniture** magenta, which no ink can be.
 *
 * A taped sheet is a layer of its own, clipped to its printable area as the
 * PDF clips it. Sizes on screen are CSS pixels, as on the Design board (U.1).
 */
export function sheetsView(
  plan: SheetPlan,
  layout: SheetsLayout,
  options: SheetsViewOptions,
): readonly SheetsLayer[] {
  return sheetsLayers(sheetsPages(plan, layout, options), undefined, options);
}

/**
 * The pages of the Sheets view, whole and in drawing order, before any camera
 * has looked at them and before anything is emphasised: they are the paper
 * and its ink, which only the plan, the date and the words change. What
 * `sheetsView` draws is `sheetsLayers` of this; the app keeps these and asks
 * for the layers again for each camera and each pointer position.
 */
export function sheetsPages(
  plan: SheetPlan,
  layout: SheetsLayout,
  options: SheetsContentOptions,
): readonly SheetsPage[] {
  const { words } = options;
  const area = contentAreaMm(plan.setup);
  const m = plan.setup.marginsMm;

  const pages: SheetsPage[] = [];

  for (const frame of layout.frames) {
    const base: BoundedItem[] = [];
    const paper: BoundedItem[] = [];
    let tile: SheetsLayer | null = null;
    const sheet = plan.sheets[frame.index]!;
    const ink = sheetInk(plan, frame.index, options.now);
    const o = frame.origin;
    const shift = (x: Mm, y: Mm): Vec2 => ({ x: o.x + x, y: o.y + y });
    // A taped sheet shows its piece through its printable area, as the PDF does.
    const clipMm =
      ink.clip === null
        ? null
        : RectOps.fromCorners(
            shift(ink.clip.minX, ink.clip.minY),
            shift(ink.clip.maxX, ink.clip.maxY),
          );

    // The paper, and what of it is not the pattern's.
    const sheetRect = rect(shift(0, 0), shift(frame.widthMm, frame.heightMm));
    paper.push({ kind: 'fill', role: 'construction', paths: [sheetRect], colour: SHEET.paper });
    paper.push(stroke(sheetRect, SHEET.paperEdge, SHEET.hairlinePx));
    paper.push({
      kind: 'fill',
      role: 'construction',
      paths: [rect(shift(m.left, m.bottom), shift(frame.widthMm - m.right, area.y))],
      colour: SHEET.reservedBand,
    });
    paper.push(
      stroke(
        rect(shift(area.x, area.y), shift(area.x + area.widthMm, area.y + area.heightMm)),
        SHEET.furniture,
        SHEET.hairlinePx,
        SHEET.outlineDashPx,
      ),
    );

    // Its number, above it: on screen only — the footer prints it.
    const number = frame.index + 1;
    const count = plan.sheets.length;
    base.push(
      overlay(
        (sheet.assembly === undefined
          ? words?.sheet(number, count, sheet.placements.length)
          : words?.assembly(number, count, sheet.assembly.part.name)) ?? sheetLabel(number, count),
        shift(0, frame.heightMm + 2),
        'left',
        'bottom',
      ),
    );

    // The verification strip, as printed.
    for (const item of ink.paths) base.push(inkPath(item, o));
    for (const text of ink.texts) base.push(inkText(text, o));
    base.push({
      kind: 'fill',
      role: 'annotation',
      paths: ink.mark.map((path) => moved(path, o)),
      colour: inkColour(0),
    });

    // The pieces' ink, and where each piece's starts: a halo goes there.
    const placed: BoundedItem[] = [];
    const found: SheetPiece[] = [];
    for (const placement of sheet.placements) {
      const at = { x: o.x + placement.offsetMm.x, y: o.y + placement.offsetMm.y };
      found.push({
        partId: placement.part.id,
        at,
        paths: placement.part.paths,
        start: placed.length,
      });
      for (const item of piece(placement, at, clipMm)) placed.push(item);
    }

    // Pieces turned to save a sheet, named below it: the printed name runs up the
    // piece's side, where nobody reads it. Screen only, and never over the pattern.
    const turned = sheet.placements.filter((placement) => placement.turned);
    if (words !== undefined && turned.length > 0) {
      base.push(
        overlay(
          words.turned(turned.map((placement) => placement.part.name)),
          shift(0, -2),
          'left',
          'top',
        ),
      );
    }

    let pieces = found;
    if (clipMm === null) {
      // On a whole sheet the ink follows the page's own items.
      const after = base.length;
      pieces = found.map((one) => ({ ...one, start: after + one.start }));
      for (const item of placed) base.push(item);
    } else {
      for (const item of ink.clipped) placed.push(inkPath(item, o));
      for (const text of ink.clippedTexts) placed.push(inkText(text, o));
      tile = { list: { items: placed }, clipMm };
    }
    pages.push({
      extent: extentOfPage(paper, base, tile, pieces.length > 0),
      paper,
      base,
      tile,
      pieces,
    });
  }

  // A taped piece's name, below its grid.
  for (const group of layout.groups) {
    const base = [
      overlay(
        words?.taped(group.name, group.sheets) ??
          `${group.name}, taped: ${describeSheetNumbers(group.sheets).toLowerCase()}`,
        { x: group.bounds.minX, y: group.bounds.minY - 2 },
        'left',
        'top',
      ),
    ];
    pages.push({ extent: extentOf(base), paper: [], base, tile: null, pieces: [] });
  }

  return pages;
}

/**
 * Where a sheet can put ink. A taped sheet's piece is clipped, so it reaches
 * no further than its clip — and need not be measured path by path, which for
 * a long strap is thousands of holes on each of dozens of sheets.
 */
function extentOfPage(
  paper: readonly BoundedItem[],
  base: readonly BoundedItem[],
  tile: SheetsLayer | null,
  hasPieces: boolean,
): Extent | null {
  const parts = [extentOf(paper), extentOf(base)];
  if (tile?.clipMm) parts.push({ boundsMm: tile.clipMm, marginPx: EDGE_PX });
  const all = parts.reduce<Extent | null>(
    (sum, part) => (sum === null ? part : part === null ? sum : unionExtent(sum, part)),
    null,
  );
  // A halo, once a piece has one, is a wide stroke round its outline.
  return all !== null && hasPieces
    ? { ...all, marginPx: Math.max(all.marginPx, HALO_EDGE_PX) }
    : all;
}

/**
 * The layers that draw `pages` — the ones `view` can see any of, or all of
 * them without one — as the view has always drawn them: every sheet's paper,
 * then everything on the sheets and the taped pieces' names, then each taped
 * sheet's clipped piece. Leaving a page out leaves everything else exactly
 * where it was drawn.
 *
 * `emphasis` puts a halo under each piece it names, on the pages drawn: a
 * page's own ink is the same whatever is under the pointer, so pointing at a
 * piece builds only the halos that are seen (PERF-003).
 */
export function sheetsLayers(
  pages: readonly SheetsPage[],
  view?: ViewportView,
  emphasis: SheetsEmphasis = {},
): readonly SheetsLayer[] {
  const seen = (
    view === undefined
      ? pages
      : pages.filter((page) => page.extent !== null && reachesView(view, page.extent))
  ).map((page) => haloed(page, emphasis));
  return [
    {
      list: {
        items: [...seen.flatMap((page) => page.paper), ...seen.flatMap((page) => page.base)],
      },
      clipMm: null,
    },
    ...seen.flatMap((page) => (page.tile === null ? [] : [page.tile])),
  ];
}

/** The halo a piece is given: selected over hovered, as ever. */
function haloColour(partId: string, { selected, hovered }: SheetsEmphasis): string | null {
  return selected?.has(partId) === true
    ? CANVAS.halo.selected
    : hovered === partId
      ? CANVAS.halo.hover
      : null;
}

/** The last halos built for a page, and for which of its pieces: a pan reuses them. */
const halos = new WeakMap<SheetsPage, { readonly key: string; readonly page: SheetsPage }>();

/**
 * The page with a halo under each of its emphasised pieces: the page itself
 * when none is, and otherwise its items cut at each such piece's `start`, so a
 * halo lies under the piece's own ink and over what came before it, as it always has.
 */
function haloed(page: SheetsPage, emphasis: SheetsEmphasis): SheetsPage {
  const marked = page.pieces.flatMap((one) => {
    const colour = haloColour(one.partId, emphasis);
    return colour === null ? [] : [{ one, colour }];
  });
  if (marked.length === 0) return page;

  // The part too: two pieces share a `start` when the first emits nothing.
  const key = marked.map(({ one, colour }) => `${one.partId}@${String(one.start)}${colour}`).join();
  const known = halos.get(page);
  if (known?.key === key) return known.page;

  const clip = page.tile?.clipMm ?? null;
  const cut = <T extends DisplayItem>(items: readonly T[]): (T | BoundedItem)[] => {
    const out: (T | BoundedItem)[] = [];
    let from = 0;
    for (const { one, colour } of marked) {
      for (; from < one.start; from++) out.push(items[from]!);
      for (const { path } of one.paths) {
        if (!shows(path, one.at, clip, HALO_EDGE_PX)) continue;
        out.push(stroke(moved(path, one.at), colour, CANVAS.halo.widthPx));
      }
    }
    for (; from < items.length; from++) out.push(items[from]!);
    return out;
  };
  const made: SheetsPage =
    page.tile === null
      ? { ...page, base: cut(page.base) }
      : { ...page, tile: { ...page.tile, list: { items: cut(page.tile.list.items) } } };
  halos.set(page, { key, page: made });
  return made;
}

/**
 * Whether a path of a piece, moved by `at`, can put ink inside `clip` — true
 * for a whole sheet, which has none. The ink of a taped sheet is clipped to its
 * printable area, so a path that cannot reach it is drawn for nothing, and for
 * a long strap that is most of its thousands of holes on each of dozens of sheets.
 *
 * The path's box is grown by what a stroke of `marginPx` reaches *at the
 * smallest zoom*, the most millimetres it ever is, so the answer does not
 * depend on the camera and nothing has to be built again when it moves.
 */
function shows(path: Path, at: Vec2, clip: Rect | null, marginPx: number): boolean {
  return clip === null || pathReaches(path, at, clip, widestPixelsToMm(marginPx));
}

/** A placed piece in ink: all of it, or what can show through `clip`. */
function piece(placement: PlacedPart, at: Vec2, clip: Rect | null): BoundedItem[] {
  const items: BoundedItem[] = [];
  for (const item of placement.part.paths) {
    const margin = item.filled === true ? EDGE_PX : strokePx(item) / 2 + EDGE_PX;
    if (shows(item.path, at, clip, margin)) items.push(inkPath(item, at));
  }
  for (const text of placement.part.texts) {
    // A contour clear of the clip adds nothing inside it, whatever the fill
    // rule, so a word keeps only those that can show.
    const glyphs = text.glyphs.filter((glyph) => shows(glyph, at, clip, EDGE_PX));
    if (clip === null || glyphs.length > 0) items.push(inkText(text, at, glyphs));
  }
  return items;
}

/** Print grey as a screen colour: 0 is black, 1 is white. */
function inkColour(grey: number): string {
  const level = Math.round(Math.min(1, Math.max(0, grey)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${level}${level}${level}`;
}

/** Screen-constant, like every stroke on a canvas; the rhythm is true. */
function strokePx(item: ExportPath): number {
  return item.role === 'annotation' ? SHEET.hairlinePx : ROLE_STYLES[item.role].widthPx;
}

function inkPath(item: ExportPath, at: Vec2): BoundedItem {
  if (item.filled === true) {
    return {
      kind: 'fill',
      role: item.role,
      paths: [moved(item.path, at)],
      colour: inkColour(item.style.grey),
    };
  }
  return {
    kind: 'path',
    role: item.role,
    path: moved(item.path, at),
    stroke: {
      colour: inkColour(item.style.grey),
      widthPx: strokePx(item),
      dashMm: item.style.dashMm,
    },
  };
}

/** A word as filled glyphs: all of them, or those of them given. */
function inkText(text: ExportText, at: Vec2, glyphs: readonly Path[] = text.glyphs): BoundedItem {
  return {
    kind: 'fill',
    role: text.role,
    paths: glyphs.map((glyph) => moved(glyph, at)),
    colour: inkColour(0),
  };
}

function moved(path: Path, by: Vec2): Path {
  return PathOps.transform(path, MatOps.fromTranslation(by));
}

function rect(a: Vec2, b: Vec2): Path {
  return polyline([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], true);
}

function stroke(
  path: Path,
  colour: string,
  widthPx: number,
  dashPx?: readonly number[],
): BoundedItem {
  return {
    kind: 'path',
    role: 'construction',
    path,
    stroke: dashPx === undefined ? { colour, widthPx } : { colour, widthPx, dashPx },
  };
}

/**
 * Screen-only words, in the board's own voice (R-01, U.2): 12 px at 600, in
 * `GROUND.label`, 4.5:1 on the sheets' ground where the furniture magenta is
 * not. They sit on the bare ground, so they need no halo.
 */
function overlay(
  text: string,
  at: Vec2,
  align: 'left' | 'center',
  baseline: 'top' | 'bottom',
): BoundedItem {
  const { name } = CANVAS.text;
  return {
    kind: 'overlay-text',
    role: 'construction',
    at,
    text,
    sizePx: name.sizePx,
    colour: GROUND.label,
    align,
    baseline,
    weight: name.weight,
  };
}
