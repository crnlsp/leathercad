import type { Mm } from '@leathercad/core';
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
  PAPER_FURNITURE,
  ROLE_STYLES,
  SHEET,
  type DisplayItem,
  type DisplayList,
} from '@leathercad/render';

import type { PlacedPart, Tile } from './paginate.js';
import { contentAreaMm } from './paper.js';
import type { ExportPath, ExportText } from './scene.js';
import { sheetInk } from './sheetInk.js';
import { describeSheetNumbers, sheetLabel, type SheetPlan } from './sheetPlan.js';
import type { SheetsLayout } from './sheetsLayout.js';

/** How far a join line runs past the piece, so its ends are seen. */
const JOIN_OVERRUN_MM = 6;

/** Screen furniture options: the device pixel ratio, for text that stays the size it says. */
export interface FurnitureOptions {
  readonly dpr?: number;
}

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
 */
export function tapeJoins(plan: SheetPlan, options: FurnitureOptions = {}): DisplayList {
  const dpr = options.dpr ?? 1;
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
      items.push(label('Tape join', { x, y: high }, dpr, 'center'));
    }
    for (const y of ys) {
      items.push(
        joinLine([
          { x: left, y },
          { x: right, y },
        ]),
      );
      items.push(label('Tape join', { x: right, y }, dpr, 'left'));
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

function label(
  text: string,
  at: { x: Mm; y: Mm },
  dpr: number,
  align: 'center' | 'left',
): DisplayItem {
  return {
    kind: 'overlay-text',
    role: 'construction',
    at,
    text,
    sizePx: SHEET.joinLabelPx * dpr,
    colour: SHEET.furniture,
    align,
    baseline: align === 'center' ? 'bottom' : 'middle',
  };
}

function unique(values: readonly Mm[]): Mm[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, i) => i === 0 || Math.abs(value - sorted[i - 1]!) > 1e-6);
}

/** One layer of the Sheets view: drawn clipped to `clipMm` when it has one. */
export interface SheetsLayer {
  readonly list: DisplayList;
  readonly clipMm: Rect | null;
}

export interface SheetsViewOptions extends FurnitureOptions {
  /** Dates the footer, as the PDF's is dated when it is written. */
  readonly now: Date;
  /** Parts to halo, as selected. */
  readonly selected?: ReadonlySet<string>;
  /** A part to halo, as under the pointer. */
  readonly hovered?: string | null;
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
 * PDF clips it.
 */
export function sheetsView(
  plan: SheetPlan,
  layout: SheetsLayout,
  options: SheetsViewOptions,
): readonly SheetsLayer[] {
  const dpr = options.dpr ?? 1;
  const selected = options.selected ?? new Set<string>();
  const hovered = options.hovered ?? null;
  const area = contentAreaMm(plan.setup);
  const m = plan.setup.marginsMm;

  const base: DisplayItem[] = [];
  const paper: DisplayItem[] = [];
  const tiles: SheetsLayer[] = [];

  for (const frame of layout.frames) {
    const sheet = plan.sheets[frame.index]!;
    const ink = sheetInk(plan, frame.index, options.now);
    const o = frame.origin;
    const shift = (x: Mm, y: Mm): Vec2 => ({ x: o.x + x, y: o.y + y });

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
        SHEET.outlineDashPx.map((px) => px * dpr),
      ),
    );

    // Its number, above it: on screen only — the footer prints it.
    base.push(
      overlay(
        sheetLabel(frame.index + 1, plan.sheets.length),
        shift(0, frame.heightMm + 2),
        dpr,
        'left',
        'bottom',
      ),
    );

    // The verification block, the tile label and the footer, as printed.
    for (const item of ink.paths) base.push(inkPath(item, o));
    for (const text of ink.texts) base.push(inkText(text, o));

    const pieces: DisplayItem[] = [];
    for (const placement of sheet.placements) {
      const at = { x: o.x + placement.offsetMm.x, y: o.y + placement.offsetMm.y };
      const emphasis = selected.has(placement.part.id)
        ? CANVAS.halo.selected
        : hovered === placement.part.id
          ? CANVAS.halo.hover
          : null;
      pieces.push(...piece(placement, at, emphasis));
    }

    if (ink.clip === null) {
      base.push(...pieces);
    } else {
      for (const item of ink.clipped) pieces.push(inkPath(item, o));
      tiles.push({
        list: { items: pieces },
        clipMm: RectOps.fromCorners(
          shift(ink.clip.minX, ink.clip.minY),
          shift(ink.clip.maxX, ink.clip.maxY),
        ),
      });
    }
  }

  // A taped piece's name, below its grid.
  for (const group of layout.groups) {
    base.push(
      overlay(
        `${group.name}, taped: ${describeSheetNumbers(group.sheets).toLowerCase()}`,
        { x: group.bounds.minX, y: group.bounds.minY - 2 },
        dpr,
        'left',
        'top',
      ),
    );
  }

  return [{ list: { items: [...paper, ...base] }, clipMm: null }, ...tiles];
}

/** A placed piece in ink, over its halo when it is selected or hovered. */
function piece(placement: PlacedPart, at: Vec2, halo: string | null): DisplayItem[] {
  const items: DisplayItem[] = [];
  if (halo !== null) {
    for (const item of placement.part.paths) {
      items.push(stroke(moved(item.path, at), halo, CANVAS.halo.widthPx));
    }
  }
  for (const item of placement.part.paths) items.push(inkPath(item, at));
  for (const text of placement.part.texts) items.push(inkText(text, at));
  return items;
}

/** Print grey as a screen colour: 0 is black, 1 is white. */
function inkColour(grey: number): string {
  const level = Math.round(Math.min(1, Math.max(0, grey)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${level}${level}${level}`;
}

function inkPath(item: ExportPath, at: Vec2): DisplayItem {
  return {
    kind: 'path',
    role: item.role,
    path: moved(item.path, at),
    stroke: {
      colour: inkColour(item.style.grey),
      // Screen-constant, like every stroke on a canvas; the rhythm is true.
      widthPx: item.role === 'annotation' ? SHEET.hairlinePx : ROLE_STYLES[item.role].widthPx,
      dashMm: item.style.dashMm,
    },
  };
}

function inkText(text: ExportText, at: Vec2): DisplayItem {
  return {
    kind: 'fill',
    role: text.role,
    paths: text.glyphs.map((glyph) => moved(glyph, at)),
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
): DisplayItem {
  return {
    kind: 'path',
    role: 'construction',
    path,
    stroke: dashPx === undefined ? { colour, widthPx } : { colour, widthPx, dashPx },
  };
}

function overlay(
  text: string,
  at: Vec2,
  dpr: number,
  align: 'left' | 'center',
  baseline: 'top' | 'bottom',
): DisplayItem {
  return {
    kind: 'overlay-text',
    role: 'construction',
    at,
    text,
    sizePx: SHEET.labelPx * dpr,
    colour: SHEET.furniture,
    align,
    baseline,
  };
}
