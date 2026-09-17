import type { FeatureId, PartId } from '@leathercad/domain';

import { EMPTY_SELECTION, type Command, type Document, type Selection } from './document.js';

interface HistoryEntry {
  readonly document: Document;
  readonly selection: Selection;
  /** What produced this state; shown as "Undo <label>". */
  readonly label: string;
}

export interface StoreState {
  readonly document: Document;
  readonly selection: Selection;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

/**
 * Owns the document. The only thing that mutates it.
 *
 * Tools dispatch commands; React components read. Nothing writes to the
 * document directly — see CLAUDE.md invariant 5. It is deliberately not in
 * Zustand or Redux: a CAD document needs transactions and snapshot history,
 * and a generic state container gives neither while inviting mutation from
 * anywhere.
 */
export class DocumentStore {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private present: HistoryEntry;

  /** Set while a drag is in progress; not yet in history. */
  private transaction: { label: string; base: HistoryEntry } | null = null;

  private listeners = new Set<() => void>();

  /**
   * How many steps of history to keep.
   *
   * A pattern document is a few hundred kilobytes and untouched parts are
   * shared by reference, so this costs far less than the number suggests.
   */
  static readonly HISTORY_LIMIT = 200;

  constructor(initial: Document) {
    this.present = { document: initial, selection: EMPTY_SELECTION, label: 'New document' };
  }

  getState(): StoreState {
    return {
      document: this.present.document,
      selection: this.present.selection,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      undoLabel: this.past.length > 0 ? this.present.label : null,
      redoLabel: this.future[this.future.length - 1]?.label ?? null,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a command and pushes one history entry. */
  dispatch(command: Command): void {
    const next = command.apply(this.present.document);
    if (next === this.present.document) return; // A no-op earns no history.

    // Read from the document the command was applied to, while it still holds
    // the names of what the command removed.
    const label = command.labelFor?.(this.present.document) ?? command.label;

    this.past.push(this.present);
    if (this.past.length > DocumentStore.HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.present = {
      document: next,
      selection: this.present.selection,
      label,
    };
    this.emit();
  }

  /**
   * Starts a transaction.
   *
   * A drag produces hundreds of intermediate states and only the last belongs
   * in history. Without this, one drag of a rectangle would need three hundred
   * presses of undo to reverse.
   */
  begin(label: string): void {
    if (this.transaction !== null) this.rollback();
    this.transaction = { label, base: this.present };
  }

  /** Updates the visible document without touching history. */
  preview(command: Command): void {
    if (this.transaction === null) {
      this.dispatch(command);
      return;
    }
    const next = command.apply(this.transaction.base.document);
    this.present = { ...this.present, document: next };
    this.emit();
  }

  /** Ends a transaction, keeping the result as one undoable step. */
  commit(): void {
    const transaction = this.transaction;
    this.transaction = null;
    if (transaction === null) return;

    if (this.present.document === transaction.base.document) return;

    this.past.push(transaction.base);
    if (this.past.length > DocumentStore.HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.present = { ...this.present, label: transaction.label };
    this.emit();
  }

  /** Abandons a transaction, restoring the state before it began. */
  rollback(): void {
    const transaction = this.transaction;
    this.transaction = null;
    if (transaction === null) return;

    this.present = transaction.base;
    this.emit();
  }

  get inTransaction(): boolean {
    return this.transaction !== null;
  }

  undo(): void {
    if (this.transaction !== null) {
      this.rollback();
      return;
    }
    const previous = this.past.pop();
    if (previous === undefined) return;

    this.future.push(this.present);
    this.present = previous;
    this.emit();
  }

  redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;

    this.past.push(this.present);
    this.present = next;
    this.emit();
  }

  /**
   * Replaces the document and discards all history.
   *
   * Opening a file is not an edit, so there is nothing meaningful to undo back
   * into — the previous project is a different document, and letting Ctrl+Z
   * walk from one into the other would be worse than useless.
   */
  reset(document: Document, label = 'Open'): void {
    this.transaction = null;
    this.past = [];
    this.future = [];
    this.present = { document, selection: EMPTY_SELECTION, label };
    this.emit();
  }

  /**
   * Selection changes do not enter history on their own — an accidental click
   * should not consume an undo — but the selection at each step is remembered,
   * so undoing a delete brings back what was deleted, still selected.
   */
  setSelection(selection: Selection): void {
    this.present = { ...this.present, selection };
    this.emit();
  }

  /** Picks features, and drops any part heading that was picked. */
  select(ids: Iterable<FeatureId>): void {
    this.setSelection({ parts: new Set(), features: new Set(ids) });
  }

  /** Picks parts, and drops any features that were picked. */
  selectParts(ids: Iterable<PartId>): void {
    this.setSelection({ parts: new Set(ids), features: new Set() });
  }

  clearSelection(): void {
    this.setSelection(EMPTY_SELECTION);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
