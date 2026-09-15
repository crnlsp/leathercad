/**
 * @leathercad/editor — viewport, tools, snapping and hit testing.
 *
 * Owns interaction. The document is mutated only through dispatched commands;
 * nothing here writes to it directly. See CLAUDE.md invariant 5.
 */

export { Viewport } from './viewport.js';

export type { KeyInput, PointerInput, Tool, ToolContext } from './tool.js';
export { ToolManager } from './tool.js';

export { featuresWithin, hitTest } from './hitTest.js';

export type { SnapCandidate, SnapIndex, SnapIndexOptions, SnapKind, SnapOptions } from './snap.js';
export { buildSnapIndex, snap, snapGlyph } from './snap.js';

export { createArcTool } from './tools/arcTool.js';
export { createCircleTool } from './tools/circleTool.js';
export type { DrawAs, DrawnSource } from './tools/commitDrawn.js';
export { commitDrawn, drawTargetNotice, targetPart } from './tools/commitDrawn.js';
export type { HardwareOptions } from './tools/hardwareTool.js';
export { createHardwareTool, DEFAULT_HARDWARE } from './tools/hardwareTool.js';
export { createLineTool, createPolylineTool } from './tools/polylineTool.js';
export { createRectangleTool } from './tools/rectangleTool.js';
export { createRotateTool } from './tools/rotateTool.js';
export { createScaleTool } from './tools/scaleTool.js';
export { createSelectTool } from './tools/selectTool.js';
export { selectionPivot } from './tools/selectionPivot.js';
