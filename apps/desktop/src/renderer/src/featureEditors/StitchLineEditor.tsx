import type { Derivation } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';

type Offset = Extract<Derivation, { type: 'offset' }>;

/**
 * How far in from the edge the thread runs.
 *
 * One number, because that is the whole relationship: the stitch line is not a
 * copy of the outline, it is "3.5 mm inside it", and changing the outline
 * moves this with it.
 */
export function StitchLineEditor({ op, onChange }: { op: Offset; onChange: (op: Offset) => void }) {
  return (
    <NumberField
      label="Inset"
      value={op.distanceMm}
      min={0.1}
      step={0.5}
      onCommit={(distanceMm) => onChange({ ...op, distanceMm })}
    />
  );
}
