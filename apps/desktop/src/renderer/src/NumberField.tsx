import { quantise } from '@leathercad/core';
import { useRef, useState } from 'react';

/**
 * A millimetre entry field.
 *
 * Commits on Enter or blur, reverts on Escape, and quantises to the storage
 * grid before it ever reaches the document (CLAUDE.md invariant 8). It keeps
 * its own draft string while focused so that typing "10." or "-" does not get
 * parsed into nonsense halfway through.
 *
 * Typing an exact number is not a convenience here — it is the primary way to
 * work. Mouse precision is the fallback.
 */
export function NumberField({
  label,
  value,
  onCommit,
  min,
  step = 1,
  suffix = 'mm',
  disabled = false,
  precision = 2,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
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
  const shown = draft ?? formatMm(value, precision);

  const updateDraft = (next: string | null): void => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = (): void => {
    const pending = draftRef.current;
    if (pending === null) return;
    const parsed = Number.parseFloat(pending.replace(',', '.'));
    updateDraft(null);
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
              const next = quantise(
                (draft === null ? value : Number.parseFloat(draft) || value) + delta,
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

/** Trims trailing zeros so 105 reads as "105", not "105.00". */
function formatMm(value: number, precision: number): string {
  const fixed = value.toFixed(precision);
  return fixed.replace(/\.?0+$/, '');
}
