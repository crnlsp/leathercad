import { pieceStep, type Document, type DocumentStore } from '@leathercad/document';
import type { PartId } from '@leathercad/domain';
import { Vec2Ops, type Vec2 } from '@leathercad/geometry';

/**
 * What *Duplicate* remembers for step and repeat (8.8b): the pieces a duplicate
 * made and how far they were moved since, so Ctrl+D on them again puts the
 * next copy that far on.
 *
 * It lives with its tab, and is view state like the tool: nothing of it is in
 * the document or the file. It lasts exactly as long as nothing else is done —
 * any other command, an undo or a redo, or the project being replaced forgets
 * it. A step is only moves of those pieces whole; a selection or a drag in
 * progress is not a command and does not forget it.
 */
export class StepMemory {
  private memory: {
    readonly copies: ReadonlySet<PartId>;
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
          ? pieceStep(document.project, next.project, copies)
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
   * Called right after a duplicate has been dispatched: `copies` are the new
   * pieces, `step` how far they already are from what they copy (none for a
   * duplicate, the repeated step for a repeat).
   */
  remember(copies: readonly PartId[], step: Vec2 = { x: 0, y: 0 }): void {
    this.memory = { copies: new Set(copies), step, document: this.store.getState().document };
  }

  /** The step Ctrl+D repeats when exactly `selected` are selected, else `null`. */
  stepFor(selected: ReadonlySet<PartId>): Vec2 | null {
    const memory = this.memory;
    if (memory === null || memory.copies.size !== selected.size) return null;
    if (![...selected].every((id) => memory.copies.has(id))) return null;
    return memory.step.x === 0 && memory.step.y === 0 ? null : memory.step;
  }
}
