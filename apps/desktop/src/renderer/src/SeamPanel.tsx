import { removeSeam, type DocumentStore } from '@leathercad/document';
import {
  seamVerdict,
  type Project,
  type Seam,
  type SeamAnchor,
  type SeamSide,
} from '@leathercad/domain';
import { useEffect, useRef } from 'react';

import { useI18n } from './i18n.js';
import { describeProblem } from './problemText.js';
import { SeverityGlyph } from './SeverityGlyph.js';
import {
  seamStretchName,
  defaultSide,
  holeSets,
  seamAnchors,
  stretchChoices,
  type SeamWorkflow,
} from './seams.js';

/** One reading shared by Properties, the live preview and the selection bar. */
export function SeamReading({ project, seam }: { project: Project; seam: Seam }) {
  const { t, locale } = useI18n();
  const verdict = seamVerdict(project, seam);
  if (!verdict.ok)
    return (
      <span data-testid="seam-verdict">
        <SeverityGlyph severity="error" /> {describeProblem(verdict.problem, t)}
      </span>
    );
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <span data-testid="seam-verdict" data-severity={verdict.severity}>
      {verdict.severity !== 'info' && <SeverityGlyph severity={verdict.severity} />}
      {t('seams.verdict', {
        a: verdict.countA,
        b: verdict.countB,
        relation: verdict.countA === verdict.countB ? '=' : '≠',
        drift: number.format(verdict.driftMm),
      })}
    </span>
  );
}

