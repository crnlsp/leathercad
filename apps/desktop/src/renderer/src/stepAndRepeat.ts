import { featureStep, pieceStep, type Document, type DocumentStore } from '@leathercad/document';
import type { FeatureId, PartId } from '@leathercad/domain';
import { Vec2Ops, type Vec2 } from '@leathercad/geometry';

/** What a duplicate made: whole pieces, or features in a piece (8.8b-4). */
export type Copies =
  | { readonly kind: 'pieces'; readonly ids: ReadonlySet<PartId> }
  | { readonly kind: 'features'; readonly ids: ReadonlySet<FeatureId> };

/**
 * What *Duplicate* remembers for step and repeat (8.8b): the pieces or the
 * features a duplicate made and how far they were moved since, so Ctrl+D on
 * them again puts the next copy that far on.
 *
 * It lives with its tab, and is view state like the tool: nothing of it is in
 * the document or the file. It lasts exactly as long as nothing else is done —
 * any other command, an undo or a redo, or the project being replaced forgets
 * it. A step is only moves of those copies as one; a selection or a drag in
 * progress is not a command and does not forget it.
 */
export class StepMemory {
  private memory: {
    readonly copies: Copies;
    readonly step: Vec2;
    /** The document the step was last read from, to read the next move against. */
    readonly document: Document;
  } | null = null;

  constructor(private readonly store: DocumentStore) {
    store.onHistory((event) => {
      if (this.memory === null) return;
      const { copies, step, document } = this.memory;
      const next = store.getState().document;
      const moved =
        event.kind === 'edit' && event.label.action === 'move'
          ? copies.kind === 'pieces'
            ? pieceStep(document.project, next.project, copies.ids)
            : featureStep(document.project, next.project, copies.ids)
          : null;
      this.memory =
        moved === null
          ? null
          : { copies, step: Vec2Ops.quantiseVec(Vec2Ops.add(step, moved)), document: next };
    });
    store.onReset(() => {
      this.memory = null;
    });
  }

  /**
   * Called right after a duplicate has been dispatched: `copies` are what it
   * made, `step` how far they already are from what they copy (none for a
   * duplicate, the repeated step for a repeat).
   */
  remember(copies: Copies, step: Vec2 = { x: 0, y: 0 }): void {
    this.memory = { copies, step, document: this.store.getState().document };
  }

  /** The step Ctrl+D repeats when exactly `selected` are selected, else `null`. */
  stepFor(selected: Copies): Vec2 | null {
    const memory = this.memory;
    if (memory === null || memory.copies.kind !== selected.kind) return null;
    const { ids } = memory.copies;
    if (ids.size !== selected.ids.size || ![...selected.ids].every((id) => ids.has(id))) {
      return null;
    }
    return memory.step.x === 0 && memory.step.y === 0 ? null : memory.step;
  }
}
