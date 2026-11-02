import { drawnBounds } from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { Viewport } from '@leathercad/editor';
import { GROUND, buildDisplayList, renderToSvgString, type DisplayItem } from '@leathercad/render';

/** Device pixels to each CSS pixel: sharp on a dense display, and still small. */
const DPR = 2;

/**
 * What a list row's thumbnail keeps: the lines, fills and folds that make the
 * shape. Words, dimensions, holes, markers and construction are a few pixels
 * there, and only blur what it is (8.14); the large preview keeps them.
 */
const SHAPE_KINDS: ReadonlySet<DisplayItem['kind']> = new Set([
  'path',
  'fill',
  'hatch',
  'fold-tick',
]);
const shapeOnly = (item: DisplayItem): boolean =>
  SHAPE_KINDS.has(item.kind) && item.role !== 'annotation' && item.role !== 'construction';

/**
 * A template drawn (8.14): its pieces as the board draws them, on the board's
 * ground, framed whole in `width` × `height` CSS pixels — `full`, all of it;
 * `shape`, only what makes its outline, for a list row. Built by the board's
 * own pipeline — the display list and the SVG backend, which own the screen's
 * flip — so a thumbnail is the drawing, not a picture of it. Null for a project that
 * draws nothing. An image's `src`: a `data:` URL, which the CSP allows.
 */
export function templatePreview(
  project: Project,
  width: number,
  height: number,
  detail: 'shape' | 'full',
): string | null {
  const resolved = evaluate(project);
  const bounds = drawnBounds(resolved);
  if (bounds === null) return null;
  const viewport = new Viewport();
  viewport.resize(width * DPR, height * DPR, DPR);
  viewport.fitTo(bounds, 8 * DPR);
  const view = viewport.toView();
  const drawn = buildDisplayList(resolved, { view });
  const list = detail === 'shape' ? { items: drawn.items.filter(shapeOnly) } : drawn;
  const svg = renderToSvgString(list, view, {
    background: GROUND.ground,
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** How many pieces a template cuts: each part as many times as it is cut. */
export function piecesOf(project: Project): number {
  return project.parts.reduce((total, part) => total + part.quantity, 0);
}

/** A template's overall size in millimetres: the box its pieces are drawn in, or null. */
export function overallOf(project: Project): { width: number; height: number } | null {
  const bounds = drawnBounds(evaluate(project));
  return bounds === null
    ? null
    : { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}
