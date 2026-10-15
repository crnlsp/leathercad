import { approxEq, formatEditable, parseLength, quantise } from '@leathercad/core';
import type { DocumentStore } from '@leathercad/document';
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
  chipValue,
  type ChipSubject,
  type RefusalWords,
} from './outlineSizes.js';

/** What the canvas asks of the chips, once a frame. */
export interface ValueChipsHandle {
  /**
   * Puts each chip where `placeValueChips` says for this camera, and returns
   * the lines they sit on for the board to draw; null with no chips.
   */
  place(view: ViewportView, area: CssBox | undefined): DisplayList | null;
  /** Opens the first chip in view, as `Enter` on the board does; false with none. */
  open(): boolean;
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
 * as one command each. `Tab` goes on to the next, `Esc` puts the value back
 * and gives the keys back to the board.
 *
 * React renders the fields; where they sit is the canvas's to say, once a
 * frame, through `place` — so a pan or a zoom moves them in the frame the
 * board moves, without a render of React. Memoised, so the canvas's own
 * renders — every pointer move — do not render it, nor ask for a frame.
 */
export const ValueChips = memo(function ValueChips({
  store,
  invalidate,
  ref,
}: {
  store: DocumentStore;
  /** Asks the canvas for a frame, which places the chips again. */
  invalidate: () => void;
  ref?: React.Ref<ValueChipsHandle>;
}) {
  const { t } = useI18n();
  const keys = useKeysInSentences();
  const words: RefusalWords = useMemo(() => ({ t, enter: keys['enter'] ?? '' }), [t, keys]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const document = useSyncExternalStore(subscribe, () => store.getState().document);
  const selection = useSyncExternalStore(subscribe, () => store.getState().selection);
  const subject = useMemo(
    () => chipSubject(document.project, selection),
    [document.project, selection],
  );

  const chips = useRef(new Map<ValueChip, HTMLElement>());
  const noteRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<Note | null>(null);
  const noteId = useId();

  // New chips, new numbers, or a note: place them again.
  useLayoutEffect(() => {
    if (subject !== null) invalidate();
  }, [subject, note, invalidate]);

  useImperativeHandle(
    ref,
    (): ValueChipsHandle => ({
      place(view, area) {
        // The store's now, as the board paints it: React's may be a render behind.
        const state = store.getState();
        const current = chipSubject(state.document.project, state.selection);
        if (current === null) return null;
        const sizes: Partial<Record<ValueChip, ChipBox>> = {};
        for (const [chip, element] of chips.current) {
          sizes[chip] = { width: element.offsetWidth, height: element.offsetHeight };
        }
        const noteElement = noteRef.current;
        const noteFor =
          noteElement === null ? undefined : (noteElement.dataset['chip'] as ValueChip);
        const placed = placeValueChips(view, {
          rect: current.shape,
          marginMm: current.margin?.op.distanceMm ?? null,
          sizes,
          ...(area === undefined ? {} : { area }),
          ...(noteElement === null || noteFor === undefined
            ? {}
            : {
                note: {
                  chip: noteFor,
                  size: { width: noteElement.offsetWidth, height: noteElement.offsetHeight },
                },
              }),
        });
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
        }
        if (noteElement !== null) {
          const at = placed.noteAt;
          if (at !== undefined) {
            noteElement.style.transform = `translate(${String(at.x)}px, ${String(at.y)}px)`;
          }
          noteElement.style.visibility = at === undefined ? 'hidden' : 'visible';
        }
        return placed.lines;
      },
      open() {
        // In Tab's order: the width first, unless it is out of view.
        for (const chip of VALUE_CHIPS) {
          const element = chips.current.get(chip);
          if (element?.style.visibility !== 'visible') continue;
          element.querySelector('input')?.focus();
          return true;
        }
        return false;
      },
    }),
    [store],
  );

  if (subject === null) return null;
  return (
    <div
      className="value-chips"
      role="group"
      aria-label={t('chips.title')}
      data-testid="value-chips"
    >
      {chipsOf(subject).map((chip) => (
        <Chip
          key={chip}
          chip={chip}
          subject={subject}
          words={words}
          store={store}
          note={note?.chip === chip ? note : null}
          noteId={noteId}
          onNote={setNote}
          onResize={invalidate}
          register={(element) => {
            if (element === null) chips.current.delete(chip);
            else chips.current.set(chip, element);
          }}
        />
      ))}
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
  note,
  noteId,
  onNote,
  onResize,
  register,
}: {
  chip: ValueChip;
  subject: ChipSubject;
  words: RefusalWords;
  store: DocumentStore;
  note: Note | null;
  noteId: string;
  onNote: (note: Note | null) => void;
  /** Its text changed, and with it its size: the canvas places it again. */
  onResize: () => void;
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
    const target = openedOn.current;
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
    if (current === null || !approxEq(typed, current)) {
      store.dispatch(chipCommand(target, chip, typed));
    }
    return close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Applied, the keys go back to the board: Enter there opens the chips again.
      if (apply('enter')) event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      // What was typed is dropped, and the board has the keys again — not the
      // tool, which would take Escape as clearing the selection.
      event.preventDefault();
      event.stopPropagation();
      updateDraft(null);
      event.currentTarget.blur();
    } else if (event.key === 'Tab') {
      // Applied, Tab goes on to the next chip, and past the last out of them.
      if (!apply('tab')) event.preventDefault();
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
        spellCheck={false}
        aria-label={name}
        aria-invalid={note !== null || undefined}
        aria-describedby={note !== null ? noteId : undefined}
        value={shown}
        onFocus={() => {
          openedOn.current = subject;
          if (draftRef.current === null) {
            updateDraft(value === null ? '' : formatEditable(value, 2));
          }
        }}
        onChange={(event) => updateDraft(event.target.value)}
        onBlur={() => apply('blur')}
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
