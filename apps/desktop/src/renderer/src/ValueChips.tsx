import { approxEq, formatEditable, parseLength, quantise } from '@leathercad/core';
import type { DocumentStore } from '@leathercad/document';
import type { SizeDraft, SizeField } from '@leathercad/editor';
import {
  VALUE_CHIPS,
  placeValueChips,
  type ChipBox,
  type CssBox,
  type DisplayList,
  type ValueChip,
  type ViewportView,
} from '@leathercad/render';
import {
  memo,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';

import { intoMenu } from './fieldMenu.js';
import { useI18n } from './i18n.js';
import { useKeysInSentences } from './keyCaps.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import {
  CHIP_MIN,
  chipCommand,
  chipNumber,
  chipRefusal,
  chipSubject,
  chipsOf,
  drawnSubject,
  chipValue,
  type ChipSubject,
  type RefusalWords,
} from './outlineSizes.js';

/** What the canvas asks of the chips, once a frame. */
export interface ValueChipsHandle {
  /**
   * Puts each chip where `placeValueChips` says for this camera, in the room
   * the board leaves it — clear of a panel over it and of the controls laid
   * over it — and returns the lines they sit on for the board to draw, and
   * the boxes they take, which the selection bar keeps clear of (U.17); null
   * with no chips.
   */
  place(
    view: ViewportView,
    room: { area?: CssBox; obstacles: readonly CssBox[] },
  ): { lines: DisplayList; taken: CssBox[] } | null;
  /** Opens the first chip in view, as `Enter` on the board does; false with none. */
  open(): boolean;
}

/** An element's box on the board, from its top-left there. */
function boxOf(left: number, top: number, element: HTMLElement): CssBox {
  return { left, top, right: left + element.offsetWidth, bottom: top + element.offsetHeight };
}

/** The chips placed in view, in Tab's order: the width first. */
function inView(chips: ReadonlyMap<ValueChip, HTMLElement>): HTMLElement[] {
  return VALUE_CHIPS.flatMap((chip) => {
    const element = chips.get(chip);
    return element?.style.visibility === 'visible' ? [element] : [];
  });
}

/**
 * What the chips do while a rectangle is being drawn (U.16, R-13): the tool's
 * own, so a typed number goes to the shape in progress and `Enter` makes it —
 * the chips never write the document themselves.
 */
export interface DrawnChips {
  /** The shape in progress as it is now, not as the last render saw it. */
  read(): SizeDraft | null;
  set(field: SizeField, value: number): void;
  /** `Enter`: makes the shape. */
  finish(): void;
  /** `Esc`: gives it up. */
  cancel(): void;
}

/** Why the open chip's value cannot apply: its words, and what Enter applies instead, if anything. */
interface Note {
  readonly chip: ValueChip;
  readonly reason: string;
  readonly use: number | null;
}

/**
 * A selected outline's sizes, on the board beside it (R-12, U.14): width,
 * height, the corner radius and the stitch margin, each a field that looks
 * like a dimension's number until it is clicked, or `Enter` is pressed on the
 * board. Typed as Properties' fields are — `95-2*3.5`, `3.75in` — and applied
 * as one command each. They are not Tab stops at rest: the board is, and
 * `Enter` there opens the first in view. While one is open, `Tab` and
 * `Shift+Tab` go through the others, and past either end out of them, as the
 * window's Tab would; `Esc`, or an `Enter` that applies, gives the keys back
 * to the board.
 *
 * React renders the fields; where they sit is the canvas's to say, once a
 * frame, through `place` — so a pan or a zoom moves them in the frame the
 * board moves, without a render of React. Memoised, so the canvas's own
 * renders — every pointer move — do not render it, nor ask for a frame.
 */
