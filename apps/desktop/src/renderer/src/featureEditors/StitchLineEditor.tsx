import { useState } from 'react';
import type { Derivation, Problem } from '@leathercad/domain';

import { describeProblem } from '../problemText.js';
import { NumberField } from '../NumberField.js';
import { useI18n } from '../i18n.js';

type Offset = Extract<Derivation, { type: 'offset' }>;

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
 */
export function StitchLineEditor({
  op,
  onChange,
  anchors,
  canChooseRun,
  refusal,
}: {
  op: Offset;
  onChange: (op: Offset) => void;
  anchors: readonly number[];
  canChooseRun: boolean;
  refusal: (op: Offset) => Problem | null;
}) {
  const { t } = useI18n();
  const [problem, setProblem] = useState<Problem | null>(null);
  const change = (next: Offset) => {
    const reason = refusal(next);
    setProblem(reason);
    if (reason === null) onChange(next);
  };
  const run = op.run;
  const cornerField = (value: number, label: string, update: (anchor: number) => void) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        aria-label={label}
        value={String(value)}
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
              value={run.kind}
              onChange={(event) => {
                const first = anchors[0];
                const second = anchors.at(-1);
                if (event.target.value === 'whole')
                  change({ ...op, run: { ...run, kind: 'whole' } });
                else if (first !== undefined && second !== undefined)
                  change({
                    ...op,
                    run: { ...run, kind: 'between', fromAnchor: first, toAnchor: second },
                  });
              }}
            >
              <option value="whole">{t('editor.run.whole')}</option>
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
