import type { MeasureSource } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';

/**
 * The two things about a dimension the maker chooses.
 *
 * Not the value: that is read from the model on every evaluation, which is the
 * whole reason a dimension is worth more than a typed label. And not what it
 * names — the ends are anchors chosen when it was drawn, and re-pointing one
 * is a different gesture from editing a number.
 */
export function MeasurementEditor({
  source,
  onChange,
}: {
  source: MeasureSource;
  onChange: (change: { offsetMm?: number; precision?: 0 | 1 | 2 }) => void;
}) {
  return (
    <>
      <NumberField
        label="Offset"
        value={source.offsetMm}
        step={1}
        onCommit={(offsetMm) => onChange({ offsetMm })}
      />
      <NumberField
        label="Decimals"
        value={source.precision}
        min={0}
        step={1}
        precision={0}
        // Clamped rather than validated: a dimension showing four decimals
        // of a millimetre is noise, and refusing the keystroke teaches nothing.
        onCommit={(value) =>
          onChange({ precision: Math.min(2, Math.max(0, Math.round(value))) as 0 | 1 | 2 })
        }
      />
    </>
  );
}
