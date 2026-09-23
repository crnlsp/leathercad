/**
 * The one source of truth for how LeatherCAD looks (UI Foundations §2).
 *
 * CSS custom properties cannot reach a canvas backend, so a palette kept only
 * in the stylesheet drifts from `packages/render` within one slice. Here the
 * palette, the role table and the metric tokens are data: the canvas and SVG
 * backends read them directly, `packages/export` prints from the same role
 * table, and `apps/desktop` projects them onto `:root` for the stylesheet.
 */
export { PALETTE } from './palette.js';
export { DASH_LEGIBLE_PX, ROLE_STYLES, screenDash, type RoleStyle } from './roles.js';
export { DENSITY, type Density } from './tokens.js';
export { cssVariables } from './css.js';
