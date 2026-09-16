import type { Derivation, StitchHoles } from '@leathercad/domain';

import { NumberField } from '../NumberField.js';
import { IRON_PRESETS, presetForPitch } from '../irons.js';

type HolesOp = Extract<Derivation, { type: 'stitch-holes' }>;

/**
 * The iron, the policy, and what they actually produced.
 *
 * The readouts are the point of the panel as much as the inputs are. "How many
 * holes did that give me, and did the spacing come out near my iron" is a
 * question asked on every project, and answering it is the reason this is not
 * a vector editor.
 */
export function StitchHoleSetEditor({
  op,
  holes,
  onChange,
}: {
  op: HolesOp;
  holes: StitchHoles | undefined;
  onChange: (op: HolesOp) => void;
}) {
  const preset = presetForPitch(op.pitchMm, op.ironLabel);

  return (
    <>
      <label className="field">
        <span className="field-label">Iron</span>
        <span className="field-input">
          <select
            data-testid="iron-preset"
            value={preset?.id ?? ''}
            onChange={(event) => {
              const chosen = IRON_PRESETS.find((iron) => iron.id === event.target.value);
              if (chosen === undefined) return;
              onChange({ ...op, pitchMm: chosen.pitchMm, ironLabel: chosen.label });
            }}
          >
            <option value="">Custom</option>
            {IRON_PRESETS.map((iron) => (
              <option key={iron.id} value={iron.id}>
                {iron.label}
              </option>
            ))}
          </select>
        </span>
      </label>

      <NumberField
        label="Pitch"
        value={op.pitchMm}
        min={0.5}
        step={0.05}
        precision={2}
        // Typing a pitch by hand means it is no longer that iron's pitch, so
        // the label goes with it rather than lying about where the number came
        // from.
        onCommit={(pitchMm) => {
          const { ironLabel: _dropped, ...rest } = op;
          onChange({ ...rest, pitchMm });
        }}
      />

      <label className="field">
        <span className="field-label">Fit</span>
        <span className="field-input">
          <select
            data-testid="hole-mode"
            value={op.mode}
            onChange={(event) => onChange({ ...op, mode: event.target.value as HolesOp['mode'] })}
          >
            <option value="fit-whole">Even, whole number</option>
            <option value="exact-pitch">Exactly this pitch</option>
          </select>
        </span>
      </label>

      <label className="field">
        <span className="field-label">Corners</span>
        <span className="field-input">
          <select
            data-testid="corner-policy"
            value={op.corners}
            onChange={(event) =>
              onChange({ ...op, corners: event.target.value as HolesOp['corners'] })
            }
          >
            <option value="hole-at-corner">A hole on each corner</option>
            <option value="continuous">Continuous</option>
          </select>
        </span>
      </label>

      {holes !== undefined && (
        <>
          <div className="readout">
            <span>Holes</span>
            <b data-testid="hole-count">{holes.count}</b>
          </div>
          <div className="readout">
            <span>Spacing</span>
            <b data-testid="achieved-spacing">{holes.achievedPitchMm.toFixed(2)} mm</b>
          </div>
          {holes.runs.length > 1 && (
            <div className="readout">
              <span>Runs</span>
              <b>{holes.runs.map((run) => run.count).join(' · ')}</b>
            </div>
          )}
        </>
      )}
    </>
  );
}
