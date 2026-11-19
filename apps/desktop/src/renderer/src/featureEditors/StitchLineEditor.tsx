import { useState } from 'react';
import type { Derivation, Problem } from '@leathercad/domain';

import { useCornerFocus } from '../cornerFocus.js';
import type { OpenSide } from '../offsetRun.js';
import { describeProblem } from '../problemText.js';
import { NumberField } from '../NumberField.js';
import { useI18n } from '../i18n.js';

type Offset = Extract<Derivation, { type: 'offset' }>;
type Between = Extract<Offset['run'], { kind: 'between' }>;

/**
 * How far from the edge the thread runs.
 *
 * The edge margin sets the inset; the run chooses the contour corners it
 * follows. Neither copies the edge: changing the outline moves the stitching
 * with it.
 *
 * **Edge margin**, not "inset", because the same number has to read correctly
 * round a cut-out: there the line runs *away* from the hole and into the
 * leather (D6), so it grows rather than shrinks. What the maker measures is
 * the margin of leather between the stitching and the edge, and that is the
 * same quantity either way round.
 *
 * On a rectangle square to the board the runs that leave one side open are
 * named for it — *Open at the top* — which is the choice a screen reader is
 * given too (Q48). The corners are numbered on the board while a corner field
 * has focus, so a run between any two of them is chosen by sight, not guessed.
 */
export function StitchLineEditor({
  op,
  onChange,
  anchors,
  sides,
  cornersOf,
  canChooseRun,
  refusal,
}: {
  op: Offset;
  onChange: (op: Offset) => void;
  anchors: readonly number[];
  /** The runs named by the side they leave open, or null when the outline has no sides to name. */
  sides: readonly (readonly [OpenSide, Between])[] | null;
  /** The outline whose corners the corner fields name. */
  cornersOf: string;
  canChooseRun: boolean;
  refusal: (op: Offset) => Problem | null;
}) {
  const { t } = useI18n();
  const focus = useCornerFocus(cornersOf);
  const [problem, setProblem] = useState<Problem | null>(null);
  const change = (next: Offset) => {
    const reason = refusal(next);
    setProblem(reason);
    if (reason === null) onChange(next);
  };
  const run = op.run;
  // Chosen by corners, it reads *Between corners* while the maker edits them,
  // even through a pair that is a named side: the select never jumps under
  // them. A run opened, or chosen by name, reads as its side.
  const [byCorners, setByCorners] = useState(false);
  const named = sides?.find(
    ([, side]) =>
      !byCorners &&
      run.kind === 'between' &&
      side.fromAnchor === run.fromAnchor &&
      side.toAnchor === run.toAnchor,
  );
  const cornerField = (value: number, label: string, update: (anchor: number) => void) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        aria-label={label}
        value={String(value)}
        {...focus}
        onChange={(event) => {
          const anchor = anchors.find((index) => String(index) === event.target.value);
          if (anchor !== undefined) update(anchor);
        }}
      >
        {!anchors.includes(value) && (
          <option value={String(value)}>{t('editor.run.corner', { number: value + 1 })}</option>
        )}
        {anchors.map((index) => (
          <option key={index} value={String(index)}>
            {t('editor.run.corner', { number: index + 1 })}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <NumberField
        label={t('editor.edgeMargin')}
        value={op.distanceMm}
        min={0.1}
        step={0.5}
        onCommit={(distanceMm) => change({ ...op, distanceMm })}
      />
      {canChooseRun && (
        <>
          <label className="field">
            <span className="field-label">{t('editor.run.label')}</span>
            <select
              data-testid="stitch-run"
              aria-label={t('editor.run.label')}
              value={named === undefined ? run.kind : `open-${named[0]}`}
              onChange={(event) => {
                setByCorners(event.target.value === 'between');
                const first = anchors[0];
                const second = anchors.at(-1);
                const side = sides?.find(([name]) => `open-${name}` === event.target.value);
                if (side !== undefined) change({ ...op, run: side[1] });
                else if (event.target.value === 'whole')
                  change({ ...op, run: { ...run, kind: 'whole' } });
                else if (first !== undefined && second !== undefined)
                  change({
                    ...op,
                    run: { ...run, kind: 'between', fromAnchor: first, toAnchor: second },
                  });
              }}
            >
              <option value="whole">{t('editor.run.whole')}</option>
              {sides?.map(([name]) => (
                <option key={name} value={`open-${name}`}>
                  {t(`editor.run.open.${name}`)}
                </option>
              ))}
              {(anchors.length > 1 || run.kind === 'between') && (
                <option value="between">{t('editor.run.between')}</option>
              )}
            </select>
          </label>
          {run.kind === 'between' && (
            <>
              {cornerField(run.fromAnchor, t('editor.run.from'), (anchor) =>
                change({ ...op, run: { ...run, fromAnchor: anchor } }),
              )}
              {cornerField(run.toAnchor, t('editor.run.to'), (anchor) =>
                change({ ...op, run: { ...run, toAnchor: anchor } }),
              )}
            </>
          )}
        </>
      )}
      {problem !== null && (
        <p className="reason" role="status" data-testid="stitch-run-refusal">
          {describeProblem(problem, t)}
        </p>
      )}
    </>
  );
}
