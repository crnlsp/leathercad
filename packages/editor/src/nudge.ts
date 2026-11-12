import { quantise } from '@leathercad/core';
import {
  pieceScope,
  selectedFeatureIds,
  transformRefusal,
  translateFeatures,
  type DocumentStore,
  type Selection,
} from '@leathercad/document';
import type { FeatureId, Problem } from '@leathercad/domain';
import { MatOps, type Vec2 } from '@leathercad/geometry';

/** A nudge of the selection (3.14): a direction, and the step it takes. */
export type NudgeKey = `nudge${'Left' | 'Right' | 'Up' | 'Down'}${'' | 'Big' | 'Fine'}`;

/** As much of a key press as a nudge reads: where the key is, and what the keymap makes of it. */
interface NudgePress {
  readonly code: string;
  readonly means: ReadonlySet<string>;
}

/** As much of a tool's context as a nudge uses. */
interface NudgeContext {
  readonly store: DocumentStore;
  invalidate(): void;
}

/**
 * How far each nudge goes (3.14), in **tenths of a millimetre** and Y up: 1 mm,
 * 10 mm with the big step, 0.1 mm with the fine one. Whole numbers, so a held
 * key's steps add up exactly and the move is quantised once, from their sum.
 */
const STEPS: Readonly<Record<NudgeKey, Vec2>> = {
  nudgeLeft: { x: -10, y: 0 },
  nudgeRight: { x: 10, y: 0 },
  nudgeUp: { x: 0, y: 10 },
  nudgeDown: { x: 0, y: -10 },
  nudgeLeftBig: { x: -100, y: 0 },
  nudgeRightBig: { x: 100, y: 0 },
  nudgeUpBig: { x: 0, y: 100 },
  nudgeDownBig: { x: 0, y: -100 },
  nudgeLeftFine: { x: -1, y: 0 },
  nudgeRightFine: { x: 1, y: 0 },
  nudgeUpFine: { x: 0, y: 1 },
  nudgeDownFine: { x: 0, y: -1 },
};

const NUDGE_KEYS = Object.keys(STEPS) as readonly NudgeKey[];

/** The step a press asks for, by what the keymap makes of it — never by the key's name. */
function stepOf(event: NudgePress): Vec2 | null {
  const key = NUDGE_KEYS.find((candidate) => event.means.has(candidate));
  return key === undefined ? null : STEPS[key];
}

/** Whether a press is a nudge at all, whatever comes of it. */
export const isNudge = (event: NudgePress): boolean => stepOf(event) !== null;

type State =
  | {
      readonly kind: 'idle';
      /**
       * Why the last nudge moved nothing, and the selection it was said of. A
       * tap is over before a sentence can be read, so the reason outlives the
       * key — until the next press, or until something else is picked.
       */
      readonly refused: { readonly problem: Problem; readonly selection: Selection } | null;
    }
  | {
      readonly kind: 'moving';
      /** The keys still down, by where they are: modifiers may change before a key comes up. */
      readonly held: ReadonlySet<string>;
      /** The selection, each piece in it made whole (Q30), as a drag moves it. */
      readonly moving: readonly FeatureId[];
      /** Every step so far, summed, in tenths of a millimetre. */
      readonly tenths: Vec2;
      readonly refusal: Problem | null;
    }
  /** Cancelled with keys still down: their repeats move nothing until they come up. */
  | { readonly kind: 'cancelled'; readonly held: ReadonlySet<string> };

const IDLE: State = { kind: 'idle', refused: null };

/**
 * The selection moved by the arrow keys (3.14, smart-guides spec §4).
 *
 * A press is a gesture, as a drag is: the first key down begins a `move`, each
 * repeat previews the sum so far, and the last held key coming up commits — so
 * one press is one step of history and so is a held key, with no timer (D9).
 * What moves and what is refused are the drag's: `pieceScope` makes a piece
 * whole, and `transformRefusal` says why a locked piece stays.
 */
export interface Nudge {
  /** A key down. True when it was a nudge and something is picked: the key is claimed. */
  keyDown(ctx: NudgeContext, event: NudgePress): boolean;
  /** A key up, by its place on the keyboard. The last one commits. */
  keyUp(ctx: NudgeContext, code: string): void;
  /**
   * Ends the gesture as if every key had come up, and forgets a refusal:
   * whatever happens next — a press of the pointer, another key, the window
   * losing the keyboard — must not find a transaction open, or cancel it.
   */
  release(ctx: NudgeContext): void;
  /** Escape: gives the move up. True when there was one. */
  cancel(ctx: NudgeContext): boolean;
  notice(ctx: NudgeContext): Problem | null;
}

export function createNudge(): Nudge {
  let state: State = IDLE;

  const finish = (ctx: NudgeContext): void => {
    if (state.kind !== 'moving') {
      state = IDLE;
      return;
    }
    const { refusal } = state;
    if (ctx.store.inTransaction) ctx.store.commit();
    state = {
      kind: 'idle',
      refused:
        refusal === null ? null : { problem: refusal, selection: ctx.store.getState().selection },
    };
    ctx.invalidate();
  };

  return {
    keyDown(ctx, event) {
      const step = stepOf(event);
      if (step === null) return false;

      // Undo, or a command, ended the move under the held key.
      if (state.kind === 'moving' && !ctx.store.inTransaction) {
        state = { kind: 'cancelled', held: state.held };
      }
      if (state.kind === 'cancelled' && state.held.has(event.code)) return true;

      let gesture = state.kind === 'moving' ? state : null;
      if (gesture === null) {
        // Another gesture has the document: a drag, a guide pulled from a ruler.
        if (ctx.store.inTransaction) return false;
        const { document, selection } = ctx.store.getState();
        const { features } = pieceScope(
          document.project,
          selectedFeatureIds(document.project, selection),
        );
        state = IDLE;
        if (features.length === 0) return false;
        ctx.store.begin({ action: 'move' });
        gesture = {
          kind: 'moving',
          held: new Set(),
          moving: features,
          tenths: { x: 0, y: 0 },
          refusal: null,
        };
      }

      const tenths = { x: gesture.tenths.x + step.x, y: gesture.tenths.y + step.y };
      const delta = { x: quantise(tenths.x / 10), y: quantise(tenths.y / 10) };
      state = {
        ...gesture,
        held: new Set([...gesture.held, event.code]),
        tenths,
        // The check the command makes, asked first so the maker is told why
        // nothing moves, as a drag tells them.
        refusal: transformRefusal(
          ctx.store.getState().document.project,
          gesture.moving,
          MatOps.fromTranslation(delta),
        ),
      };
      ctx.store.preview(translateFeatures(gesture.moving, delta));
      ctx.invalidate();
      return true;
    },

    keyUp(ctx, code) {
      if (state.kind === 'idle' || !state.held.has(code)) return;
      const held = new Set(state.held);
      held.delete(code);
      if (held.size > 0) state = { ...state, held };
      else finish(ctx);
    },

    release(ctx) {
      if (state === IDLE) return;
      finish(ctx);
      state = IDLE;
      ctx.invalidate();
    },

    cancel(ctx) {
      if (state.kind !== 'moving') return false;
      if (ctx.store.inTransaction) ctx.store.rollback();
      state = { kind: 'cancelled', held: state.held };
      ctx.invalidate();
      return true;
    },

    notice(ctx) {
      if (state.kind === 'moving') return state.refusal;
      if (state.kind !== 'idle' || state.refused === null) return null;
      return ctx.store.getState().selection === state.refused.selection
        ? state.refused.problem
        : null;
    },
  };
}
