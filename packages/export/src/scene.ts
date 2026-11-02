import { EPS_LENGTH, approxZero, type Mm } from '@leathercad/core';
import {
  LAYER_ROLES,
  draftDimensionLine,
  type Feature,
  type LayerRole,
  type ResolvedPart,
  type ResolvedProject,
} from '@leathercad/domain';
import {
  MatOps,
  PathOps,
  RectOps,
  SegmentOps,
  Shapes,
  type Path,
  type Rect,
  type Vec2,
} from '@leathercad/geometry';
import {
  CAPTION_GAP_MM,
  CAPTION_SIZE_MM,
  DIMENSION_MARKS,
  ROLE_STYLES,
  describePart,
} from '@leathercad/render';
import { outlinesOf, placedText, type PlacedText } from '@leathercad/typography';

/**
 * How a layer role is drawn on paper.
 *
 * **Widths are true millimetres**, unlike on screen where they are constant in
 * pixels. A cut line printed at 0.25 mm is 0.25 mm on the page.
 *
 * Everything is black, distinguished by line style. A mono printer renders
 * blue and green as indistinguishable greys, and a template exists to be
 * photocopied, glued to card and cut.
 */
export interface PrintStyle {
  readonly widthMm: Mm;
  /** Dash pattern in millimetres. Empty is solid. */
  readonly dashMm: readonly number[];
  /** 0 is black, 1 is white. */
  readonly grey: number;
}

/**
 * Read from the one role table in `packages/render/src/theme`, which the screen
 * reads too — so a line cannot be dotted on paper and solid on screen again
 * (UI Foundations §2).
 */
export const PRINT_STYLES: Readonly<Record<LayerRole, PrintStyle>> = Object.fromEntries(
  LAYER_ROLES.map((role) => {
    const { widthMm, dashMm, grey } = ROLE_STYLES[role];
    return [role, { widthMm, dashMm, grey }];
  }),
) as Record<LayerRole, PrintStyle>;

/**
 * How big a stitch hole is drawn on the template.
 *
 * A marker, not the hole itself: the awl makes the hole, and what the paper
 * has to carry is where its centre goes. One millimetre is small enough to
 * mark a centre precisely and large enough to survive a photocopier.
 *
 * Not a stored parameter. It is a property of the printed template rather than
 * of the design, and nothing in the workflow yet asks to change it.
 */
export const STITCH_HOLE_MARKER_DIAMETER_MM = 1;

export interface ExportPath {
  readonly role: LayerRole;
  readonly path: Path;
  readonly style: PrintStyle;
  /**
   * Filled in the style's grey rather than stroked: a dimension's arrowhead
   * (4.10b). A file that cannot fill — a DXF — draws its outline.
   */
  readonly filled?: true;
}

/**
 * Text on paper: filled glyph outlines, never a font.
 *
 * Laid out once by `packages/typography` and written as paths, so no font is
 * embedded in any export and every viewer and cutter program shows the same
 * shapes (ADR 0011). `source` rides along for tests and diagnostics — nothing
 * draws it.
 */
export interface ExportText {
  readonly role: LayerRole;
  readonly source: string;
  readonly glyphs: readonly Path[];
  readonly sizeMm: Mm;
}

// Size and placement come from `render`, so the caption above a piece on
// screen is the caption above it on paper.

/**
 * One part, ready to place on a page.
 *
 * Geometry is kept in its own coordinates with the bounds alongside, so the
 * paginator can position it without rewriting every point.
 */
export interface ExportPart {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly paths: readonly ExportPath[];
  /**
   * The caption, in the part's own coordinates like its paths.
   *
   * The caption is deliberately outside `boundsMm`, which is the box of
   * everything else the part prints — its geometry and its own words: the
   * paginator packs the pieces, and a caption is allowed to sit in the gap
   * above one.
   */
  readonly texts: readonly ExportText[];
  readonly boundsMm: Rect;
}

export interface ExportScene {
  readonly projectName: string;
  readonly parts: readonly ExportPart[];
}

/**
 * Turns an evaluated project into something printable.
 *
 * Failed features are dropped rather than drawn: a template is a cutting
 * instruction, and half of a broken shape is worse than none of it. The
 * problems panel is where a user is told; the paper is not the place.
 *
 * `roles` are the layer roles that reach the scene (6.4; `EXPORT_PRESETS`),
 * every role unless a preset or the maker says otherwise.
 */
