import type { FeatureId, PartId, Project } from '@leathercad/domain';

/**
 * Everything that belongs in the saved file.
 *
 * Viewport, active tool, hover state and window size are **not** here. If the
 * camera lived in the document, panning would mark the file dirty and every
 * save would produce a diff. See docs/file-format.md §3.3.
 */
export interface Document {
  readonly project: Project;
}

/**
 * What the user has picked. Restored by undo, but not part of the file.
 *
 * Two levels, a third with vertex editing (`architecture.md` §6.5). A canvas
 * click selects a feature; a part's heading in the parts panel selects the
 * part. Both sets exist, but the panel sets one and clears the other — a
 * selection that is quietly both is one nobody can reason about, and the
 * target-part rule would have two answers.
 */
export interface Selection {
  readonly parts: ReadonlySet<PartId>;
  readonly features: ReadonlySet<FeatureId>;
}

export const EMPTY_SELECTION: Selection = { parts: new Set(), features: new Set() };

export function selectionOf(ids: Iterable<FeatureId>): Selection {
  return { parts: new Set(), features: new Set(ids) };
}

export function partSelectionOf(ids: Iterable<PartId>): Selection {
  return { parts: new Set(ids), features: new Set() };
}

export function isSelected(selection: Selection, id: FeatureId): boolean {
  return selection.features.has(id);
}

export function isPartSelected(selection: Selection, id: PartId): boolean {
  return selection.parts.has(id);
}

/**
 * Every feature the selection stands for: the ones picked, and all of each
 * part picked by its heading — what a gesture on the selection acts on (Q30).
 */
export function selectedFeatureIds(project: Project, selection: Selection): FeatureId[] {
  const fromParts = project.parts
    .filter((part) => selection.parts.has(part.id))
    .flatMap((part) => part.features.map((feature) => feature.id));
  return [...new Set([...selection.features, ...fromParts])];
}

/** Whether anything at all is picked, of either kind. */
export function isEmptySelection(selection: Selection): boolean {
  return selection.parts.size === 0 && selection.features.size === 0;
}

export function toggleSelected(selection: Selection, id: FeatureId): Selection {
  const next = new Set(selection.features);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  // Picking a feature means the part heading is no longer what is picked.
  return { parts: new Set(), features: next };
}

/**
 * A pure function producing a new document.
 *
 * Not a do/undo pair. Every hand-written inverse is a chance to corrupt state,
 * and the corruption surfaces hours later as a mangled file. With snapshots,
 * undo is correct by construction and one property test covers every command
 * that will ever be written. See docs/architecture.md §4.
 */
export interface Command {
  /** What undoing it would undo, as the user's action: shown as "Undo <label>". */
  readonly label: HistoryLabel;
  /**
   * A label naming what the command acts on, read from the document it is
   * about to be applied to — "Delete Outline and 2 dependents" rather than
   * "Delete feature". Optional; `label` is used when absent.
   *
   * A function of the document rather than a label set during `apply`, so a
   * command stays a pure description and no call has a hidden side effect.
   */
  labelFor?(document: Document): HistoryLabel;
  apply(document: Document): Document;
}

export function command(label: HistoryLabel, apply: (document: Document) => Document): Command {
  return { label, apply };
}

/** Every kind of step in the undo history. An id: the app has the words for each (ADR 0018). */
export type HistoryAction =
  | 'new-document'
  | 'open'
  | 'open-sample'
  | 'new-project'
  | 'recover'
  | 'add'
  | 'add-label'
  | 'add-dimension'
  | 'add-seam-allowance'
  | 'delete'
  | 'delete-part'
  | 'rename'
  | 'rename-part'
  | 'rename-project'
  | 'show'
  | 'hide'
  | 'show-part'
  | 'hide-part'
  | 'lock'
  | 'unlock'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'transform'
  | 'flip-horizontal'
  | 'flip-vertical'
  | 'mirror'
  | 'mirror-across-fold'
  | 'duplicate'
  | 'duplicate-part'
  | 'follow'
  | 'follow-another'
  | 'edit-shape'
  | 'edit-derivation'
  | 'edit-dimension'
  | 'edit-label'
  | 'resize-label'
  | 'change-paper'
  | 'set-quantity'
  | 'change-fold-direction'
  | 'change-fold-thickness'
  | 'change-marking-purpose'
  | 'change-hardware-type'
  | 'move-point'
  | 'add-point'
  | 'remove-point'
  | 'round-corner'
  | 'sharpen-corner';

/**
 * A step of the undo history, as facts: what was done, and the name or the
 * count its words need. Never a sentence — the words are the app's, in the
 * interface's language (ADR 0018), and a document is the same in every one.
 */
export interface HistoryLabel {
  readonly action: HistoryAction;
  /** What it acted on, by name: *Add Outline*, *Duplicate Strap*. */
  readonly name?: string;
  /** How many features it acted on: *Lock 3 features*. */
  readonly count?: number;
  /** A delete's dependents that went with what was named. */
  readonly dependents?: number;
  /** A delete's dependents kept as drawn geometry. */
  readonly frozen?: number;
}
