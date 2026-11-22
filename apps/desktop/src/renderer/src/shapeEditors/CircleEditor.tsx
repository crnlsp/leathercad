import { quantise } from '@leathercad/core';
import type { ParametricShape } from '@leathercad/domain';

import { useI18n } from '../i18n.js';
import { NumberField } from '../NumberField.js';

type Circle = Extract<ParametricShape, { type: 'circle' }>;

/**
 * Its diameter — where it is, *Arrange* says (QA U9).
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
  const { t } = useI18n();
  return (
    <>
      <NumberField
        label={t('editor.diameter')}
        value={shape.radius * 2}
        min={0.01}
        onCommit={(diameter) => onChange({ ...shape, radius: quantise(diameter / 2) })}
      />
    </>
  );
}
