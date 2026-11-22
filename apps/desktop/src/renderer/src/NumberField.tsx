import { COORDINATE_LIMIT_MM, formatEditable, quantise, type LengthError } from '@leathercad/core';
import { useId, useRef, useState } from 'react';

import { fieldErrorText, readField } from './fieldText.js';
import { intoMenu } from './fieldMenu.js';
import { useI18n } from './i18n.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import type { Refusal } from './outlineSizes.js';

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
 * **Nothing past what a project holds is taken** — ±`COORDINATE_LIMIT_MM`, the
 * file format's own bound — in any field: Enter keeps the text and names the
 * limit, and the arrow keys stop at it (QA F1).
 *
 * **A value the field's owner refuses** (`refuse`) — a corner larger than the
 * rectangle draws (U.14) — is kept on Enter with the reason and a warning
 * glyph beneath, which names what a second Enter applies instead; the arrow
 * keys stop there. Leaving the field drops it, as unread text is dropped.
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
  glyph,
  accessibleName,
  refuse,
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
  /** What is seen in the label's place, when `label` is too long to show: "↖" for "Top-left corner radius" (X40). */
  glyph?: string;
  /** The input's name where the label plus its suffix reads as another meaning: "Cut off" (U10). */
  accessibleName?: string;
  /** Why a value that reads cannot be stored as it is, and what to store instead (U.14). */
  refuse?: (value: number) => Refusal | null;
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
  const [refused, setRefused] = useState<Refusal | null>(null);
  const shown = draft ?? (value === null ? '' : formatEditable(value, precision));
  const inMm = suffix === 'mm';

  const updateDraft = (next: string | null): void => {
    draftRef.current = next;
    setDraft(next);
    setUnread(null);
    setRefused(null);
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

    const parsed = readField(pending, inMm);
    if (!parsed.ok) {
      if (holdUnread && (inMm || parsed.error.kind === 'beyondLimit')) setUnread(parsed.error);
      else updateDraft(null);
      return;
    }

    const clamped = min !== undefined ? Math.max(min, parsed.value) : parsed.value;
    const snapped = quantise(clamped);
    const refusal = refuse?.(snapped) ?? null;
    if (refusal !== null && holdUnread && refused === null) {
      // Said once; Enter again takes what it offers.
      setRefused(refusal);
      return;
    }
    updateDraft(null);
    if (refusal !== null && !holdUnread) return;
    const stored = refusal?.use ?? snapped;
    if (stored !== value) onCommit(stored);
  };

  return (
    <label className="field">
      <span className={hideLabel || glyph !== undefined ? 'visually-hidden' : 'field-label'}>
        {label}
      </span>
      {glyph !== undefined && (
        <span className="field-label" aria-hidden="true">
          {glyph}
        </span>
      )}
      <span className="field-input">
        <input
          type="text"
          inputMode={inMm ? 'text' : 'decimal'}
          value={shown}
          placeholder={placeholder}
          disabled={disabled}
          step={step}
          aria-label={accessibleName}
          aria-invalid={unread !== null || refused !== null || undefined}
          aria-describedby={unread !== null || refused !== null ? reasonId : undefined}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={(event) => {
            // The field's own menu is not leaving it (U.20).
            if (!intoMenu(event.relatedTarget)) commit(false);
          }}
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
              const typed = draft === null ? null : readField(draft, inMm);
              const stepped = (typed?.ok === true ? typed.value : current) + delta;
              const next = quantise(
                Math.min(COORDINATE_LIMIT_MM, Math.max(-COORDINATE_LIMIT_MM, stepped)),
              );
              updateDraft(null);
              const floored = min !== undefined ? Math.max(min, next) : next;
              // A step past what the field takes stops there.
              const stored = refuse?.(floored)?.use ?? floored;
              if (stored !== value) onCommit(stored);
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
          {fieldErrorText(unread, inMm, t)}
        </span>
      )}
      {refused !== null && (
        <span id={reasonId} className="reason field-reason refused" aria-hidden="true">
          <SeverityGlyph severity="warning" /> {refused.reason}
        </span>
      )}
    </label>
  );
}
