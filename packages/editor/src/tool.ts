import type { Vec2 } from '@leathercad/geometry';
import type { Command, DocumentStore } from '@leathercad/document';
import type { DisplayList } from '@leathercad/render';

import type { Viewport } from './viewport.js';

/** A pointer event, already converted to millimetres. */
export interface PointerInput {
  /** Position in millimetres. Tools work in millimetres and never in pixels. */
  readonly at: Vec2;
  /** Position in device pixels, for hit tolerances only. */
  readonly atPx: Vec2;
  readonly button: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
}

export interface KeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
}

/**
 * What a tool is allowed to do.
 *
 * Note what is missing: any way to write to the document. Tools dispatch
 * commands and nothing else — see CLAUDE.md invariant 5. Handing a tool the
 * document directly is how editors end up with mutation scattered across
 * twenty files and an undo stack nobody trusts.
 */
export interface ToolContext {
  readonly viewport: Viewport;
  readonly store: DocumentStore;
  dispatch(command: Command): void;
  /** Marks the canvas as needing a repaint. */
  invalidate(): void;
}

/**
 * A drawing or editing mode.
 *
 * Every tool carries an explicit `state` discriminant rather than a scatter of
 * booleans, and must return to `idle` on Escape. That one convention prevents
 * most of the mess canvas tools accumulate.
 */
export interface Tool {
  readonly id: string;
  readonly label: string;
  readonly cursor: string;

  onPointerDown?(ctx: ToolContext, event: PointerInput): void;
  onPointerMove?(ctx: ToolContext, event: PointerInput): void;
  onPointerUp?(ctx: ToolContext, event: PointerInput): void;
  onKey?(ctx: ToolContext, event: KeyInput): void;

  /** Ephemeral feedback — rubber bands, previews. Never in the document. */
  buildOverlay?(ctx: ToolContext): DisplayList;

  /** Called when the tool is swapped out; must leave no transaction open. */
  onDeactivate?(ctx: ToolContext): void;
}

/** Routes input to the active tool. */
export class ToolManager {
  private active: Tool;

  constructor(
    private readonly context: ToolContext,
    initial: Tool,
    private readonly tools: readonly Tool[],
  ) {
    this.active = initial;
  }

  get activeTool(): Tool {
    return this.active;
  }

  get available(): readonly Tool[] {
    return this.tools;
  }

  activate(id: string): void {
    const next = this.tools.find((tool) => tool.id === id);
    if (next === undefined || next === this.active) return;

    // Deactivating must close any open transaction, or a half-drawn shape
    // would survive into the next tool.
    this.active.onDeactivate?.(this.context);
    this.active = next;
    this.context.invalidate();
  }

  pointerDown(event: PointerInput): void {
    this.active.onPointerDown?.(this.context, event);
  }

  pointerMove(event: PointerInput): void {
    this.active.onPointerMove?.(this.context, event);
  }

  pointerUp(event: PointerInput): void {
    this.active.onPointerUp?.(this.context, event);
  }

  key(event: KeyInput): void {
    this.active.onKey?.(this.context, event);
  }

  overlay(): DisplayList {
    return this.active.buildOverlay?.(this.context) ?? { items: [] };
  }
}
