import { formatEditable, parseNumber, quantise } from '@leathercad/core';
import { useRef, useState } from 'react';

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
 * work. Mouse precision is the fallback.
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
}) {
  // While the user is typing, their draft wins; otherwise the document does,
  // so an undo immediately shows the restored number.
  //
  // The draft is mirrored in a ref because `commit` can be reached twice for a
  // single edit — Enter commits and then blurs, and the blur handler commits
  // again from the same render's closure, where the state variable is still
  // the old value. That produced two identical commands and so two history
  // entries, which made the first press of Undo appear to do nothing.
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const shown = draft ?? (value === null ? '' : formatEditable(value, precision));

  const updateDraft = (next: string | null): void => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = (): void => {
    const pending = draftRef.current;
    if (pending === null) return;
    updateDraft(null);

    if (pending.trim() === '') {
      // Only a field that allows it treats blank as a value; and clearing one
      // that is already blank is not an edit, so it writes no history.
      if (onClear !== undefined && value !== null) onClear();
      return;
    }

    const parsed = parseNumber(pending);
    if (!Number.isFinite(parsed)) return;

    const clamped = min !== undefined ? Math.max(min, parsed) : parsed;
    const snapped = quantise(clamped);
    if (snapped !== value) onCommit(snapped);
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode="decimal"
          value={shown}
          placeholder={placeholder}
          disabled={disabled}
          step={step}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              updateDraft(null);
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const delta =
                (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? step * 10 : step);
              // A blank field steps from its minimum, or from zero: there is no
              // current number to step from, and inventing one would be worse.
              const current = value ?? min ?? 0;
              const next = quantise(
                (draft === null ? current : parseNumber(draft) || current) + delta,
              );
              setDraft(null);
              onCommit(min !== undefined ? Math.max(min, next) : next);
            }
          }}
          // Stop canvas shortcuts firing while a field has focus.
          onKeyUp={(event) => event.stopPropagation()}
        />
        {suffix !== '' && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}