export const ValueChips = memo(function ValueChips({
  store,
  drawing,
  drawn,
  invalidate,
  toBoard,
  ref,
}: {
  store: DocumentStore;
  /** The rectangle being drawn, when one is: its sizes are the chips, in place of a selected outline's. */
  drawing: SizeDraft | null;
  drawn: DrawnChips;
  /** Asks the canvas for a frame, which places the chips again. */
  invalidate: () => void;
  /** Gives the keys back to the board: focus on it, where Enter opens the chips again. */
  toBoard: () => void;
  ref?: React.Ref<ValueChipsHandle>;
}) {
  const { t } = useI18n();
  const keys = useKeysInSentences();
  const words: RefusalWords = useMemo(() => ({ t, enter: keys['enter'] ?? '' }), [t, keys]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const document = useSyncExternalStore(subscribe, () => store.getState().document);
  const selection = useSyncExternalStore(subscribe, () => store.getState().selection);
  const subject = useMemo(
    () => (drawing === null ? chipSubject(document.project, selection) : drawnSubject(drawing)),
    [drawing, document.project, selection],
  );
  /** The outline or shape the chips are on now — the store's and the tool's, not this render's. */
  const subjectNow = useCallback((): ChipSubject | null => {
    const draft = drawn.read();
    if (draft !== null) return drawnSubject(draft);
    const state = store.getState();
    return chipSubject(state.document.project, state.selection);
  }, [store, drawn]);

  const chips = useRef(new Map<ValueChip, HTMLElement>());
  /** Focuses the chip after `from`, or before it; false past either end. */
  const step = (from: ValueChip, back: boolean): boolean => {
    const shown = inView(chips.current);
    const at = shown.findIndex((element) => element.dataset['chip'] === from);
    // Drawing, Tab goes round: past the last chip is not out of the shape
    // being drawn, whose `Enter` is what ends it.
    const around = drawing !== null && shown.length > 1;
    const next =
      at < 0
        ? undefined
        : (shown[back ? at - 1 : at + 1] ??
          (around ? shown[back ? shown.length - 1 : 0] : undefined));
    next?.querySelector('input')?.focus();
    return next !== undefined;
  };
  const noteRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [typedNote, setNote] = useState<Note | null>(null);
  const noteId = useId();
  // The tool refused to make the shape: its typed corner no longer fits what
  // the pointer has left. Said beside the corner chip for as long as it is
  // so, and that chip opened on it, where a second Enter takes what fits.
  const refusals = drawing?.refusals ?? 0;
  const refusedNote = useMemo((): Note | null => {
    if (drawing === null || drawing.refusals === 0) return null;
    const refusal = chipRefusal(drawnSubject(drawing), 'corner', drawing.corner, words);
    return refusal === null ? null : { chip: 'corner', ...refusal };
  }, [drawing, words]);
  const note = typedNote ?? refusedNote;
  useLayoutEffect(() => {
    if (refusals > 0) chips.current.get('corner')?.querySelector('input')?.focus();
  }, [refusals]);

  // New chips, new numbers, or a note: place them again.
  useLayoutEffect(() => {
    if (subject !== null) invalidate();
  }, [subject, note, invalidate]);

  useImperativeHandle(
    ref,
    (): ValueChipsHandle => ({
      place(view, { area, obstacles }) {
        // The store's now, as the board paints it: React's may be a render behind.
        const current = subjectNow();
        if (current === null) return null;
        const sizes: Partial<Record<ValueChip, ChipBox>> = {};
        for (const [chip, element] of chips.current) {
          sizes[chip] = { width: element.offsetWidth, height: element.offsetHeight };
        }
        const noteElement = noteRef.current;
        const hintElement = hintRef.current;
        const noteFor =
          noteElement === null ? undefined : (noteElement.dataset['chip'] as ValueChip);
        const placed = placeValueChips(view, {
          rect: current.shape,
          marginMm: current.margin?.op.distanceMm ?? null,
          sizes,
          ...(area === undefined ? {} : { area }),
          obstacles,
          // Drawing, every size is typed blind: none may drop out of Tab's way.
          keepAll: drawn.read() !== null,
          ...(hintElement === null
            ? {}
            : { hint: { width: hintElement.offsetWidth, height: hintElement.offsetHeight } }),
          ...(noteElement === null || noteFor === undefined
            ? {}
            : {
                note: {
                  chip: noteFor,
                  size: { width: noteElement.offsetWidth, height: noteElement.offsetHeight },
                },
              }),
        });
        const taken: CssBox[] = [];
        for (const [chip, element] of chips.current) {
          const at = placed.at[chip];
          // The one being typed in stays where it was, rather than vanish
          // from under the caret, if a pan takes its place out of view.
          if (at === undefined) {
            if (!element.contains(window.document.activeElement)) {
              element.style.visibility = 'hidden';
            }
            continue;
          }
          element.style.transform = `translate(${String(at.x - element.offsetWidth / 2)}px, ${String(at.y - element.offsetHeight / 2)}px)`;
          element.style.visibility = 'visible';
          taken.push(
            boxOf(at.x - element.offsetWidth / 2, at.y - element.offsetHeight / 2, element),
          );
        }
        if (hintElement !== null) {
          const at = placed.hintAt;
          if (at !== undefined)
            hintElement.style.transform = `translate(${String(at.x)}px, ${String(at.y)}px)`;
          hintElement.style.visibility = at === undefined ? 'hidden' : 'visible';
        }
        if (noteElement !== null) {
          const at = placed.noteAt;
          if (at !== undefined) {
            noteElement.style.transform = `translate(${String(at.x)}px, ${String(at.y)}px)`;
            taken.push(boxOf(at.x, at.y, noteElement));
          }
          noteElement.style.visibility = at === undefined ? 'hidden' : 'visible';
        }
        return { lines: placed.lines, taken };
      },
      open() {
        // In Tab's order: the width first, unless it is out of view.
        const first = inView(chips.current)[0]?.querySelector('input');
        first?.focus();
        return first !== undefined && first !== null;
      },
    }),
    [subjectNow, drawn],
  );

  if (subject === null) return null;
  return (
    <div
      className="value-chips"
      role="group"
      aria-label={drawing === null ? t('chips.title') : t('chips.titleDrawing')}
      data-testid="value-chips"
    >
      {chipsOf(subject).map((chip) => (
        <Chip
          key={chip}
          chip={chip}
          subject={subject}
          words={words}
          store={store}
          drawn={drawing === null ? null : drawn}
          subjectNow={subjectNow}
          note={note?.chip === chip ? note : null}
          noteId={noteId}
          onNote={setNote}
          onResize={invalidate}
          onStep={step}
          toBoard={toBoard}
          register={(element) => {
            if (element === null) chips.current.delete(chip);
            else chips.current.set(chip, element);
          }}
        />
      ))}
      {drawing !== null && (
        <div ref={hintRef} className="value-chip-hint" data-testid="value-chip-hint">
          <kbd>{keys['tab']}</kbd> {t('chips.hint.next')} <span aria-hidden="true">·</span>{' '}
          <kbd>{keys['enter']}</kbd> {t('chips.hint.make')} <span aria-hidden="true">·</span>{' '}
          <kbd>{keys['escape']}</kbd> {t('chips.hint.cancel')}
        </div>
      )}
      {note !== null && (
        <div
          ref={noteRef}
          id={noteId}
          className="value-chip-note"
          data-chip={note.chip}
          data-testid="value-chip-note"
          aria-hidden="true"
        >
          <SeverityGlyph severity="warning" /> {note.reason}
        </div>
      )}
    </div>
  );
});

/** How a chip was left: Enter, Tab, or focus going elsewhere. */
type Leaving = 'enter' | 'tab' | 'blur';

function Chip({
  chip,
  subject,
  words,
  store,
  drawn,
  subjectNow,
  note,
  noteId,
  onNote,
  onResize,
  onStep,
  toBoard,
  register,
}: {
  chip: ValueChip;
  subject: ChipSubject;
  words: RefusalWords;
  store: DocumentStore;
  /** Set while a rectangle is being drawn: a typed number goes to it, not to an outline. */
  drawn: DrawnChips | null;
  subjectNow: () => ChipSubject | null;
  note: Note | null;
  noteId: string;
  onNote: (note: Note | null) => void;
  /** Its text changed, and with it its size: the canvas places it again. */
  onResize: () => void;
  /** Opens the next chip in view, or the one before; false past the end. */
  onStep: (from: ValueChip, back: boolean) => boolean;
  toBoard: () => void;
  register: (element: HTMLLabelElement | null) => void;
}) {
  const { t } = words;
  const value = chipValue(subject, chip);
  // While open, what is typed; otherwise the document's number.
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  // The outline as it was when the chip opened: a click on another piece
  // ends the edit, and must not type this size into that one.
  const openedOn = useRef<ChipSubject>(subject);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;

  const updateDraft = (next: string | null): void => {
    draftRef.current = next;
    setDraft(next);
    onNote(null);
  };

  // Opened: the number, all of it selected, so typing replaces it.
  useLayoutEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  /** Applies what was typed; false when it cannot, and the chip stays open saying why. */
  const apply = (leaving: Leaving): boolean => {
    const pending = draftRef.current;
    if (pending === null) return true;
    // A shape being drawn is checked as it is now — the pointer may have
    // moved since the chip opened; an outline, as it was when it opened.
    const target = drawn === null ? openedOn.current : (subjectNow() ?? openedOn.current);
    const current = chipValue(target, chip);
    const close = (): true => {
      updateDraft(null);
      return true;
    };
    if (pending.trim() === '') return close();

    // Said once; a second Tab leaves without it, and leaving the chip drops it.
    const said = note !== null;
    const parsed = parseLength(pending);
    if (!parsed.ok) {
      if (leaving === 'blur' || (leaving === 'tab' && said)) return close();
      const reason =
        parsed.error.kind === 'unit'
          ? t('editor.lengthError.unit', { unit: parsed.error.unit })
          : t(`editor.lengthError.${parsed.error.kind}`);
      onNote({ chip, reason, use: null });
      return false;
    }

    let typed = quantise(Math.max(CHIP_MIN[chip], parsed.value));
    const refusal = chipRefusal(target, chip, typed, words);
    if (refusal !== null) {
      if (leaving === 'blur' || (leaving === 'tab' && said)) return close();
      // Enter again takes what the note offers.
      if (!(leaving === 'enter' && said && note.use !== null)) {
        onNote({ chip, reason: refusal.reason, use: refusal.use });
        return false;
      }
      typed = refusal.use;
    }
    if (drawn !== null) {
      // Always: a number equal to the pointer's is still typed, and stays.
      if (chip !== 'margin') drawn.set(chip, typed);
    } else if (current === null || !approxEq(typed, current)) {
      store.dispatch(chipCommand(target, chip, typed));
    }
    return close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Applied, the keys go back to the board: Enter there opens the chips
      // again. A shape being drawn is made, by the same Enter.
      if (apply('enter')) {
        drawn?.finish();
        toBoard();
      }
    } else if (event.key === 'Escape') {
      // What was typed is dropped, and the board has the keys again — not the
      // tool, which would take Escape as clearing the selection.
      event.preventDefault();
      event.stopPropagation();
      updateDraft(null);
      drawn?.cancel();
      toBoard();
    } else if (event.key === 'Tab') {
      // Applied, Tab goes on to the next chip, Shift+Tab back. Past either end
      // the window's own Tab goes on from here — the board before the chips,
      // the legend after them — so there is no trap: the chips are not Tab
      // stops of their own.
      if (!apply('tab') || onStep(chip, event.shiftKey)) event.preventDefault();
    }
  };

  const shown = draft ?? (value === null ? t('chips.mixed') : chipNumber(value));
  useLayoutEffect(() => onResize(), [shown, editing, onResize]);
  const prefix =
    chip === 'corner' ? t('chips.corner') : chip === 'margin' ? t('chips.margin') : null;
  const name =
    chip === 'width'
      ? t('editor.width')
      : chip === 'height'
        ? t('editor.height')
        : chip === 'corner'
          ? t('chips.cornerName')
          : t('editor.edgeMargin');

  return (
    <label
      ref={register}
      className="value-chip"
      data-chip={chip}
      data-editing={editing || undefined}
      data-testid={`value-chip-${chip}`}
    >
      {prefix !== null && (
        <span className="value-chip-prefix" aria-hidden="true">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        // Reached by Enter on the board, not by the window's Tab (R-12).
        tabIndex={-1}
        spellCheck={false}
        aria-label={name}
        aria-invalid={note !== null || undefined}
        aria-describedby={note !== null ? noteId : undefined}
        value={shown}
        onFocus={() => {
          // The store's now, not this render's: Tab opens the next chip in the
          // same keypress that applied the last, before React renders the
          // outline it made — and a stale outline would put the last size back.
          const now = subjectNow() ?? subject;
          openedOn.current = now;
          if (draftRef.current === null) {
            const opened = chipValue(now, chip);
            updateDraft(opened === null ? '' : formatEditable(opened, 2));
          }
        }}
        onChange={(event) => updateDraft(event.target.value)}
        onBlur={(event) => {
          // The field's own menu (U.20) is not leaving the chip.
          if (!intoMenu(event.relatedTarget)) apply('blur');
        }}
        onKeyDown={onKeyDown}
        // Stop canvas shortcuts firing while a chip has focus, as a field does.
        onKeyUp={(event) => event.stopPropagation()}
      />
      {editing && (
        <span className="value-chip-unit" aria-hidden="true">
          mm
        </span>
      )}
    </label>
  );
}