export function buildExportScene(
  resolved: ResolvedProject,
  projectName: string,
  roles: readonly LayerRole[] = LAYER_ROLES,
): ExportScene {
  const wanted = new Set(roles);
  const parts: ExportPart[] = [];

  for (const resolvedPart of resolved.parts) {
    const ink = inkOf(resolvedPart);

    // A part with only labels on it has nothing to cut, and a template page
    // full of captions with no pieces is not a template. Asked of the part as
    // drawn whole: a laser file leaves a part's stitching out and still has
    // the part.
    if (ink.paths.length === 0) continue;

    // The roles asked for (6.4) are chosen here, once, for every writer: the
    // PDF, the SVG and the DXF add no filter of their own. The box and the
    // caption follow what is left, so a page is the size of what it holds.
    const kept = onlyWanted(ink.paths, wanted);
    const words = onlyWanted(ink.texts, wanted);
    // Whole: as every role prints it, caption included — the one way of a
    // part worth keeping, since it is the one every revision asks for.
    const whole = kept === ink.paths && words === ink.texts && wanted.has('annotation');

    const bounds = whole ? ink.boundsMm : boundsOf(kept, words);
    if (bounds === null) continue;

    const { id, quantity } = resolvedPart.part;
    const name = describePart(resolvedPart.part);

    // Renaming a part, or any edit to another, leaves this one's ink as it
    // was; so the part as printed is the one already made, caption and all.
    const made = whole ? printed.get(ink) : undefined;
    if (made?.id === id && made.name === name && made.quantity === quantity) {
      parts.push(made);
      continue;
    }

    const part: ExportPart = {
      id,
      name,
      quantity,
      paths: kept,
      texts: wanted.has('annotation') ? [captionFor(name, bounds), ...words] : words,
      boundsMm: bounds,
    };
    if (whole) printed.set(ink, part);
    parts.push(part);
  }

  return { projectName, parts };
}

/**
 * Everything a part prints except its caption, in every role: its paths, its
 * words, and the box of the two.
 *
 * The heavy half of an `ExportPart` — a circle per hole, an outline per glyph —
 * and the half a name, a quantity or an edit to another part leaves alone.
 * Made once and shared by every revision that draws the same geometry, rather
 * than once per project in history (PERF-001): two hundred renames of one
 * part in a forty-part bag held 1.3 GiB of copies of the same circles.
 */
interface PartInk {
  /**
   * What it was drawn from, three entries a feature: its path, its holes and
   * its words, or nothing for a feature that failed. Evaluation hands back the
   * same objects for geometry that did not change (`domain/src/evaluate.ts`).
   */
  readonly drawnFrom: readonly unknown[];
  readonly paths: readonly ExportPath[];
  readonly texts: readonly ExportText[];
  /** The box of `paths` and `texts` together; null when there is nothing in it. */
  readonly boundsMm: Rect | null;
}

/**
 * Keyed by the part's features: an edit to any of them is a new array (inputs
 * are never mutated), a rename keeps it. The features alone are not enough —
 * a stitch line can follow an outline in **another** part, and moving that
 * outline leaves this array as it was — so an entry is only reused while
 * `drawnFrom` is the same, object for object, as evaluation's cache does.
 */
const inks = new WeakMap<readonly Feature[], PartInk>();

/** The last part printed whole from an ink, so an unchanged part is the same object. */
const printed = new WeakMap<PartInk, ExportPart>();

function inkOf(resolvedPart: ResolvedPart): PartInk {
  const drawnFrom = resolvedPart.features.flatMap((entry) =>
    entry.ok ? [entry.path, entry.holes, entry.text] : [undefined, undefined, undefined],
  );
  const known = inks.get(resolvedPart.part.features);
  if (known !== undefined && sameObjects(known.drawnFrom, drawnFrom)) return known;

  const ink = drawInk(resolvedPart, drawnFrom);
  inks.set(resolvedPart.part.features, ink);
  return ink;
}

