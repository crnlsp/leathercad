import { approxEq } from '@leathercad/core';
import type { Vec2 } from '@leathercad/geometry';
import type { Command, DocumentStore } from '@leathercad/document';
import {
  evaluate,
  type FeatureId,
  type Problem,
  type Project,
  type ResolvedProject,
} from '@leathercad/domain';
import type { DisplayList } from '@leathercad/render';

import { buildSnapIndex, snap, snapGlyph, type SnapCandidate, type SnapIndex } from './snap.js';
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
  /**
   * What the next drawn thing becomes — a cut contour, a fold line, a marking
   * line. A function rather than a value because the context is built once and
   * the setting changes underneath it.
   *
   * Absent means `'cut'`, so a caller that does not care — every test harness
   * written before the setting existed — keeps the behaviour it had.
   */
  readonly drawAs?: () =>
    'outline' | 'stitch-allowance' | 'cut-out' | 'stitch' | 'fold' | 'marking';
  /**
   * Asks the application to delete these features.
   *
   * A tool cannot show a dialog, and a delete with dependents needs one
   * (ADR 0009), so the app decides: at once when nothing depends on them,
   * otherwise by asking. Absent means dispatch `deleteFeatures` directly, which
   * refuses — changing nothing — when there are dependents.
   */
  readonly requestDelete?: (ids: readonly FeatureId[]) => void;
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
  /**
   * A key, while this tool is active. Returns `true` to **claim** it, so the
   * application's own shortcut for that key does not also fire — how the
   * polyline takes A and L for its next segment mid-run without switching to
   * the Arc or Line tool (3.9a). Anything else leaves shortcuts as they are.
   */
  onKey?(ctx: ToolContext, event: KeyInput): boolean | void;

  /** Ephemeral feedback — rubber bands, previews. Never in the document. */
  buildOverlay?(ctx: ToolContext): DisplayList;

  /**
   * Features this tool is currently moving, which must not snap to themselves.
   *
   * Snapping a shape to its own corner would pin it in place — the reason
   * `SnapOptions.exclude` exists. A tool that moves nothing omits this.
   */
  snapExclusions?(ctx: ToolContext): readonly FeatureId[];

  /**
   * Something the user needs to read, for as long as it is true.
   *
   * Drawn in the status bar rather than on the canvas: canvas text sits at the
   * geometry it describes, which is exactly where it gets clipped by the edge
   * or hidden under the shape. A sentence explaining why nothing is moving has
   * to be readable, so it goes somewhere with room for it.
   *
   * A problem, not a sentence: the words are the domain's message catalogue,
   * so a tool cannot explain a refusal differently from everywhere else.
   */
  notice?(ctx: ToolContext): Problem | null;

  /** Called when the tool is swapped out; must leave no transaction open. */
  onDeactivate?(ctx: ToolContext): void;
}

/** Shared because a tool that moves nothing asks for this on every event. */
const NOTHING_EXCLUDED: readonly FeatureId[] = [];

/**
 * Whether two snap results would draw the same glyph.
 *
 * Only used to decide whether a repaint is owed, so a difference smaller than
 * `approxEq`'s epsilon is correctly treated as no change: it could not be seen.
 */
function sameSnap(a: SnapCandidate | null, b: SnapCandidate | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && approxEq(a.point.x, b.point.x) && approxEq(a.point.y, b.point.y);
}

/**
 * Routes input to the active tool.
 *
 * Every pointer position is **snapped here**, once, before any tool sees it.
 * A tool therefore cannot forget to snap, and one arriving later inherits it
 * without knowing it exists — which is the only way the behaviour stays
 * consistent across a growing set of tools.
 */
export class ToolManager {
  private active: Tool;

  /** The snap the last pointer event caught, for the overlay glyph. */
  private caught: SnapCandidate | null = null;

