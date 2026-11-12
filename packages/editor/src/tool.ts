import { approxEq, type Mm } from '@leathercad/core';
import type { Vec2 } from '@leathercad/geometry';
import type { Command, DocumentStore } from '@leathercad/document';
import {
  evaluate,
  type FeatureId,
  type PartId,
  type Problem,
  type Project,
  type ResolvedProject,
} from '@leathercad/domain';
import { cssPxPerMm, type DisplayList } from '@leathercad/render';

import { selectablePieces } from './hitTest.js';
import { createNudge, type NudgeKey } from './nudge.js';
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

/**
 * What a key means to the board's tools (U.12): the app's keymap decides, so
 * a key the maker moved in Settings moves here too. `ToolKey` names the
 * commands a tool answers to; their keys are the app's to show and change.
 */
export type ToolKey =
  | 'delete'
  | 'takeBack'
  | 'arc'
  | 'straight'
  | 'removePoint'
  | 'roundCorner'
  | 'selectAllPieces'
  | NudgeKey;

export interface KeyInput {
  /** The key's name, for Escape and Enter, whose roles no keymap changes. */
  readonly key: string;
  /** Where the key is on the keyboard: what tells a held key coming up from another (3.14). */
  readonly code: string;
  /** The commands this press is, by the keymap: a tool acts on these, not on `key`. */
  readonly means: ReadonlySet<string>;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
}

/** A modifier pressed on its own, by `KeyboardEvent.key`. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Alt', 'Control', 'Meta', 'AltGraph']);

/** Whether a press means this tool command. */
export const means = (event: KeyInput, command: ToolKey): boolean => event.means.has(command);

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
  /**
   * Asks the application to delete a part picked by its heading (Q29), which
   * asks about anything outside it that depends on it. Absent means dispatch
   * `deletePart` directly, which refuses when something does.
   */
  readonly requestDeletePart?: (partId: PartId) => void;
  /**
   * The maker's starting values (U.13, Settings › My tools), read when a tool
   * makes something: *Stitch + allowance* grows by the margin, and a fold
   * carries the leather's thickness. A function, like `drawAs`, because they
   * change under a context built once.
   *
   * Absent means the project's own settings, as before — a test harness, or a
   * headless caller with no maker.
   */
  readonly makerDefaults?: () => MakerDefaults;
  /**
   * Settings › General › Smart guides (smart-guides spec §5): whether a move
   * aligns to pieces and guides as well as snapping to points. A function,
   * like `drawAs`. Read by the alignment 3.16 adds through `decideSnap`;
   * point snapping is the same either way.
   *
   * Absent means on, the preference's default.
   */
  readonly smartGuides?: () => boolean;
}

/** What a tool takes from the maker's settings: values, never a reference to them. */
export interface MakerDefaults {
  readonly stitchMarginMm: Mm;
  /** `null` when the maker has not set one: a new fold then carries none. */
  readonly leatherThicknessMm: Mm | null;
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
   *
   * Escape is claimed when it gives something up — a gesture, a picked point,
   * a selection — and left to the window when there is nothing to, where it
   * closes an overlay or leaves focus mode (U.5): one press, one thing.
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

  /**
   * Whether a shape is under way, between its clicks: the first point is
   * placed and the rest is to come (U.11, R-11). The work bar's hints read it
   * — *Esc cancels* is offered only when there is something to cancel. A tool
   * with no such state omits it.
   */
  underway?(): boolean;

  /**
   * The size of what is being drawn, to be typed over (U.16, R-13): the
   * app shows it as chips beside the shape for as long as this is not null.
   * A tool that draws no sized shape omits all four of these.
   */
  sizing?(): SizeDraft | null;
  /**
   * Typing begins with no corner placed: the shape starts at the pointer, or
   * in the middle of the board if no pointer has been on it.
   * True when there is something to size now.
   */
  beginSizing?(ctx: ToolContext): boolean;
  /** One typed number, already quantised and checked against the others. */
  setSize?(ctx: ToolContext, field: SizeField, value: Mm): void;
  /** `Enter`: makes what is shown, as one command. */
  finishSizing?(ctx: ToolContext): void;
}

