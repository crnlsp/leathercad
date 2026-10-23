import { useId, useMemo, useState } from 'react';
import {
  arrangeFeatures,
  arrangementRefusal,
  type DocumentStore,
  type ArrangeAxis,
  type ArrangeMode,
} from '@leathercad/document';
import type { Project } from '@leathercad/domain';

import { useI18n } from './i18n.js';
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
