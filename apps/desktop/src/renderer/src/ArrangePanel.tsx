import { approxZero } from '@leathercad/core';
import { useId, useMemo, useState } from 'react';
import {
  arrangeFeatures,
  arrangementRefusal,
  moveFeaturesBy,
  moveRefusal,
  placeFeatures,
  selectionBox,
  type DocumentStore,
  type ArrangeAxis,
  type ArrangeMode,
} from '@leathercad/document';
import type { Project } from '@leathercad/domain';

import { useI18n } from './i18n.js';
import { NumberField } from './NumberField.js';
import { describeProblem } from './problemText.js';

const AXES: readonly ArrangeAxis[] = ['x', 'y'];
const MODES: readonly ArrangeMode[] = ['min', 'centre', 'max', 'distribute'];

export function ArrangePanel({
  store,
  project,
  ids,
}: {
  store: DocumentStore;
  project: Project;
  ids: readonly string[];
}) {
  const { t } = useI18n();
  const reasonId = useId();
  // The eight checks cost a few milliseconds on a large selection, and a drag
  // makes a new project on every pointer move. Nothing here can be pressed
  // mid-gesture, so they are asked again only once it settles — the same hold
  // the project bar's counts keep.
  const key = ids.join(' ');
  const [checked, setChecked] = useState({ project, key, ids });
  if (!store.inTransaction && (checked.project !== project || checked.key !== key))
    setChecked({ project, key, ids });
  const refusals = useMemo(
    () =>
      new Map(
        AXES.flatMap((axis) =>
          MODES.map((mode) => [
            `${axis}-${mode}`,
            arrangementRefusal(checked.project, checked.ids, axis, mode),
          ]),
        ),
      ),
    [checked],
  );
  return (
    <section className="panel-section" data-testid="arrange-panel">
      <h3 className="panel-heading">{t('arrange.title')}</h3>
      <p className="panel-note">{t('arrange.help')}</p>
      <PositionFields store={store} project={project} ids={ids} />
      {AXES.map((axis) => (
        <div key={axis} className="arrange-actions">
          {MODES.map((mode) => {
            const refusal = refusals.get(`${axis}-${mode}`) ?? null;
            const reason =
              refusal === null
                ? null
                : refusal.kind === 'transform'
                  ? describeProblem(refusal.problem, t)
                  : refusal.kind === 'count'
                    ? t('arrange.reason.count', { count: refusal.minimum })
                    : t(`arrange.reason.${refusal.kind}`);
            const id = `${reasonId}-${axis}-${mode}`;
            return (
              <div key={mode}>
                <button
                  className="tool"
                  data-testid={`arrange-${axis}-${mode}`}
                  disabled={reason !== null}
                  aria-describedby={reason === null ? undefined : id}
                  onClick={() => store.dispatch(arrangeFeatures(ids, axis, mode))}
                >
                  {t(`arrange.${axis}.${mode}`)}
                </button>
                {reason !== null && (
                  <p id={id} className="reason">
                    {reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/**
 * Where the selection is, typed (3.15, smart-guides spec §4): its box's X and
 * Y, named Left and Bottom for the edge each is — as the rulers read them, Y up
 * — and kept apart by name from a shape's own X and Y in the same panel; and
 * Move by, a distance right and up, so −12 goes left.
 *
 * Two groups rather than one field taking a `+`, because −12 is as much a
 * place as a move. Each is one command and one undo step; the fields take the
 * sums and units every length field takes, and quantise them (U.15).
 */
export function PositionFields({
  store,
  project,
  ids,
}: {
  store: DocumentStore;
  project: Project;
  ids: readonly string[];
}) {
  const { t } = useI18n();
  const reasonId = useId();
  // What is typed to move by is the field's own until Move uses it, and stays
  // there after, so a second Move goes as far again.
  const [by, setBy] = useState({ x: 0, y: 0 });
  const box = selectionBox(project, ids);
  if (box === null) return null;
  const refusal = moveRefusal(project, ids);
  const describedBy = refusal === null ? undefined : reasonId;
  return (
    <div className="position-fields" data-testid="position-fields">
      {refusal !== null && (
        <p id={reasonId} className="reason" data-testid="position-reason">
          {describeProblem(refusal, t)}
        </p>
      )}
      <fieldset className="field-group" disabled={refusal !== null} aria-describedby={describedBy}>
        <legend className="panel-heading small">{t('arrange.position')}</legend>
        <div className="field-pair">
          <NumberField
            label={t('arrange.left')}
            value={box.minX}
            onCommit={(x) => store.dispatch(placeFeatures(ids, 'x', x))}
          />
          <NumberField
            label={t('arrange.bottom')}
            value={box.minY}
            onCommit={(y) => store.dispatch(placeFeatures(ids, 'y', y))}
          />
        </div>
      </fieldset>
      <fieldset className="field-group" disabled={refusal !== null} aria-describedby={describedBy}>
        <legend className="panel-heading small">{t('arrange.moveBy')}</legend>
        <div className="field-pair">
          <NumberField
            label={t('arrange.right')}
            value={by.x}
            onCommit={(x) => setBy({ ...by, x })}
          />
          <NumberField label={t('arrange.up')} value={by.y} onCommit={(y) => setBy({ ...by, y })} />
        </div>
        <button
          className="tool"
          data-testid="move-by"
          disabled={approxZero(by.x) && approxZero(by.y)}
          onClick={() => store.dispatch(moveFeaturesBy(ids, by))}
        >
          {t('arrange.move')}
        </button>
      </fieldset>
    </div>
  );
}