function sameObjects(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function drawInk(resolvedPart: ResolvedPart, drawnFrom: readonly unknown[]): PartInk {
  const paths: ExportPath[] = [];
  const texts: ExportText[] = [];

  for (const entry of resolvedPart.features) {
    if (!entry.ok || !entry.feature.visible) continue;

    // Text prints as filled outlines, like every other string on the sheet.
    // A label's path is only its box, for selection on screen, and is not
    // drawn. A dimension's path is its dimension and extension lines, which
    // are what say what the number measures, so they print with it — a
    // bare "100.0" on the paper measures nothing (found preparing 7.7).
    if (entry.text !== undefined) {
      const drafted =
        entry.feature.kind === 'text-label'
          ? null
          : draftedOnPaper(entry.role, entry.path, entry.text);
      const glyphs = outlinesOf(entry.text);
      const moved = drafted?.numberMoved;
      texts.push({
        role: entry.role,
        source: entry.text.layout.text,
        glyphs:
          moved === undefined
            ? glyphs
            : glyphs.map((glyph) => PathOps.transform(glyph, MatOps.fromTranslation(moved))),
        sizeMm: entry.text.layout.sizeMm,
      });
      if (drafted !== null) paths.push(...drafted.paths);
      continue;
    }

    // A hole is a mark to punch through, so it prints as a circle at a true
    // millimetre size — not as a screen dot, which would come out whatever
    // size the renderer felt like. Its path is the stitch line the holes sit
    // on, and that line draws itself. A stitch hole is a centre mark for the
    // awl; a row's hole (4.14) is punched, so it prints at the punch's size,
    // in the hardware layer a cutter takes.
    if (entry.holes !== undefined) {
      const radiusMm = entry.holes.radiusMm ?? STITCH_HOLE_MARKER_DIAMETER_MM / 2;
      for (const hole of entry.holes.holes) {
        paths.push({
          role: entry.role,
          path: Shapes.circle(hole.point, radiusMm),
          style: PRINT_STYLES[entry.role],
        });
      }
      continue;
    }

    paths.push({ role: entry.role, path: entry.path, style: PRINT_STYLES[entry.role] });
  }

  return { drawnFrom, paths, texts, boundsMm: boundsOf(paths, texts) };
}

/** The items in a wanted role: the list itself when that is all of them. */
function onlyWanted<T extends { readonly role: LayerRole }>(
  items: readonly T[],
  wanted: ReadonlySet<LayerRole>,
): readonly T[] {
  return items.every((item) => wanted.has(item.role))
    ? items
    : items.filter((item) => wanted.has(item.role));
}

/**
 * Everything that prints for the part, words included: a dimension's number
 * is set beyond its line, and the paginator must not put the next piece — or
 * this piece's own caption — on top of it.
 */
function boundsOf(paths: readonly ExportPath[], texts: readonly ExportText[]): Rect | null {
  return RectOps.unionAll(
    [...paths.map((item) => item.path), ...texts.flatMap((text) => text.glyphs)].flatMap(
      (path) => PathOps.bbox(path) ?? [],
    ),
  );
}

/**
 * A dimension as drafting prints it (4.10b): its extension lines, its line
 * broken where the number sits, and a filled arrowhead on each end, all in
 * true millimetres; and its number, which evaluation centred on the line,
 * moved beside it when the line is too short for it. The path is the
 * extension lines either side of the line, as evaluation builds it.
 */
function draftedOnPaper(
  role: LayerRole,
  path: Path,
  number: PlacedText,
): { paths: ExportPath[]; numberMoved: Vec2 | undefined } {
  const [extensionFrom, dimensionLine, extensionTo] = path.segments;
  const style = PRINT_STYLES[role];
  if (extensionFrom === undefined || dimensionLine?.kind !== 'line' || extensionTo === undefined) {
    return { paths: [{ role, path, style }], numberMoved: undefined };
  }
  const { arrow, clearanceMm } = DIMENSION_MARKS;
  const drafted = draftDimensionLine(dimensionLine, {
    arrowLengthMm: arrow.lengthMm,
    arrowWidthMm: arrow.widthMm,
    gapMm: number.layout.widthMm + 2 * clearanceMm,
  });
  const paths = [
    ...[extensionFrom, extensionTo, ...drafted.lines.flatMap((piece) => piece.segments)].map(
      (segment) => ({ role, path: { closed: false, segments: [segment] }, style }),
    ),
    ...drafted.arrowheads.map((head) => ({ role, path: head, style, filled: true as const })),
  ];
  // Evaluation centred the number on the line's middle; drafting may have put
  // it beside the line instead.
  const middle = SegmentOps.pointAt(dimensionLine, 0.5);
  const by = { x: drafted.number.x - middle.x, y: drafted.number.y - middle.y };
  const stays = approxZero(by.x, EPS_LENGTH) && approxZero(by.y, EPS_LENGTH);
  return { paths, numberMoved: stays ? undefined : by };
}

/** The caption above a piece, so a printed sheet says what each one is. */
function captionFor(name: string, bounds: Rect): ExportText {
  const placed = placedText(name, CAPTION_SIZE_MM, {
    x: bounds.minX,
    y: bounds.maxY + CAPTION_GAP_MM,
  });

  return {
    role: 'annotation',
    source: name,
    glyphs: outlinesOf(placed),
    sizeMm: CAPTION_SIZE_MM,
  };
}
