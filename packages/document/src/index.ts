/**
 * @leathercad/document — the document, its commands and its history.
 *
 * The single owner of mutable state. Tools dispatch commands; components read.
 * See CLAUDE.md invariant 5.
 */

export type {
  Axis,
  DeletePlan,
  FlipAxis,
  MirrorDirection,
  DeleteResolution,
  PlannedDependent,
  RefusedTransform,
} from './commands.js';
export type { Command, Document, Selection } from './document.js';
export {
  EMPTY_SELECTION,
  command,
  isEmptySelection,
  isPartSelected,
  isSelected,
  partSelectionOf,
  selectionOf,
  toggleSelected,
} from './document.js';

export type { StoreState } from './store.js';
export { DocumentStore } from './store.js';

export {
  DEFAULT_DIMENSION_OFFSET_MM,
  DEFAULT_LABEL_SIZE_MM,
  addFeature,
  addFoldLine,
  addHardwareHole,
  addMarkingLine,
  addMeasurement,
  addPart,
  allowanceRefusal,
  addStitchHoles,
  addAllowance,
  addAllowancePart,
  addCutOut,
  addDrawnStitchLine,
  addStitchLine,
  addTextLabel,
  arcShape,
  circleShape,
  deleteFeatures,
  deletePart,
  duplicatePart,
  isPartVisible,
  foldMirrorRefusal,
  mirrorAcrossFold,
  mirrorAxisFor,
  mirrorFeatures,
  mirrorRefusal,
  planDelete,
  setSource,
  setFoldDirection,
  setFoldThickness,
  setHardwareType,
  setLabelSize,
  setLabelText,
  setMarkingPurpose,
  emptyDocument,
  flipFeatures,
  flipRefusal,
  emptyProject,
  pathPart,
  rectShape,
  rectanglePart,
  renameFeature,
  setFeatureLocked,
  setFeatureVisible,
  setPartName,
  setMeasurement,
  setPartVisible,
  setPartQuantity,
  setProjectName,
  setDerivation,
  setShape,
  shapePart,
  refusedTransforms,
  transformFeatures,
  translateFeatures,
} from './commands.js';
