import type { FoldLine } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';

/**
 * Which way the leather bends, and how thick it is where it bends.
 *
 * Thickness is stored and nothing consumes it yet — bend allowance is v1.1.
 * It is editable anyway because 4.1 deliberately stored it, and a field that
 * is written but unreachable is how stored-but-unreachable becomes
 * stored-but-wrong.
 *
 * **Blank means no override**, and is shown blank rather than as `0`: 0 mm
 * reads as a claim that the leather has no thickness, which is a different and
 * false statement from not having said. Clearing the field drops the stored
 * value entirely.
 */
export function FoldLineEditor({
  feature,
  onDirection,
  onThickness,
}: {
  feature: FoldLine;
  onDirection: (next: FoldLine['direction']) => void;
  onThickness: (next: number | undefined) => void;
}) {
  return (
    <>
      <label className="field">
        <span className="field-label">Direction</span>
        <select
          data-testid="fold-direction"
          value={feature.direction}
          onChange={(event) => onDirection(event.target.value as FoldLine['direction'])}
        >
          <option value="valley">Valley</option>
          <option value="mountain">Mountain</option>
        </select>
      </label>
      <NumberField
        label="Thickness"
        value={feature.materialThicknessMm ?? null}
        placeholder="not set"
        // Leather has thickness. A typed 0 is clamped up rather than stored,
        // and "no override" is said by clearing the field, not by zero.
        min={0.1}
        step={0.2}
        onCommit={(mm) => onThickness(mm)}
        onClear={() => onThickness(undefined)}
      />
    </>
  );
}
