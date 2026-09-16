/**
 * @leathercad/document — the document, its commands and its history.
 *
 * The single owner of mutable state. Tools dispatch commands; components read.
 * See CLAUDE.md invariant 5.
 */

export type {
  DeletePlan,
  DeleteResolution,
  PlannedDependent,
  RefusedTransform,
} from './commands.js';
export type { Command, Document, Selection } from './document.js';
export { EMPTY_SELECTION, command, isSelected, selectionOf, toggleSelected } from './document.js';

export type { StoreState } from './store.js';
export { DocumentStore } from './store.js';

export {
  DEFAULT_LABEL_SIZE_MM,
  addFeature,
  addFoldLine,
  addHardwareHole,
  addMarkingLine,
  addPart,
  addStitchHoles,
  addStitchLine,
  addTextLabel,
  arcShape,
  circleShape,
  deleteFeatures,
  deletePart,
  planDelete,
  setSource,
  setFoldDirection,
  setFoldThickness,
  setHardwareType,
  setLabelSize,
  setLabelText,
  setMarkingPurpose,
  emptyDocument,
  emptyProject,
  pathPart,
  rectShape,
  rectanglePart,
  renameFeature,
  setFeatureVisible,
  setPartName,
  setPartQuantity,
  setProjectName,
  setDerivation,
  setShape,
  shapePart,
  refusedTransforms,
  transformFeatures,
  translateFeatures,
} from './commands.js';
