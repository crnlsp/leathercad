import { formatMm, formatNumber, type Mm } from '@leathercad/core';
import { RectOps, type Vec2 } from '@leathercad/geometry';

import { contentAreaMm, paperOptionsFitting, type PageSetup } from './paper.js';
import type { ExportPart, ExportScene } from './scene.js';

/** Space left between parts on a sheet, so cut lines never touch. */
const PART_GAP_MM = 8;

/** Room above a part for its printed name. */
const LABEL_HEIGHT_MM = 5;

export interface PlacedPart {
  readonly part: ExportPart;
  /**
   * Where the part's bounds origin lands on the sheet, in millimetres from
   * the bottom-left of the paper. Y is up, matching PDF.
   */
  readonly offsetMm: Vec2;
}

export interface Page {
  readonly index: number;
  readonly placements: readonly PlacedPart[];
}

export interface PaginationResult {
  readonly pages: readonly Page[];
  /**
   * Parts too large for one sheet at 1:1.
   *
   * Never scaled to fit and never clipped — that would silently produce a
   * template that cuts the wrong size, which is the one failure this whole
   * application exists to prevent. Splitting a single oversized part across
   * sheets is tiling, which is a different algorithm and future work.
   */
  readonly oversized: readonly OversizedPart[];
}

export interface OversizedPart {
  readonly part: ExportPart;
  readonly widthMm: Mm;
  readonly heightMm: Mm;
  /** The paper it was measured against: the one the maker chose. */
  readonly on: { paper: { name: string }; orientation: string };
  /**
   * Papers that would fit it, for telling the user what to do instead. The
   * chosen paper turned comes first when it fits, since that is the paper in
   * their printer; then the rest in the order of `PAPER_SIZES`.
   */
  readonly fitsOn: ReadonlyArray<{ paper: { name: string }; orientation: string }>;
}

/**
 * Packs whole parts onto sheets.
 *
 * This is **part packing, not tiling**: each part is placed complete on one
 * sheet and the overflow moves to the next page. Leatherworkers print on A4
 * and cut each piece out separately, so the spatial arrangement on the canvas
 * carries no meaning on paper — repacking to save sheets is the better trade.
 *
 * Shelf packing: parts are sorted tallest first and laid left to right in
 * rows. Not optimal — bin packing never is, cheaply — but it wastes little on
 * the handful of parts a real pattern has, and it is predictable, which
 * matters more than optimal when someone is checking their printout.
 */
export function paginate(scene: ExportScene, setup: PageSetup): PaginationResult {
  const area = contentAreaMm(setup);
  const oversized: OversizedPart[] = [];
  const fitting: ExportPart[] = [];

  for (const part of scene.parts) {
    const width = RectOps.width(part.boundsMm);
    const height = RectOps.height(part.boundsMm) + LABEL_HEIGHT_MM;

    if (width > area.widthMm || height > area.heightMm) {
      const options = paperOptionsFitting(width, height, setup);
      const turned = options.filter((option) => option.paper.name === setup.paper.name);
      oversized.push({
        part,
        widthMm: width,
        heightMm: height - LABEL_HEIGHT_MM,
        on: { paper: { name: setup.paper.name }, orientation: setup.orientation },
        fitsOn: [...turned, ...options.filter((option) => !turned.includes(option))].map(
          (option) => ({ paper: { name: option.paper.name }, orientation: option.orientation }),
        ),
      });
    } else {
      fitting.push(part);
    }
  }

  // Tallest first, so short parts fill the gaps beside them rather than
  // starting a row of their own.
  const ordered = [...fitting].sort(
    (a, b) => RectOps.height(b.boundsMm) - RectOps.height(a.boundsMm),
  );

  const pages: Page[] = [];
  let placements: PlacedPart[] = [];
  let cursorX = 0;
  // Y measures downward from the top of the content area while packing; it is
  // converted to PDF's bottom-up origin when a part is placed.
  let rowTop = 0;
  let rowHeight = 0;

  const flushPage = (): void => {
    if (placements.length > 0) pages.push({ index: pages.length, placements });
    placements = [];
    cursorX = 0;
    rowTop = 0;
    rowHeight = 0;
  };

  for (const part of ordered) {
    const width = RectOps.width(part.boundsMm);
    const height = RectOps.height(part.boundsMm) + LABEL_HEIGHT_MM;

    // Wrap to the next row when this part would run off the right edge.
    if (cursorX > 0 && cursorX + width > area.widthMm) {
      rowTop += rowHeight + PART_GAP_MM;
      cursorX = 0;
      rowHeight = 0;
    }

    // Start a new page when the row would run off the bottom.
    if (rowTop + height > area.heightMm) {
      flushPage();
    }

    placements.push({
      part,
      offsetMm: {
        x: area.x + cursorX - part.boundsMm.minX,
        // Flip the downward packing cursor into PDF's upward page space.
        y: area.y + area.heightMm - rowTop - height - part.boundsMm.minY,
      },
    });

    cursorX += width + PART_GAP_MM;
    rowHeight = Math.max(rowHeight, height);
  }

  flushPage();

  return { pages, oversized };
}

/** A sentence a user can act on, for the oversized case. */
export function describeOversized(entry: OversizedPart): string {
  const size = `${formatNumber(entry.widthMm, 1)} × ${formatMm(entry.heightMm, 1)}`;
  if (entry.fitsOn.length === 0) {
    return `"${entry.part.name}" is ${size} and does not fit any supported paper at 1:1.`;
  }
  const best = entry.fitsOn[0]!;
  return `"${entry.part.name}" is ${size} and will not fit ${entry.on.paper.name} ${entry.on.orientation} at 1:1. It fits ${best.paper.name} ${best.orientation}.`;
}
