import { useId } from 'react';
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
  return (
    <section className="panel-section" data-testid="arrange-panel">
      <h3 className="panel-heading">{t('arrange.title')}</h3>
      <p className="panel-note">{t('arrange.help')}</p>
      {(['x', 'y'] as const).map((axis: ArrangeAxis) => (
        <div key={axis} className="arrange-actions">
          {(['min', 'centre', 'max', 'distribute'] as const).map((mode: ArrangeMode) => {
            const refusal = arrangementRefusal(project, ids, axis, mode);
            const reason =
              refusal === null
                ? null
                : refusal.kind === 'transform'
                  ? describeProblem(refusal.problem, t)
                  : t(`arrange.reason.${refusal.kind}`, {
                      count: refusal.kind === 'count' ? refusal.minimum : 0,
                    });
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
