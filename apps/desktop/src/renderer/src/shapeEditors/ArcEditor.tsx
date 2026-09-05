import type { ParametricShape } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';

type Arc = Extract<ParametricShape, { type: 'arc' }>;

const DEG = 180 / Math.PI;

/**
 * Centre, radius, and the two angles that place the run on its circle.
 *
 * Degrees in the panel, radians in the record. Nobody describes a strap end as
 * 3.14 radians, and `quantise()` is a millimetre grid that does not apply to an
 * angle — so the conversion is a plain multiply and only the radius lands on
 * the storage grid, which `NumberField` already does.
 *
 * Sweep rather than an end angle, matching what is stored: it is signed, so its
 * sign is the direction the arc bends, and a reflex value is a long way round
 * rather than an ambiguity.
 */
export function ArcEditor({ shape, onChange }: { shape: Arc; onChange: (shape: Arc) => void }) {
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
        label="Radius"
        value={shape.radius}
        min={0.01}
        onCommit={(radius) => onChange({ ...shape, radius })}
      />
      <div className="field-pair">
        <NumberField
          label="Start"
          value={shape.startAngle * DEG}
          suffix="°"
          step={5}
          precision={1}
          onCommit={(deg) => onChange({ ...shape, startAngle: deg / DEG })}
        />
        <NumberField
          label="Sweep"
          value={shape.sweepAngle * DEG}
          suffix="°"
          step={5}
          precision={1}
          onCommit={(deg) => onChange({ ...shape, sweepAngle: deg / DEG })}
        />
      </div>
    </>
  );
}
