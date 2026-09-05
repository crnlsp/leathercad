import type { ParametricShape } from '@leathercad/domain';
import type { CornerRadii } from '@leathercad/geometry';

import { NumberField } from '../NumberField.js';

type Rect = Extract<ParametricShape, { type: 'rect' }>;

/** Position, size, and a radius per corner. */
export function RectEditor({ shape, onChange }: { shape: Rect; onChange: (shape: Rect) => void }) {
  const setRadius = (corner: keyof CornerRadii, value: number): void => {
    onChange({ ...shape, radii: { ...shape.radii, [corner]: value } });
  };

  return (
    <>
      <div className="field-pair">
        <NumberField
          label="X"
          value={shape.origin.x}
          onCommit={(x) => onChange({ ...shape, origin: { ...shape.origin, x } })}
        />
        <NumberField
          label="Y"
          value={shape.origin.y}
          onCommit={(y) => onChange({ ...shape, origin: { ...shape.origin, y } })}
        />
      </div>
      <div className="field-pair">
        <NumberField
          label="Width"
          value={shape.width}
          min={0.01}
          onCommit={(width) => onChange({ ...shape, width })}
        />
        <NumberField
          label="Height"
          value={shape.height}
          min={0.01}
          onCommit={(height) => onChange({ ...shape, height })}
        />
      </div>

      <NumberField
        label="Turn"
        value={(shape.rotation * 180) / Math.PI}
        suffix="°"
        step={5}
        precision={1}
        onCommit={(deg) => onChange({ ...shape, rotation: (deg * Math.PI) / 180 })}
      />

      <div className="panel-heading small">Corner radii</div>
      {/* Laid out to match the corners on screen: top row above, bottom below. */}
      <div className="field-pair">
        <NumberField
          label="↖"
          value={shape.radii.topLeft}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('topLeft', v)}
        />
        <NumberField
          label="↗"
          value={shape.radii.topRight}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('topRight', v)}
        />
      </div>
      <div className="field-pair">
        <NumberField
          label="↙"
          value={shape.radii.bottomLeft}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('bottomLeft', v)}
        />
        <NumberField
          label="↘"
          value={shape.radii.bottomRight}
          min={0}
          step={0.5}
          onCommit={(v) => setRadius('bottomRight', v)}
        />
      </div>
    </>
  );
}
