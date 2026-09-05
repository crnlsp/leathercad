import { quantise } from '@leathercad/core';
import type { ParametricShape } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';

type Circle = Extract<ParametricShape, { type: 'circle' }>;

/**
 * Centre and diameter.
 *
 * The record stores a radius; the panel asks for a diameter, because that is
 * the number stamped on a punch and printed in a hardware catalogue — the same
 * reason `domain-model.md` gives round holes a diameter rather than a path.
 *
 * Quantising again after halving matters: `NumberField` lands the diameter on
 * the storage grid, and half of a grid value is not necessarily on it.
 */
export function CircleEditor({
  shape,
  onChange,
}: {
  shape: Circle;
  onChange: (shape: Circle) => void;
}) {
  return (
    <>
      <div className="field-pair">
        <NumberField
          label="X"
          value={shape.centre.x}
          onCommit={(x) => onChange({ ...shape, centre: { ...shape.centre, x } })}
        />
        <NumberField
          label="Y"
          value={shape.centre.y}
          onCommit={(y) => onChange({ ...shape, centre: { ...shape.centre, y } })}
        />
      </div>
      <NumberField
        label="Diameter"
        value={shape.radius * 2}
        min={0.01}
        onCommit={(diameter) => onChange({ ...shape, radius: quantise(diameter / 2) })}
      />
    </>
  );
}
