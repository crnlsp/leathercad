import type { Mm } from '@leathercad/core';
import type { LayerRole, Part, ResolvedProject } from '@leathercad/domain';
import { PathOps, RectOps, type Path, type Rect } from '@leathercad/geometry';

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

export const PRINT_STYLES: Readonly<Record<LayerRole, PrintStyle>> = {
  cut: { widthMm: 0.25, dashMm: [], grey: 0 },
  stitch: { widthMm: 0.15, dashMm: [2, 2], grey: 0 },
  'stitch-holes': { widthMm: 0.15, dashMm: [], grey: 0 },
  fold: { widthMm: 0.15, dashMm: [7, 2, 1.5, 2], grey: 0 },
  mark: { widthMm: 0.1, dashMm: [1, 1.5], grey: 0.45 },
  hardware: { widthMm: 0.2, dashMm: [], grey: 0 },
  annotation: { widthMm: 0.1, dashMm: [], grey: 0.35 },
  construction: { widthMm: 0.1, dashMm: [1, 1], grey: 0.6 },
};

export interface ExportPath {
  readonly role: LayerRole;
  readonly path: Path;
  readonly style: PrintStyle;
}

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

    for (const entry of resolvedPart.features) {
      if (!entry.ok || !entry.feature.visible) continue;
      paths.push({ role: entry.role, path: entry.path, style: PRINT_STYLES[entry.role] });
    }

    if (paths.length === 0) continue;

    const bounds = RectOps.unionAll(
      paths.flatMap((item) => {
        const box = PathOps.bbox(item.path);
        return box === null ? [] : [box];
      }),
    );
    if (bounds === null) continue;

    parts.push({
      id: resolvedPart.part.id,
      name: describePart(resolvedPart.part),
      quantity: resolvedPart.part.quantity,
      paths,
      boundsMm: bounds,
    });
  }

  return { projectName, parts };
}

/** "Card holder — cut 2", so a printed sheet is self-describing. */
export function describePart(part: Part): string {
  const name = part.name.trim() === '' ? 'Part' : part.name.trim();
  return part.quantity > 1 ? `${name} — cut ${part.quantity}` : name;
}
