import type { ParametricShape } from '@leathercad/domain';
import { cornerRoom, type CornerRadii } from '@leathercad/geometry';

import { useI18n } from '../i18n.js';
import { useKeysInSentences } from '../keyCaps.js';
import { NumberField } from '../NumberField.js';
import { cornerRefusal, type Refusal } from '../outlineSizes.js';

type Rect = Extract<ParametricShape, { type: 'rect' }>;

/**
 * Position, size, and a radius per corner. A corner larger than the corners
 * beside it leave is refused, with the largest that fits to take instead, as
 * the chips on the board refuse it (U.14): stored, it would never be drawn.
 */
export function RectEditor({ shape, onChange }: { shape: Rect; onChange: (shape: Rect) => void }) {
  const { t } = useI18n();
  const keys = useKeysInSentences();
  const setRadius = (corner: keyof CornerRadii, value: number): void => {
    onChange({ ...shape, radii: { ...shape.radii, [corner]: value } });
  };
  const refuse =
    (corner: keyof CornerRadii) =>
    (radius: number): Refusal | null =>
      cornerRefusal(cornerRoom(shape.width, shape.height, shape.radii, [corner]), radius, {
        t,
        enter: keys['enter'] ?? '',
      });

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
          label={t('editor.width')}
          value={shape.width}
          min={0.01}
          onCommit={(width) => onChange({ ...shape, width })}
        />
        <NumberField
          label={t('editor.height')}
          value={shape.height}
          min={0.01}
          onCommit={(height) => onChange({ ...shape, height })}
        />
      </div>

      <NumberField
        label={t('editor.turn')}
        value={(shape.rotation * 180) / Math.PI}
        suffix="°"
        step={5}
        precision={1}
        onCommit={(deg) => onChange({ ...shape, rotation: (deg * Math.PI) / 180 })}
      />

      <div className="panel-heading small">{t('editor.cornerRadii')}</div>
      {/* Laid out to match the corners on screen: top row above, bottom below. */}
      <div className="field-pair">
        <NumberField
          label="↖"
          value={shape.radii.topLeft}
          min={0}
          step={0.5}
          refuse={refuse('topLeft')}
          onCommit={(v) => setRadius('topLeft', v)}
        />
        <NumberField
          label="↗"
          value={shape.radii.topRight}
          min={0}
          step={0.5}
          refuse={refuse('topRight')}
          onCommit={(v) => setRadius('topRight', v)}
        />
      </div>
      <div className="field-pair">
        <NumberField
          label="↙"
          value={shape.radii.bottomLeft}
          min={0}
          step={0.5}
          refuse={refuse('bottomLeft')}
          onCommit={(v) => setRadius('bottomLeft', v)}
        />
        <NumberField
          label="↘"
          value={shape.radii.bottomRight}
          min={0}
          step={0.5}
          refuse={refuse('bottomRight')}
          onCommit={(v) => setRadius('bottomRight', v)}
        />
      </div>
    </>
  );
}
