/**
 * @leathercad/render — turning resolved geometry into pixels.
 *
 * Owns the **only** millimetre-to-pixel conversion on the screen side, and one
 * of the only two Y flips in the codebase (the other is the SVG writer). Every
 * layer beneath this one is Y-up millimetres and knows nothing about screens.
 */

export {
  ACCENT,
  CANVAS,
  DASH_LEGIBLE_PX,
  DENSITY,
  GROUND,
  NOMINAL_IRON,
  ROLE_STYLES,
  SHELL,
  STATE,
  cssVariables,
  screenDash,
  type Density,
  type RoleStyle,
} from './theme/index.js';

export type { ViewportView } from './view.js';
export { mmToPixels, pixelsToMm, screenToWorld, visibleBoundsMm, worldToScreen } from './view.js';

export type { DisplayItem, DisplayList, Stroke } from './displayList.js';
export {
  ROLE_STROKES,
  displayListBounds,
  documentTextItem,
  dotsItem,
  markerItem,
  pathItem,
  placedTextItem,
  textItem,
} from './displayList.js';

export { CAPTION_GAP_MM, CAPTION_SIZE_MM, describePart } from './captions.js';

export type { Ring } from './leather.js';
export { linkTickShape } from './leather.js';

export type { Canvas2DLike, RenderOptions } from './canvas2d/backend.js';
export { clearCanvas, renderDisplayList, tracePath } from './canvas2d/backend.js';

export { labelPrecisionFor, majorStepFor, niceTickStepMm, ticksInRange } from './ticks.js';

export type { RulerStyle } from './canvas2d/grid.js';
export { DEFAULT_RULER_STYLE, renderGrid, renderRulers } from './canvas2d/grid.js';

export type { BuildOptions } from './buildDisplayList.js';
export { DIAGNOSTIC_COLOURS, buildDisplayList } from './buildDisplayList.js';

export type { SvgOptions } from './svg/backend.js';
export { renderToSvgString } from './svg/backend.js';