  /**
   * The snap index, and the project it was built from.
   *
   * Rebuilt when the project object changes — which, with immutable updates and
   * structural sharing, is exactly when the geometry could have moved. The same
   * identity-as-cache-key trick `evaluate` uses.
   */
  private index: { project: Project; resolved: ResolvedProject; index: SnapIndex } | null = null;

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

  /** The active tool's message, if it has one right now. */
  notice(): Problem | null {
    return this.active.notice?.(this.context) ?? null;
  }

  /**
   * Where a click would actually land, when a snap has been caught.
   *
   * The readout has to show this rather than the raw cursor: a status bar
   * reading 61.50 while the point about to be committed is 62.5 is not a
   * rounding difference, it is the wrong number.
   */
  snapPoint(): Vec2 | null {
    return this.caught?.point ?? null;
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
    // A glyph left over from the previous tool would advertise a snap the new
    // one has not been offered.
    this.caught = null;
    this.context.invalidate();
  }

  pointerDown(event: PointerInput): void {
    this.active.onPointerDown?.(this.context, this.snapped(event));
  }

  pointerMove(event: PointerInput): void {
    this.active.onPointerMove?.(this.context, this.snapped(event));
  }

  pointerUp(event: PointerInput): void {
    this.active.onPointerUp?.(this.context, this.snapped(event));
  }

  /**
   * The pointer has left the canvas: whatever it had snapped to is no longer
   * on offer, so its glyph goes. The tool keeps its own state — a drag under
   * pointer capture still ends where it ends.
   */
  pointerLeave(): void {
    if (this.caught === null) return;
    this.caught = null;
    this.context.invalidate();
  }

  /**
   * The event with its position moved onto the nearest snap target.
   *
   * **Ctrl suspends it**, for the times a point is wanted near geometry rather
   * than on it. Alt is not available — it already pans.
   *
   * Grid snapping is deliberately left off. The grid on screen is adaptive to
   * zoom, so snapping to it would make the same drag land on 90 mm at one
   * magnification and 90.0 at another; `settings.gridSpacingMm` exists but
   * nothing draws it, and snapping to a grid the user cannot see is worse than
   * not snapping. Turning it on means reconciling those two first.
   */
  private snapped(event: PointerInput): PointerInput {
    const before = this.caught;
    this.caught = event.ctrlKey ? null : this.findSnap(event);

    // A hovering pointer changes no document, and an idle tool asks for no
    // repaint — so without this the glyph is computed and never drawn until
    // the canvas happens to be dirtied by something else.
    if (!sameSnap(before, this.caught)) this.context.invalidate();

    return this.caught === null ? event : { ...event, at: this.caught.point };
  }

  private findSnap(event: PointerInput): SnapCandidate | null {
    const { resolved, index } = this.snapIndex();
    return snap(index, resolved, event.at, {
      // A pick radius in pixels, so the feel is identical at any zoom — the
      // same rule `hitTest` follows. See CLAUDE.md invariant 1.
      toleranceMm: this.context.viewport.pickToleranceMm(),
      exclude: this.active.snapExclusions?.(this.context) ?? NOTHING_EXCLUDED,
    });
  }

  private snapIndex(): { resolved: ResolvedProject; index: SnapIndex } {
    const project = this.context.store.getState().document.project;
    if (this.index === null || this.index.project !== project) {
      const resolved = evaluate(project);
      this.index = { project, resolved, index: buildSnapIndex(resolved) };
    }
    return this.index;
  }

  /** Hands a key to the active tool; true when the tool claimed it. */
  key(event: KeyInput): boolean {
    return this.active.onKey?.(this.context, event) === true;
  }

  overlay(): DisplayList {
    const items = this.active.buildOverlay?.(this.context).items ?? [];
    if (this.caught === null) return { items };

    // The glyph rides on top of the tool's own feedback: which kind of snap is
    // about to be committed to matters more than a rubber band, because a
    // corner and the edge through it are a fraction of a millimetre apart on
    // screen and very different in the file.
    return { items: [...items, ...snapGlyph(this.caught, this.context.viewport.scale)] };
  }
}
