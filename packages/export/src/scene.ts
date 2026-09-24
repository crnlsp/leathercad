import type { Mm } from '@leathercad/core';
import { LAYER_ROLES, type LayerRole, type ResolvedProject } from '@leathercad/domain';
import { PathOps, RectOps, Shapes, type Path, type Rect } from '@leathercad/geometry';
import { CAPTION_GAP_MM, CAPTION_SIZE_MM, ROLE_STYLES, describePart } from '@leathercad/render';
import { outlinesOf, placedText } from '@leathercad/typography';

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
 */
export function buildExportScene(resolved: ResolvedProject, projectName: string): ExportScene {
  const parts: ExportPart[] = [];

  for (const resolvedPart of resolved.parts) {
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
        texts.push({
          role: entry.role,
          source: entry.text.layout.text,
          glyphs: outlinesOf(entry.text),
          sizeMm: entry.text.layout.sizeMm,
        });
        if (entry.feature.kind === 'text-label') continue;
      }

      // A hole is a mark to punch through, so it prints as a circle at a true
      // millimetre size — not as a screen dot, which would come out whatever
      // size the renderer felt like. Its path is the stitch line the holes sit
      // on, and that line draws itself.
      if (entry.holes !== undefined) {
        for (const hole of entry.holes.holes) {
          paths.push({
            role: entry.role,
            path: Shapes.circle(hole.point, STITCH_HOLE_MARKER_DIAMETER_MM / 2),
            style: PRINT_STYLES[entry.role],
          });
        }
        continue;
      }

      paths.push({ role: entry.role, path: entry.path, style: PRINT_STYLES[entry.role] });
    }

    // A part with only labels on it has nothing to cut, and a template page
    // full of captions with no pieces is not a template.
    if (paths.length === 0) continue;

    // Everything that prints for the part, words included: a dimension's
    // number is set beyond its line, and the paginator must not put the next
    // piece — or this piece's own caption — on top of it.
    const bounds = RectOps.unionAll(
      [...paths.map((item) => item.path), ...texts.flatMap((text) => text.glyphs)].flatMap(
        (path) => PathOps.bbox(path) ?? [],
      ),
    );
    if (bounds === null) continue;

    const name = describePart(resolvedPart.part);

    parts.push({
      id: resolvedPart.part.id,
      name,
      quantity: resolvedPart.part.quantity,
      paths,
      texts: [captionFor(name, bounds), ...texts],
      boundsMm: bounds,
    });
  }

  return { projectName, parts };
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
