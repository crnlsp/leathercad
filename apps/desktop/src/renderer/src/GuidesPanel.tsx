import { formatNumber } from '@leathercad/core';
import { addGuide, deleteGuide, setGuide, type DocumentStore } from '@leathercad/document';
import type { Project } from '@leathercad/domain';

import { NumberField } from './NumberField.js';
import { useI18n } from './i18n.js';

export function GuidesPanel({
  store,
  project,
  nextId,
}: {
  store: DocumentStore;
  project: Project;
  nextId: () => string;
}) {
  const { t } = useI18n();
  const selected = store.getState().selection.guide;
  const guides = project.guides ?? [];
  const picked = guides.find((guide) => guide.id === selected);
  const add = (angleRad: number) => {
    const id = nextId();
    store.dispatch(addGuide({ id, origin: { x: 0, y: 0 }, angleRad }));
    store.selectGuide(id);
  };
  return (
    <section className="panel-section" data-testid="guides-panel">
      <h3 className="panel-heading">{t('guides.title')}</h3>
      <p className="panel-note">{t('guides.help')}</p>
      <div className="guide-actions">
        <button className="tool" data-testid="guide-add-horizontal" onClick={() => add(0)}>
          {t('guides.horizontal')}
        </button>
        <button className="tool" data-testid="guide-add-vertical" onClick={() => add(Math.PI / 2)}>
          {t('guides.vertical')}
        </button>
      </div>
      {guides.length > 0 && (
        <div className="guide-list">
          {guides.map((guide, index) => (
            <button
              className="tool"
              key={guide.id}
              data-testid={`guide-${guide.id}`}
              aria-pressed={guide.id === selected}
              onClick={() => store.selectGuide(guide.id)}
            >
              {t('guides.item', { number: formatNumber(index + 1, 0) })}
            </button>
          ))}
        </div>
      )}
      {picked !== undefined && (
        <div data-testid="guide-editor">
          <NumberField
            label={t('guides.x')}
            value={picked.origin.x}
            onCommit={(x) =>
              store.dispatch(setGuide({ ...picked, origin: { ...picked.origin, x } }))
            }
          />
          <NumberField
            label={t('guides.y')}
            value={picked.origin.y}
            onCommit={(y) =>
              store.dispatch(setGuide({ ...picked, origin: { ...picked.origin, y } }))
            }
          />
          <NumberField
            label={t('guides.angle')}
            value={(picked.angleRad * 180) / Math.PI}
            suffix="°"
            step={15}
            onCommit={(degrees) =>
              store.dispatch(setGuide({ ...picked, angleRad: (degrees * Math.PI) / 180 }))
            }
          />
          <button
            className="tool danger"
            data-testid="guide-delete"
            onClick={() => store.dispatch(deleteGuide(picked.id))}
          >
            {t('guides.delete')}
          </button>
        </div>
      )}
    </section>
  );
}
