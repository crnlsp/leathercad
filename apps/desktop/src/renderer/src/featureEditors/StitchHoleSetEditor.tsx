import {
  MIN_HOLES_IN_A_SET,
  MIN_PITCH_MM,
  toothOfStyle,
  type Derivation,
  type Severity,
  type StitchHoles,
  type Tooth,
} from '@leathercad/domain';
import type { Iron } from '@leathercad/platform';

import { NumberField } from '../NumberField.js';
import { ironOf, shownTooth, slitRefusal, withIron, withTypedTooth } from '../irons.js';
import { useKeysInSentences } from '../keyCaps.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons/Icon.js';
import { SeverityGlyph } from '../SeverityGlyph.js';
import {
  SPACING_DECIMALS,
  describeSpacing,
  formatRuns,
  formatSpacing,
  spacingAgainstPitch,
  spacingGlyph,
} from '../spacing.js';

type HolesOp = Extract<Derivation, { type: 'stitch-holes' }>;

// Not iron ids: those are the maker's, and never empty or this.
const CUSTOM = '';
const THEIRS = '\u0000theirs';

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
  reported,
  irons,
  onChange,
}: {
  op: HolesOp;
  /** The maker's irons, from Settings › My tools (U.13): what the Iron menu offers. */
  irons: readonly Iron[];
  holes: StitchHoles | undefined;
  /** Problems' severity for this set's spacing, if it reports one. */
  reported: Severity | undefined;
  onChange: (op: HolesOp) => void;
}) {
  const { t } = useI18n();
  const iron = ironOf(irons, op.pitchMm, op.ironLabel);
  // An iron the maker does not have — a file from another bench — keeps its
  // name here rather than reading as Custom: the set was made with it.
  const theirs = iron === undefined && op.ironLabel !== undefined ? op.ironLabel : undefined;

  return (
    <>
      <label className="field">
        <span className="field-label">{t('editor.iron')}</span>
        <span className="field-input">
          <select
            data-testid="iron-preset"
            value={iron?.id ?? (theirs === undefined ? CUSTOM : THEIRS)}
            onChange={(event) => {
              const chosen = irons.find((each) => each.id === event.target.value);
              if (chosen === undefined) return;
              onChange(withIron(op, chosen));
            }}
          >
            {irons.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
            {theirs !== undefined && <option value={THEIRS}>{theirs}</option>}
            <option value={CUSTOM}>{t('editor.custom')}</option>
          </select>
        </span>
      </label>

      <NumberField
        label={t('editor.pitch')}
        value={op.pitchMm}
        // The domain's floor, so the field and evaluation refuse the same
        // pitches (5.6).
        min={MIN_PITCH_MM}
        step={0.05}
        // The Spacing readout's precision, which "matches" is decided at.
        precision={SPACING_DECIMALS}
        // Typing a pitch by hand means it is no longer that iron's pitch, so
        // the label goes with it rather than lying about where the number came
        // from.
        onCommit={(pitchMm) => {
          const { ironLabel: _dropped, ...rest } = op;
          onChange({ ...rest, pitchMm });
        }}
      />

      <ToothFields op={op} onChange={onChange} />

      <label className="field">
        <span className="field-label">{t('editor.fit')}</span>
        <span className="field-input">
          <select
            data-testid="hole-mode"
            value={op.mode}
            onChange={(event) => onChange({ ...op, mode: event.target.value as HolesOp['mode'] })}
          >
            <option value="fit-whole">{t('editor.holes.fit-whole')}</option>
            <option value="exact-pitch">{t('editor.holes.exact-pitch')}</option>
          </select>
        </span>
      </label>

      <label className="field">
        <span className="field-label">{t('editor.corners')}</span>
        <span className="field-input">
          <select
            data-testid="corner-policy"
            value={op.corners}
            onChange={(event) =>
              onChange({ ...op, corners: event.target.value as HolesOp['corners'] })
            }
          >
            <option value="hole-at-corner">{t('editor.holes.hole-at-corner')}</option>
            <option value="continuous">{t('editor.holes.continuous')}</option>
          </select>
        </span>
      </label>

      {holes !== undefined && (
        <>
          {/* The two numbers this panel is for — what gets punched, and how
              far apart it came out — at the size a number is read at, then
              whether that is the iron's pitch (R-05). A third line, hole
              matching or thread length, has room below when it comes. */}
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
            {holes.runs.length > 1 && (
              <div className="readout-cell wide">
                <span>{t('editor.runs')}</span>
                <b data-testid="hole-runs">{formatRuns(holes.runs)}</b>
              </div>
            )}
          </div>
          {/* Fewer than two holes have no spacing; Problems says so. */}
          {holes.count >= MIN_HOLES_IN_A_SET && (
            <SpacingLine
              spacingMm={holes.achievedPitchMm}
              pitchMm={op.pitchMm}
              reported={reported}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * The *Holes* row (9.26): the shape each tooth cuts — a slit's length, blade,
 * angle and lean, or a round prong's diameter — shown for every set, and typed
 * as a pitch is: a typed tooth is no longer the iron's. A set whose iron was
 * not said shows the French slit the board draws for it, and keeps no tooth
 * until one is typed (D26).
 */
function ToothFields({ op, onChange }: { op: HolesOp; onChange: (op: HolesOp) => void }) {
  const { t } = useI18n();
  const keys = useKeysInSentences();
  const words = { t, enter: keys['enter'] ?? '' };
  const tooth = shownTooth(op);
  const type = (next: Tooth): void => onChange(withTypedTooth(op, next));

  return (
    <>
      <label className="field">
        <span className="field-label">{t('editor.tooth.holes')}</span>
        <span className="field-input">
          <select
            data-testid="tooth-shape"
            value={tooth.kind}
            onChange={(event) =>
              type(toothOfStyle(event.target.value === 'round' ? 'round' : 'french', op.pitchMm))
            }
          >
            <option value="slit">{t('editor.tooth.slit')}</option>
            <option value="round">{t('editor.tooth.round')}</option>
          </select>
        </span>
      </label>
      {tooth.kind === 'round' ? (
        <NumberField
          label={t('editor.diameter')}
          value={tooth.diameterMm}
          min={0.05}
          step={0.1}
          onCommit={(diameterMm) => type({ ...tooth, diameterMm })}
        />
      ) : (
        <>
          <NumberField
            label={t('editor.tooth.length')}
            value={tooth.lengthMm}
            min={0.05}
            step={0.05}
            refuse={(lengthMm) => slitRefusal(lengthMm, op.pitchMm, words)}
            onCommit={(lengthMm) => type({ ...tooth, lengthMm })}
          />
          <NumberField
            label={t('editor.tooth.blade')}
            value={tooth.widthMm}
            min={0.05}
            step={0.05}
            onCommit={(widthMm) => type({ ...tooth, widthMm })}
          />
          <NumberField
            label={t('editor.tooth.angle')}
            value={Math.abs(tooth.slantDeg)}
            min={0}
            step={1}
            suffix="°"
            precision={1}
            onCommit={(angle) => type({ ...tooth, slantDeg: tooth.slantDeg < 0 ? -angle : angle })}
          />
          <label className="field">
            <span className="field-label">{t('editor.tooth.lean')}</span>
            <span className="field-input">
              <select
                data-testid="tooth-lean"
                value={tooth.slantDeg < 0 ? 'inverse' : 'standard'}
                onChange={(event) => {
                  const angle = Math.abs(tooth.slantDeg);
                  type({ ...tooth, slantDeg: event.target.value === 'inverse' ? -angle : angle });
                }}
              >
                <option value="standard">{t('editor.tooth.standard')}</option>
                <option value="inverse">{t('editor.tooth.inverse')}</option>
              </select>
            </span>
          </label>
          {/* No check that stacked pieces' slits cross: that needs layers (D28). */}
          <p className="panel-note">{t('editor.tooth.stacked')}</p>
        </>
      )}
    </>
  );
}

/**
 * Spacing against the pitch in one line, with its glyph — the shape says it as
 * well as the words (R-05): a check when it matches; which way it went when it
 * does not; the warning glyph only when Problems warns about this set too
 * (`spacingGlyph`).
 */
function SpacingLine({
  spacingMm,
  pitchMm,
  reported,
}: {
  spacingMm: number;
  pitchMm: number;
  reported: Severity | undefined;
}) {
  const { t } = useI18n();
  const check = spacingAgainstPitch(spacingMm, pitchMm);
  const glyph = spacingGlyph(check, reported);
  return (
    <p
      className="spacing-line"
      data-testid="spacing-line"
      data-check={check.kind}
      data-glyph={glyph}
    >
      {glyph === 'check' ? (
        <Icon of="check" size={14} />
      ) : glyph === 'stretched' ? (
        <Icon of="stretched" size={14} />
      ) : glyph === 'squeezed' ? (
        <Icon of="squeezed" size={14} />
      ) : (
        <SeverityGlyph severity={glyph} />
      )}
      {describeSpacing(check, t)}
    </p>
  );
}
