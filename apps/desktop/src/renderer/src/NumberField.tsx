import {
  err,
  formatEditable,
  ok,
  parseLength,
  parseNumber,
  quantise,
  type LengthError,
  type Result,
} from '@leathercad/core';
import { useId, useRef, useState } from 'react';

import { useI18n } from './i18n.js';

/**
 * What a field's text comes to. A field in millimetres takes a size as a maker
 * types it — `95-2*3.5`, `3.75in`, `9,5 cm` (U.15) — so the same text means the
 * same thing in every one; any other field (a count, an angle) a plain number.
 */
function read(text: string, inMm: boolean): Result<number, LengthError> {
  if (inMm) return parseLength(text);
  const value = parseNumber(text);
  return Number.isFinite(value) ? ok(value) : err({ kind: 'syntax' });
}

/**
 * A millimetre entry field.
 *
 * Commits on Enter or blur, reverts on Escape, and quantises to the storage
 * grid before it ever reaches the document (CLAUDE.md invariant 8). It keeps
 * its own draft string while focused so that typing "10." or "-" does not get
 * parsed into nonsense halfway through. It shows a negative with a true minus
 * and accepts either minus back, so a value can be retyped as it reads.
 *
 * Typing an exact number is not a convenience here — it is the primary way to
 * work. Mouse precision is the fallback. So a field in millimetres reads a sum
 * and a unit (`95-2*3.5`, `3.75in`) and shows the result in mm; and Enter on
 * text it cannot read keeps the text, and says why beneath, rather than
 * dropping what was typed. Leaving the field, or Escape, still reverts.
 *
 * **An empty field is an answer only when the caller says so.** Pass `onClear`
 * and a `null` value renders blank with the `placeholder`, and clearing the
 * field calls `onClear`. Without it an empty draft is a typo and reverts, as it
 * always has — so every existing field behaves exactly as before.
 */
export function NumberField({
  label,
  value,
  onCommit,
  onClear,
  placeholder,
  min,
  step = 1,
  suffix = 'mm',
  disabled = false,
  precision = 2,
  hideLabel = false,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number) => void;
  onClear?: () => void;
  placeholder?: string;
  min?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  precision?: number;
  /** Named for a screen reader only, where a column heading or a setting's name says it (U.13). */
  hideLabel?: boolean;
}) {
  // While the user is typing, their draft wins; otherwise the document does,
  // so an undo immediately shows the restored number.
  //
  // The draft is mirrored in a ref because `commit` can be reached twice for a
  // single edit — Enter commits and then blurs, and the blur handler commits
  // again from the same render's closure, where the state variable is still
  // the old value. That produced two identical commands and so two history
  // entries, which made the first press of Undo appear to do nothing.
  const { t } = useI18n();
  const reasonId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const [unread, setUnread] = useState<LengthError | null>(null);
  const shown = draft ?? (value === null ? '' : formatEditable(value, precision));
  const inMm = suffix === 'mm';

  const updateDraft = (next: string | null): void => {
    draftRef.current = next;
    setDraft(next);
    setUnread(null);
  };

  /** `holdUnread`: Enter keeps text it cannot read, and says why; a blur drops it. */
  const commit = (holdUnread: boolean): void => {
    const pending = draftRef.current;
    if (pending === null) return;

    if (pending.trim() === '') {
      updateDraft(null);
      // Only a field that allows it treats blank as a value; and clearing one
      // that is already blank is not an edit, so it writes no history.
      if (onClear !== undefined && value !== null) onClear();
      return;
    }

    const parsed = read(pending, inMm);
    if (!parsed.ok) {
      if (holdUnread && inMm) setUnread(parsed.error);
      else updateDraft(null);
      return;
    }
    updateDraft(null);

    const clamped = min !== undefined ? Math.max(min, parsed.value) : parsed.value;
    const snapped = quantise(clamped);
    if (snapped !== value) onCommit(snapped);
  };

  return (
    <label className="field">
      <span className={hideLabel ? 'visually-hidden' : 'field-label'}>{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode={inMm ? 'text' : 'decimal'}
          value={shown}
          placeholder={placeholder}
          disabled={disabled}
          step={step}
          aria-invalid={unread !== null || undefined}
          aria-describedby={unread !== null ? reasonId : undefined}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit(true);
              if (draftRef.current === null) event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              // An edit in progress is what Escape cancels — not the dialog
              // or the tool around the field (U.13, Settings › My tools).
              if (draftRef.current !== null) event.stopPropagation();
              updateDraft(null);
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const delta =
                (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? step * 10 : step);
              // A blank field steps from its minimum, or from zero: there is no
              // current number to step from, and inventing one would be worse.
              const current = value ?? min ?? 0;
              const typed = draft === null ? null : read(draft, inMm);
              const next = quantise((typed?.ok === true ? typed.value : current) + delta);
              updateDraft(null);
              onCommit(min !== undefined ? Math.max(min, next) : next);
            }
          }}
          // Stop canvas shortcuts firing while a field has focus.
          onKeyUp={(event) => event.stopPropagation()}
        />
        {suffix !== '' && <span className="field-suffix">{suffix}</span>}
      </span>
      {unread !== null && (
        // Hidden from the label's name, which stays the field's; the input is
        // described by it instead, as a reason beneath a button is (F.1).
        <span id={reasonId} className="reason field-reason" aria-hidden="true">
          {unread.kind === 'unit'
            ? t('editor.lengthError.unit', { unit: unread.unit })
            : t(`editor.lengthError.${unread.kind}`)}
        </span>
      )}
    </label>
  );
}