/** What a sizing tool lets be typed, in `Tab`'s order. */
export type SizeField = 'width' | 'height' | 'corner';

/** The rectangle being drawn, as it would be made: its lower-left, its sizes, its corners. */
export interface SizeDraft {
  readonly origin: Vec2;
  readonly width: Mm;
  readonly height: Mm;
  readonly corner: Mm;
  /**
   * How many times making it was refused because the typed corner no longer
   * fits — the pointer shrank a side since. The app says why on each.
   */
  readonly refusals: number;
}

/**
 * Told when a tool throws while the frame is being drawn: which tool, and
 * what it threw. The default writes to the console, which the desktop app's
 * log records (ADR 0015) — where a developer looks, and not in front of the
 * maker, whose pattern is not what is wrong.
 */
export type ToolErrorReporter = (toolId: string, error: unknown) => void;

const reportToConsole: ToolErrorReporter = (toolId, error) => {
  console.error(`tool "${toolId}" failed while drawing; the frame was drawn without it`, error);
};

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

  /**
   * The snap the last pointer event caught: for the overlay glyph, and held
   * by the next event while the cursor stays near it (hysteresis, 3.20).
   */
  private caught: SnapCandidate | null = null;

  /**
   * The snap index, and the project it was built from.
   *
   * Rebuilt when the project object changes — which, with immutable updates and
   * structural sharing, is exactly when the geometry could have moved. The same
   * identity-as-cache-key trick `evaluate` uses.
   */
  private index: { project: Project; resolved: ResolvedProject; index: SnapIndex } | null = null;

  /**
   * What already failed and was reported, so a tool that throws on every
   * frame is reported once rather than sixty times a second. Cleared when
   * that call succeeds again, so a second, later failure is reported too.
   */
  private readonly failing = new Set<'overlay' | 'notice'>();

  /** The arrow keys' move of the selection (3.14): the board's, whichever tool is active. */
  private readonly nudge = createNudge();

  constructor(
    private readonly context: ToolContext,
    initial: Tool,
    private readonly tools: readonly Tool[],
    private readonly reportError: ToolErrorReporter = reportToConsole,
  ) {
    this.active = initial;
  }

  get activeTool(): Tool {
    return this.active;
  }

  /** The active tool's message, if it has one right now. */
  notice(): Problem | null {
    return this.isolated(
      'notice',
      () => this.active.notice?.(this.context) ?? this.nudge.notice(this.context),
      null,
    );
  }

  /**
   * Runs one of the active tool's drawing calls so that a throw costs only
   * that tool's part of the frame (3.11). Both are called from the paint loop,
   * where an exception used to stop the grid, the rulers and every feature
   * painting — the whole canvas lost to one tool's rubber band.
   */
  private isolated<T>(call: 'overlay' | 'notice', run: () => T, fallback: T): T {
    try {
      const result = run();
      this.failing.delete(call);
      return result;
    } catch (error) {
      if (!this.failing.has(call)) {
        this.failing.add(call);
        this.reportError(this.active.id, error);
      }
      return fallback;
    }
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

    // A nudge still held is kept first: deactivating rolls back what is open.
    this.nudge.release(this.context);
    // Deactivating must close any open transaction, or a half-drawn shape
    // would survive into the next tool.
    this.active.onDeactivate?.(this.context);
    this.active = next;
    // A different tool's failures are its own, and reported afresh.
    this.failing.clear();
    // A glyph left over from the previous tool would advertise a snap the new
    // one has not been offered.
    this.caught = null;
    this.context.invalidate();
  }

  /**
   * A project was read in under the board (Q39). The active tool gives up
   * whatever it had half done, as Escape does, and stays selected: every tool
   * returns to idle on deactivating, which is the same thing. The snap index
   * of the project it replaced goes too, rather than holding that project
   * until the next pointer move (PERF-010).
   */
  reset(): void {
    this.nudge.release(this.context);
    this.active.onDeactivate?.(this.context);
    this.caught = null;
    this.index = null;
    this.context.invalidate();
  }

  pointerDown(event: PointerInput): void {
    // A press begins its own gesture, which would cancel a nudge still held.
    this.nudge.release(this.context);
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
  private snapped(
    event: PointerInput,
    exclude: readonly string[] = this.active.snapExclusions?.(this.context) ?? NOTHING_EXCLUDED,
  ): PointerInput {
    const before = this.caught;
    this.caught = event.ctrlKey ? null : this.findSnap(event, exclude, before);

    // A hovering pointer changes no document, and an idle tool asks for no
    // repaint — so without this the glyph is computed and never drawn until
    // the canvas happens to be dirtied by something else.
    if (!sameSnap(before, this.caught)) this.context.invalidate();

    return this.caught === null ? event : { ...event, at: this.caught.point };
  }

  /**
   * Snaps a gesture the canvas handles itself rather than a tool — a guide
   * dragged from a ruler (3.10) — with the same Ctrl and glyph, excluding what
   * that gesture is moving. The active tool is not told.
   */
  snapGesture(event: PointerInput, exclude: readonly string[]): PointerInput {
    return this.snapped(event, exclude);
  }

  private findSnap(
    event: PointerInput,
    exclude: readonly string[],
    held: SnapCandidate | null,
  ): SnapCandidate | null {
    const { resolved, index } = this.snapIndex();
    return snap(index, resolved, event.at, {
      // A pick radius in pixels, so the feel is identical at any zoom — the
      // same rule `hitTest` follows. See CLAUDE.md invariant 1.
      toleranceMm: this.context.viewport.pickToleranceMm(),
      exclude,
      held,
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

  /**
   * Hands a key to the active tool, and then to the board; true when either
   * claimed it.
   *
   * The board's own keys (3.14) are any tool's, since what is picked stays
   * picked when another tool is chosen: the arrows nudge the selection, and one
   * key picks every piece. They wait while a shape is under way — the keys are
   * then the shape's — and a tool that wants an arrow takes it first.
   */
  key(event: KeyInput): boolean {
    if (event.key === 'Escape' && this.nudge.cancel(this.context)) return true;
    // Any other key ends a nudge still held, kept: a command it dispatches
    // would otherwise roll the move back. A modifier alone is no such key —
    // Shift added to a held arrow goes on with the same move, in bigger steps.
    if (!this.nudge.hears(event) && !MODIFIER_KEYS.has(event.key)) {
      this.nudge.release(this.context);
    }
    if (this.active.onKey?.(this.context, event) === true) return true;
    if (this.underway()) return false;
    if (means(event, 'selectAllPieces')) {
      const { store } = this.context;
      store.selectParts(selectablePieces(evaluate(store.getState().document.project)));
      this.context.invalidate();
      return true;
    }
    return this.nudge.keyDown(this.context, event);
  }

  /** A key has come up, by its place on the keyboard: the last arrow held commits the nudge. */
  keyUp(code: string): void {
    this.nudge.keyUp(this.context, code);
  }

  /**
   * The keys still down no longer count: the window lost the keyboard, so
   * their key-ups will never arrive, or a press of the pointer anywhere in the
   * window is about to start something else. What was nudged is kept, as if
   * they had come up.
   */
  keysLost(): void {
    this.nudge.release(this.context);
  }

  /** Whether the active tool has a shape under way (U.11). */
  underway(): boolean {
    return this.active.underway?.() ?? false;
  }

  /** The active tool's sized shape in progress, if it has one (U.16). */
  sizing(): SizeDraft | null {
    return this.active.sizing?.() ?? null;
  }

  beginSizing(): boolean {
    return this.active.beginSizing?.(this.context) ?? false;
  }

  setSize(field: SizeField, value: Mm): void {
    this.active.setSize?.(this.context, field, value);
  }

  finishSizing(): void {
    this.active.finishSizing?.(this.context);
  }

  overlay(): DisplayList {
    const items = this.isolated(
      'overlay',
      () => this.active.buildOverlay?.(this.context).items ?? [],
      [],
    );
    if (this.caught === null) return { items };

    // The glyph rides on top of the tool's own feedback: which kind of snap is
    // about to be committed to matters more than a rubber band, because a
    // corner and the edge through it are a fraction of a millimetre apart on
    // screen and very different in the file.
    return {
      items: [...items, ...snapGlyph(this.caught, cssPxPerMm(this.context.viewport.toView()))],
    };
  }
}
