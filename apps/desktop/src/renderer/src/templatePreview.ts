import { drawnBounds } from '@leathercad/document';
import { evaluate, type Project } from '@leathercad/domain';
import { Viewport } from '@leathercad/editor';
import { GROUND, buildDisplayList, renderToSvgString } from '@leathercad/render';

/** A thumbnail's size in CSS pixels: the template picker's row (8.14). */
export const PREVIEW_WIDTH = 112;
export const PREVIEW_HEIGHT = 72;

/**
 * A template drawn small (8.14): its pieces as the board draws them, on the
 * board's ground, framed whole. Built by the board's own pipeline — the
 * display list and the SVG backend, which own the screen's flip — so a
 * thumbnail is the drawing, not a picture of it. Null for a project that
 * draws nothing. An image's `src`: a `data:` URL, which the CSP allows.
 */
export function templatePreview(project: Project, dpr = 2): string | null {
  const resolved = evaluate(project);
  const bounds = drawnBounds(resolved);
  if (bounds === null) return null;
  const viewport = new Viewport();
  viewport.resize(PREVIEW_WIDTH * dpr, PREVIEW_HEIGHT * dpr, dpr);
  viewport.fitTo(bounds, 8 * dpr);
  const view = viewport.toView();
  const svg = renderToSvgString(buildDisplayList(resolved, { view }), view, {
    background: GROUND.ground,
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** How many pieces a template cuts: each part as many times as it is cut. */
export function piecesOf(project: Project): number {
  return project.parts.reduce((total, part) => total + part.quantity, 0);
}