export function SeamPanel({
  store,
  project,
  selected,
  workflow,
  draft,
  onSew,
  onHighlight,
}: {
  store: DocumentStore;
  project: Project;
  selected: ReadonlySet<string>;
  workflow: SeamWorkflow;
  draft: ReturnType<SeamWorkflow['snapshot']>;
  onSew: (() => void) | null;
  onHighlight: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const panel = useRef<HTMLElement>(null);
  const draftId = draft?.seam.id;
  useEffect(() => {
    if (draftId !== undefined) panel.current?.querySelector<HTMLSelectElement>('select')?.focus();
  }, [draftId]);
  const sets = holeSets(project);
  const seams = (project.seams ?? []).filter(
    (s) =>
      selected.has(s.a.holeSetId) ||
      selected.has(s.b.holeSetId) ||
      !sets.some((h) => h.feature.id === s.a.holeSetId || h.feature.id === s.b.holeSetId),
  );
  if (draft === null && onSew === null && seams.length === 0) return null;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const name = (side: SeamSide) =>
    sets.find((h) => h.feature.id === side.holeSetId)?.part.name ?? t('seams.missing');
  const verdict = draft === null ? null : seamVerdict(project, draft.seam);
  return (
    <section
      ref={panel}
      className="panel-section"
      data-testid="seam-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && draft !== null) {
          event.stopPropagation();
          workflow.cancel();
        }
      }}
    >
      <h3 className="panel-heading">{t('seams.title')}</h3>
      {draft !== null ? (
        <>
          {(['a', 'b'] as const).map((key) => (
            <SeamSideFields
              key={key}
              project={project}
              side={draft.seam[key]}
              label={t(key === 'a' ? 'seams.sideA' : 'seams.sideB')}
              canFollow={draft.seam[key === 'a' ? 'b' : 'a'].stretch.kind !== 'from'}
              onChange={(side) => workflow.update({ ...draft.seam, [key]: side })}
            />
          ))}
          <p aria-live="polite">
            <SeamReading project={project} seam={draft.seam} />
          </p>
          {verdict?.ok === true && (
            <p className="panel-note" data-testid="seam-lengths">
              {t('seams.lengths', {
                a: number.format(verdict.lengthA),
                b: number.format(verdict.lengthB),
                pair: verdict.worstPair ?? 0,
              })}
            </p>
          )}
          <div className="toolbar">
            <button
              className="tool"
              type="button"
              data-testid="seam-commit"
              disabled={verdict?.ok !== true}
              onClick={() => workflow.commit()}
            >
              {t(draft.editing ? 'seams.save' : 'seams.sew')}
            </button>
            <button
              className="tool"
              type="button"
              data-testid="seam-cancel"
              onClick={() => workflow.cancel()}
            >
              {t('seams.cancel')}
            </button>
          </div>
        </>
      ) : (
        <>
          {onSew !== null && (
            <button className="tool" type="button" data-testid="sew-together" onClick={onSew}>
              {t('seams.make')}
            </button>
          )}
          {seams.map((seam) => (
            <div className="panel-group" key={seam.id} data-testid="seam-row">
              <p>{t('seams.partners', { a: name(seam.a), b: name(seam.b) })}</p>
              <p className="panel-note">
                {seamStretchName(seam.a.stretch, t)} · {seamStretchName(seam.b.stretch, t)}
              </p>
              <p>
                <SeamReading project={project} seam={seam} />
              </p>
              <div className="toolbar">
                <button className="tool" type="button" onClick={() => onHighlight(seam.id)}>
                  {t('seams.show')}
                </button>
                <button
                  className="tool"
                  type="button"
                  data-testid="seam-edit"
                  onClick={() => workflow.open(seam, true)}
                >
                  {t('seams.edit')}
                </button>
                <button
                  className="tool danger"
                  type="button"
                  data-testid="seam-unsew"
                  onClick={() => store.dispatch(removeSeam(seam.id))}
                >
                  {t('seams.unsew')}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function SeamSideFields({
  project,
  side,
  label,
  canFollow,
  onChange,
}: {
  project: Project;
  side: SeamSide;
  label: string;
  canFollow: boolean;
  onChange: (side: SeamSide) => void;
}) {
  const { t, locale } = useI18n();
  const choices = stretchChoices(project, side.holeSetId);
  const anchors = seamAnchors(project, side.holeSetId);
  const sets = holeSets(project);
  const selected = choices.findIndex(
    (c) => JSON.stringify(c.stretch) === JSON.stringify(side.stretch),
  );
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const stretch = side.stretch;
  const anchorLabel = (a: SeamAnchor) =>
    typeof a === 'number' ? t('seams.corner', { number: a + 1 }) : t(`seams.${a}`);
  const anchorField = (
    value: SeamAnchor,
    fieldLabel: string,
    change: (anchor: SeamAnchor) => void,
  ) => (
    <label className="field">
      <span className="field-label">{fieldLabel}</span>
      <select
        aria-label={fieldLabel}
        value={String(value)}
        onChange={(e) => {
          const chosen = anchors.find((a) => String(a) === e.target.value);
          if (chosen !== undefined) change(chosen);
        }}
      >
        {!anchors.includes(value) && <option value={String(value)}>{anchorLabel(value)}</option>}
        {anchors.map((a) => (
          <option key={a} value={String(a)}>
            {anchorLabel(a)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <fieldset className="field-group" data-testid="seam-side">
      <legend>{label}</legend>
      <label className="field">
        <span className="field-label">{t('seams.holes')}</span>
        <select
          data-testid="seam-holes"
          aria-label={t('seams.holes')}
          value={side.holeSetId}
          onChange={(e) => onChange({ ...side, ...defaultSide(project, e.target.value) })}
        >
          {!sets.some((h) => h.feature.id === side.holeSetId) && (
            <option value={side.holeSetId}>{t('seams.missing')}</option>
          )}
          {sets.map(({ part, feature }) => (
            <option key={feature.id} value={feature.id}>
              {part.name} › {feature.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{t('seams.where')}</span>
        <select
          data-testid="seam-where"
          aria-label={t('seams.where')}
          value={selected < 0 ? stretch.kind : String(selected)}
          onChange={(e) => {
            const value = e.target.value;
            const first = anchors[0] ?? 'start';
            const next =
              value === 'from'
                ? ({ kind: 'from', anchor: first, toward: 'next' } as const)
                : value === 'between'
                  ? ({
                      kind: 'between',
                      fromAnchor: first,
                      toAnchor: anchors.at(-1) ?? 'end',
                    } as const)
                  : choices[Number(value)]?.stretch;
            if (next !== undefined) onChange({ ...side, stretch: next });
          }}
        >
          {choices.map((choice, i) => (
            <option key={i} value={String(i)}>
              {t('seams.run', {
                name: seamStretchName(choice.stretch, t),
                length: number.format(choice.lengthMm ?? 0),
                count: choice.count ?? 0,
              })}
            </option>
          ))}
          <option value="between">{t('seams.customBetween')}</option>
          <option value="from" disabled={!canFollow}>
            {t('seams.customFrom')}
          </option>
        </select>
      </label>
      {stretch.kind === 'between' && (
        <>
          {anchorField(stretch.fromAnchor, t('seams.fromAnchor'), (anchor) =>
            onChange({ ...side, stretch: { ...stretch, fromAnchor: anchor } }),
          )}
          {anchorField(stretch.toAnchor, t('seams.toAnchor'), (anchor) =>
            onChange({ ...side, stretch: { ...stretch, toAnchor: anchor } }),
          )}
        </>
      )}
      {stretch.kind === 'from' && (
        <>
          {anchorField(stretch.anchor, t('seams.fromAnchor'), (anchor) =>
            onChange({ ...side, stretch: { ...stretch, anchor } }),
          )}
          <label className="field">
            <span className="field-label">{t('seams.direction')}</span>
            <select
              aria-label={t('seams.direction')}
              value={stretch.toward}
              onChange={(e) =>
                onChange({
                  ...side,
                  stretch: {
                    ...stretch,
                    toward: e.target.value === 'previous' ? 'previous' : 'next',
                  },
                })
              }
            >
              <option value="next">{t('seams.next')}</option>
              <option value="previous">{t('seams.previous')}</option>
            </select>
          </label>
        </>
      )}
    </fieldset>
  );
}
