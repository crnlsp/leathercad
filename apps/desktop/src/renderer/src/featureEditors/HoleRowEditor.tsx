import { quantise } from '@leathercad/core';
import { MIN_PITCH_MM, type Derivation, type StitchHoles } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';
import { useI18n } from '../i18n.js';
import { SPACING_DECIMALS, formatSpacing } from '../spacing.js';

type RowOp = Extract<Derivation, { type: 'hole-row' }>;

/**
 * A row of holes (4.14): how far apart, how big, and what that came out as.
 *
 * The diameter is asked for and the radius stored, as a hardware hole's is —
 * halved, then quantised, so the stored number lands on the storage grid.
 * There is no iron: the holes are punched, and the pitch is the maker's.
 */
export function HoleRowEditor({
  op,
  holes,
  onChange,
}: {
  op: RowOp;
  holes: StitchHoles | undefined;
  onChange: (op: RowOp) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <NumberField
        label={t('editor.pitch')}
        value={op.pitchMm}
        // The hole set's floor, which evaluation refuses under too (5.6).
        min={MIN_PITCH_MM}
        precision={SPACING_DECIMALS}
        onCommit={(pitchMm) => onChange({ ...op, pitchMm })}
      />
      <NumberField
        label={t('editor.diameter')}
        value={op.radiusMm * 2}
        min={0.01}
        onCommit={(diameter) => onChange({ ...op, radiusMm: quantise(diameter / 2) })}
      />
      {holes !== undefined && (
        <div className="readouts">
          <div className="readout-cell">
            <span>{t('editor.holeCount')}</span>
            <b data-testid="hole-count">{holes.count}</b>
          </div>
          <div className="readout-cell">
            <span>{t('editor.spacing')}</span>
            <b data-testid="achieved-spacing">
              {formatSpacing(holes.achievedPitchMm)} <span className="readout-unit">mm</span>
            </b>
          </div>
        </div>
      )}
    </>
  );
}
