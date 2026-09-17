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
  /** Shown in the undo menu, so phrase it as the user's action. */
  readonly label: string;
  /**
   * A label naming what the command acts on, read from the document it is
   * about to be applied to — "Delete Outline and 2 dependents" rather than
   * "Delete feature". Optional; `label` is used when absent.
   *
   * A function of the document rather than a label set during `apply`, so a
   * command stays a pure description and no call has a hidden side effect.
   */
  labelFor?(document: Document): string;
  apply(document: Document): Document;
}

export function command(label: string, apply: (document: Document) => Document): Command {
  return { label, apply };
}
