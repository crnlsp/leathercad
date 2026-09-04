/**
 * @leathercad/editor — viewport, tools, snapping and hit testing.
 *
 * Owns interaction. The document is mutated only through dispatched commands;
 * nothing here writes to it directly. See CLAUDE.md invariant 5.
 */

export { Viewport } from './viewport.js';
