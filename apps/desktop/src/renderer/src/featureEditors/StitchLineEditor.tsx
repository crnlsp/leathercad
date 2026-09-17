import type { Derivation } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';

type Offset = Extract<Derivation, { type: 'offset' }>;

/**
 * How far from the edge the thread runs.
 *
 * One number, because that is the whole relationship: the stitch line is not a
 * copy of the edge it follows, it is "3.5 mm in from it", and moving the edge
 * moves this with it.
 *
 * **Edge margin**, not "inset", because the same number has to read correctly
 * round a cut-out: there the line runs *away* from the hole and into the
 * leather (D6), so it grows rather than shrinks. What the maker measures is
 * the margin of leather between the stitching and the edge, and that is the
 * same quantity either way round.
 */
export function StitchLineEditor({ op, onChange }: { op: Offset; onChange: (op: Offset) => void }) {
  return (
    <NumberField
      label="Edge margin"
      value={op.distanceMm}
      min={0.1}
      step={0.5}
      onCommit={(distanceMm) => onChange({ ...op, distanceMm })}
    />
  );
}
