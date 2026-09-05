/**
 * @leathercad/document — the document, its commands and its history.
 *
 * The single owner of mutable state. Tools dispatch commands; components read.
 * See CLAUDE.md invariant 5.
 */

export type { Command, Document, Selection } from './document.js';
export { EMPTY_SELECTION, command, isSelected, selectionOf, toggleSelected } from './document.js';

export type { StoreState } from './store.js';
export { DocumentStore } from './store.js';

export {
  addFeature,
  addPart,
  circleShape,
  deleteFeatures,
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
  setShape,
  shapePart,
  translateFeatures,
} from './commands.js';
