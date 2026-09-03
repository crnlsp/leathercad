export type { Path } from './path.js';
export {
  bbox,
  closed,
  end,
  isEmpty,
  isValid,
  length,
  open,
  path,
  polyline,
  reverse,
  start,
  toCubics,
  transform,
  unsafePath,
  validate,
  vertices,
} from './path.js';

export type { Orientation } from './area.js';
export { area, isCounterClockwise, orientation, signedArea, withOrientation } from './area.js';

export type { FillRule } from './contains.js';
export { containsPoint, isPointOnPath, windingNumber } from './contains.js';

export {
  flattenPath,
  flattenSegment,
  flattenToPolyline,
  maxAngleStepForSagitta,
} from './flatten.js';
